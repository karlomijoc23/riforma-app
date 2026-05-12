"""Verify the notification service no longer spams the same row daily.

Pre-fix behaviour: every 24h scheduler tick re-queried "expiring contracts"
and re-sent. A contract 30 days from expiry produced ~30 identical emails.

After fix: each row carries `last_*_notified_at`. The service filters out
anything notified within the cooldown window and stamps the rest after
the send loop completes.
"""
import os
import uuid
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

import pytest

os.environ.setdefault("AUTH_SECRET", "test-secret")
os.environ.setdefault("USE_IN_MEMORY_DB", "true")

from app.core.config import get_settings  # noqa: E402
from app.db.repositories.instance import (  # noqa: E402
    nekretnine as nekretnine_repo,
    racuni as racuni_repo,
    ugovori as ugovori_repo,
    users as users_repo,
    zakupnici as zakupnici_repo,
)
from app.db.tenant import CURRENT_TENANT_ID  # noqa: E402
from app.services import notification_service  # noqa: E402

settings = get_settings()


@pytest.fixture
def tenant_ctx(app_context):
    CURRENT_TENANT_ID.set(settings.DEFAULT_TENANT_ID)
    yield
    CURRENT_TENANT_ID.set(None)


async def _seed_expiring_contract(days_until_expiry=10, last_notified=None):
    n = await nekretnine_repo.create({
        "naziv": "Notif test",
        "adresa": "T1",
        "katastarska_opcina": "Zg",
        "broj_kat_cestice": "1",
        "vrsta": "poslovna_zgrada",
        "povrsina": 100.0,
        "godina_izgradnje": 2020,
        "vlasnik": "R",
        "udio_vlasnistva": "1/1",
    })
    z = await zakupnici_repo.create({
        "naziv_firme": "Z",
        "kontakt_email": "z@example.com",
    })
    today = date.today()
    return await ugovori_repo.create({
        "interna_oznaka": f"NOT-{uuid.uuid4().hex[:6]}",
        "nekretnina_id": n.id,
        "zakupnik_id": z.id,
        "datum_pocetka": today,
        "datum_zavrsetka": today + timedelta(days=days_until_expiry),
        "trajanje_mjeseci": 12,
        "osnovna_zakupnina": 1000.0,
        "status": "aktivno",
        "approval_status": "approved",
        "last_expiry_notified_at": last_notified,
    })


@pytest.mark.asyncio
async def test_first_run_stamps_last_expiry_notified_at(tenant_ctx):
    contract = await _seed_expiring_contract(days_until_expiry=10)
    assert contract.last_expiry_notified_at is None

    # Mock send_email so we don't actually need SMTP.
    with patch(
        "app.services.notification_service.send_email", new=_async_noop()
    ):
        await notification_service.notify_expiring_contracts()

    refreshed = await ugovori_repo.get_by_id(contract.id)
    assert refreshed.last_expiry_notified_at is not None


@pytest.mark.asyncio
async def test_recent_notification_is_skipped(tenant_ctx):
    """Contract notified yesterday must NOT trigger another email today."""
    yesterday = datetime.now(timezone.utc) - timedelta(days=1)
    await _seed_expiring_contract(
        days_until_expiry=10, last_notified=yesterday
    )

    # Need an admin recipient — without one the function exits before the
    # filter check, which would also pass but for the wrong reason.
    from app.core.security import hash_password
    await users_repo.create({
        "email": "owner@example.com",
        "password_hash": hash_password("dummy12345"),
        "full_name": "Owner",
        "role": "owner",
        "scopes": ["*"],
    })

    sent = []
    async def _capture(*a, **kw):
        sent.append(a)

    with patch(
        "app.services.notification_service.send_email", new=_capture
    ):
        await notification_service.notify_expiring_contracts()

    # Cooldown filter must keep this contract out of the batch.
    assert sent == [], (
        f"Expected no emails (cooldown active), but got {len(sent)} send(s)"
    )


@pytest.mark.asyncio
async def test_old_notification_allows_resend(tenant_ctx):
    """Contract notified 10 days ago (past 7-day cooldown) gets re-notified."""
    long_ago = datetime.now(timezone.utc) - timedelta(days=10)
    contract = await _seed_expiring_contract(
        days_until_expiry=10, last_notified=long_ago
    )

    from app.core.security import hash_password
    await users_repo.create({
        "email": "owner@example.com",
        "password_hash": hash_password("dummy12345"),
        "full_name": "Owner",
        "role": "owner",
        "scopes": ["*"],
    })

    sent = []
    async def _capture(*a, **kw):
        sent.append(a)

    with patch(
        "app.services.notification_service.send_email", new=_capture
    ):
        await notification_service.notify_expiring_contracts()

    # At least one email — there may be multiple admin recipients
    # (test fixture seeds an admin too).
    assert len(sent) >= 1, "Past-cooldown contract must trigger an email"

    refreshed = await ugovori_repo.get_by_id(contract.id)
    assert refreshed.last_expiry_notified_at is not None
    # Stamp moved forward into the recent window — within the last minute.
    delta = datetime.now(timezone.utc) - refreshed.last_expiry_notified_at.replace(
        tzinfo=timezone.utc
    )
    assert delta < timedelta(minutes=1)


def _async_noop():
    async def _impl(*args, **kwargs):
        return None
    return _impl
