import logging
from datetime import date, timedelta
from html import escape

from app.core.email import send_email
from app.db.repositories.instance import ugovori, racuni, maintenance_tasks, users
from app.models.tables import UgovoriRow, RacuniRow, MaintenanceTaskRow, UserRow

logger = logging.getLogger(__name__)


async def notify_expiring_contracts():
    """Send notifications for contracts expiring within 30 days."""
    today = date.today()
    warning_date = (today + timedelta(days=30)).isoformat()
    today_str = today.isoformat()

    expiring = await ugovori.find_all(extra_conditions=[
        UgovoriRow.status.in_(["aktivno", "na_isteku"]),
        UgovoriRow.datum_zavrsetka >= today_str,
        UgovoriRow.datum_zavrsetka <= warning_date,
    ])

    if not expiring:
        logger.info("No expiring contracts to notify about.")
        return

    # Get admin users for notification
    admins = await users.find_all(extra_conditions=[
        UserRow.role.in_(["owner", "admin"]),
    ])

    _td = "padding:8px;border-bottom:1px solid #e2e8f0"
    _hdr_s = "background:#1e293b;color:white;padding:20px;" "border-radius:8px 8px 0 0"
    _body_s = (
        "padding:20px;background:#f8fafc;"
        "border:1px solid #e2e8f0;border-radius:0 0 8px 8px"
    )
    _wrap_s = "font-family:sans-serif;max-width:600px;margin:0 auto"

    for admin in admins:
        email = admin.email
        if not email:
            continue

        contracts_html = ""
        for c in expiring:
            oznaka = escape(str(c.interna_oznaka or "N/A"))
            datum = escape(str(c.datum_zavrsetka) if c.datum_zavrsetka else "N/A")
            zakup = c.osnovna_zakupnina or 0
            contracts_html += (
                f'<tr><td style="{_td}">{oznaka}</td>'
                f'<td style="{_td}">{datum}</td>'
                f'<td style="{_td}">{zakup:.2f} </td></tr>'
            )

        html = f"""
        <div style="{_wrap_s}">
            <div style="{_hdr_s}">
                <h2 style="margin:0;">Ugovori pred istekom</h2>
                <p style="margin:4px 0 0;opacity:0.8;">
                    Riforma - Obavijest</p>
            </div>
            <div style="{_body_s}">
                <p>Ugovori koji isticu u narednih 30 dana:</p>
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="background:#e2e8f0;">
                            <th style="padding:8px;text-align:left;">
                                Oznaka</th>
                            <th style="padding:8px;text-align:left;">
                                Datum isteka</th>
                            <th style="padding:8px;text-align:left;">
                                Zakupnina</th>
                        </tr>
                    </thead>
                    <tbody>{contracts_html}</tbody>
                </table>
                <p style="margin-top:16px;color:#64748b;font-size:13px;">
                    Prijavite se na platformu za vise detalja.
                </p>
            </div>
        </div>"""

        await send_email(
            email,
            f"Riforma: {len(expiring)} ugovor(a) pred istekom",
            html,
        )


async def notify_overdue_bills():
    """Send notifications for overdue unpaid bills."""
    today = date.today()

    overdue = await racuni.find_all(extra_conditions=[
        RacuniRow.status_placanja.in_(["ceka_placanje", "djelomicno_placeno"]),
        RacuniRow.datum_dospijeca < today,
    ])

    if not overdue:
        return

    admins = await users.find_all(extra_conditions=[
        UserRow.role.in_(["owner", "admin", "accountant"]),
    ])

    _td = "padding:8px;border-bottom:1px solid #e2e8f0"
    _hdr_r = "background:#dc2626;color:white;padding:20px;" "border-radius:8px 8px 0 0"
    _body_r = (
        "padding:20px;background:#f8fafc;"
        "border:1px solid #e2e8f0;border-radius:0 0 8px 8px"
    )
    _wrap_r = "font-family:sans-serif;max-width:600px;margin:0 auto"

    for admin in admins:
        email = admin.email
        if not email:
            continue

        bills_html = ""
        total = 0
        for b in overdue:
            iznos = b.iznos or 0
            total += iznos
            dob = escape(str(b.dobavljac or "N/A"))
            tip = escape(str(b.tip_utroska or "N/A"))
            dosp = escape(str(b.datum_dospijeca or "N/A"))
            bills_html += (
                f'<tr><td style="{_td}">{dob}</td>'
                f'<td style="{_td}">{tip}</td>'
                f'<td style="{_td}">{dosp}</td>'
                f'<td style="{_td}">{iznos:.2f} </td></tr>'
            )

        html = f"""
        <div style="{_wrap_r}">
            <div style="{_hdr_r}">
                <h2 style="margin:0;">Dospjeli racuni</h2>
                <p style="margin:4px 0 0;opacity:0.8;">
                    Riforma - Hitna obavijest</p>
            </div>
            <div style="{_body_r}">
                <p><strong>{len(overdue)}</strong> racun(a)
                ukupne vrijednosti
                <strong>{total:.2f} EUR</strong>
                je dospjelo na naplatu.</p>
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="background:#fee2e2;">
                            <th style="padding:8px;text-align:left;">
                                Dobavljac</th>
                            <th style="padding:8px;text-align:left;">
                                Tip</th>
                            <th style="padding:8px;text-align:left;">
                                Dospijeva</th>
                            <th style="padding:8px;text-align:left;">
                                Iznos</th>
                        </tr>
                    </thead>
                    <tbody>{bills_html}</tbody>
                </table>
            </div>
        </div>"""

        subj = f"Riforma: {len(overdue)} dospjelih" f" racuna ({total:.2f} EUR)"
        await send_email(email, subj, html)


async def notify_maintenance_overdue():
    """Send notifications for overdue maintenance tasks."""
    overdue = await maintenance_tasks.find_all(extra_conditions=[
        MaintenanceTaskRow.status.in_(["novi", "u_tijeku", "planiran"]),
        MaintenanceTaskRow.rok < date.today(),
    ])

    if not overdue:
        return

    admins = await users.find_all(extra_conditions=[
        UserRow.role.in_(["owner", "admin", "manager"]),
    ])

    _td_m = "padding:8px;border-bottom:1px solid #e2e8f0"
    _hdr_m = "background:#f59e0b;color:white;padding:20px;" "border-radius:8px 8px 0 0"
    _body_m = (
        "padding:20px;background:#f8fafc;"
        "border:1px solid #e2e8f0;border-radius:0 0 8px 8px"
    )
    _wrap_m = "font-family:sans-serif;max-width:600px;margin:0 auto"
    _prio_map = {"high": "[!]", "medium": "[~]", "low": "[.]"}

    for admin in admins:
        email = admin.email
        if not email:
            continue

        tasks_html = ""
        for t in overdue:
            prio = _prio_map.get(t.prioritet or "", "[ ]")
            title = escape(str(t.naziv or "N/A"))
            due = escape(str(t.rok) if t.rok else "N/A")
            assigned = escape(str(t.dodijeljeno or "N/A"))
            tasks_html += (
                f'<tr><td style="{_td_m}">'
                f"{prio} {title}</td>"
                f'<td style="{_td_m}">{due}</td>'
                f'<td style="{_td_m}">{assigned}</td></tr>'
            )

        html = f"""
        <div style="{_wrap_m}">
            <div style="{_hdr_m}">
                <h2 style="margin:0;">
                    Zakasnjeli zadaci odrzavanja</h2>
                <p style="margin:4px 0 0;opacity:0.8;">
                    Riforma - Obavijest</p>
            </div>
            <div style="{_body_m}">
                <p><strong>{len(overdue)}</strong>
                    zadatak(a) odrzavanja je prosao rok.</p>
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="background:#fef3c7;">
                            <th style="padding:8px;text-align:left;">
                                Zadatak</th>
                            <th style="padding:8px;text-align:left;">
                                Rok</th>
                            <th style="padding:8px;text-align:left;">
                                Zaduzen</th>
                        </tr>
                    </thead>
                    <tbody>{tasks_html}</tbody>
                </table>
            </div>
        </div>"""

        subj_m = f"Riforma: {len(overdue)} zakasnjeli(h) zadataka"
        await send_email(email, subj_m, html)


async def run_all_notifications():
    """Run all notification checks. Called by scheduler."""
    logger.info("Running notification checks...")
    await notify_expiring_contracts()
    await notify_overdue_bills()
    await notify_maintenance_overdue()
    logger.info("Notification checks completed.")
