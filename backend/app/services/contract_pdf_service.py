"""Server-side PDF rendering for contracts and annexes.

Uses Jinja2 to populate the HTML templates under `brand/` and WeasyPrint to
rasterise the result. WeasyPrint is imported lazily so the rest of the app
keeps running if the native libraries (pango/cairo) are missing.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import HTTPException
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.db.repositories.instance import (
    nekretnine as nekretnine_repo,
    property_units as units_repo,
    zakupnici as zakupnici_repo,
)

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[3]
_BRAND_DIR = _REPO_ROOT / "brand"

_jinja_env = Environment(
    loader=FileSystemLoader(str(_BRAND_DIR)),
    autoescape=select_autoescape(enabled_extensions=("html",)),
    variable_start_string="{{",
    variable_end_string="}}",
)


def _fmt_date(value: Any) -> str:
    if not value:
        return "—"
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value).date()
        except ValueError:
            return value
    try:
        return value.strftime("%d.%m.%Y.")
    except Exception:
        return str(value)


def _fmt_currency(value: Any) -> str:
    if value is None or value == "":
        return "—"
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return str(value)
    # hr-HR number formatting: dot as thousands separator, comma as decimal,
    # non-breaking space before the euro sign.
    integer, _, fractional = f"{amount:,.2f}".partition(".")
    integer = integer.replace(",", ".")
    return f"{integer},{fractional}\u00a0€"


def _dl(rows: list[tuple[str, str]]) -> str:
    """Render a simple definition-list HTML block from pre-escaped label/value pairs."""
    items = []
    for label, value in rows:
        items.append(
            f'<div style="display:flex;gap:12px;margin:4px 0;">'
            f'<strong style="min-width:160px;color:#6c757d;">{label}:</strong>'
            f'<span>{value}</span></div>'
        )
    return "".join(items)


async def _build_parties_html(contract: Any, zakupnik: Any) -> str:
    landlord = escape("Riforma — upravitelj portfelja")
    tenant_name = escape(
        zakupnik.naziv_firme or zakupnik.ime_prezime or "Nepoznat zakupnik"
    ) if zakupnik else "Nepoznat zakupnik"
    rows = [
        ("Najmodavac", landlord),
        ("Zakupnik", tenant_name),
    ]
    if zakupnik and zakupnik.oib:
        rows.append(("OIB zakupnika", escape(zakupnik.oib)))
    if zakupnik and zakupnik.kontakt_email:
        rows.append(("E-mail", escape(zakupnik.kontakt_email)))
    return _dl(rows)


def _property_html(nekretnina: Any, units: Any) -> str:
    """Render the property summary block.

    `units` may be a single PropertyUnitRow (legacy single-unit contract)
    or a list of them (multi-unit contract). The PDF prints either a single
    "Jedinica" row or a small table summarising the set + total area.
    """
    if not nekretnina:
        return "<em>Nekretnina nije dostupna.</em>"
    rows = [("Naziv", escape(nekretnina.naziv or "—"))]
    if nekretnina.adresa:
        rows.append(("Adresa", escape(nekretnina.adresa)))

    if units is None:
        unit_list = []
    elif isinstance(units, list):
        unit_list = [u for u in units if u is not None]
    else:
        unit_list = [units]

    if len(unit_list) == 1:
        u = unit_list[0]
        rows.append(("Jedinica", escape(u.oznaka or u.naziv or "—")))
        if u.povrsina_m2:
            rows.append(("Površina", f"{u.povrsina_m2}&nbsp;m²"))
    elif len(unit_list) > 1:
        labels = ", ".join(
            escape(u.oznaka or u.naziv or "—") for u in unit_list
        )
        total_area = sum((u.povrsina_m2 or 0) for u in unit_list)
        rows.append((f"Jedinice ({len(unit_list)})", labels))
        if total_area:
            rows.append(("Ukupna površina", f"{total_area:g}&nbsp;m²"))
    return _dl(rows)


def _term_html(contract: Any) -> str:
    rows = [
        ("Datum početka", _fmt_date(contract.datum_pocetka)),
        ("Datum završetka", _fmt_date(contract.datum_zavrsetka)),
        ("Trajanje", f"{contract.trajanje_mjeseci or 0} mjeseci"),
    ]
    if contract.rok_otkaza_dani:
        rows.append(("Rok otkaza", f"{contract.rok_otkaza_dani} dana"))
    return _dl(rows)


def _financial_html(contract: Any) -> str:
    rows = [
        ("Osnovna zakupnina", _fmt_currency(contract.osnovna_zakupnina)),
    ]
    if contract.cam_troskovi:
        rows.append(("CAM troškovi", _fmt_currency(contract.cam_troskovi)))
    if contract.polog_depozit:
        rows.append(("Polog / depozit", _fmt_currency(contract.polog_depozit)))
    if contract.garancija:
        rows.append(("Garancija", _fmt_currency(contract.garancija)))
    if contract.indeksacija:
        rows.append(("Indeksacija", escape(contract.indeks or "Da")))
    return _dl(rows)


def _obligations_html(contract: Any) -> str:
    parts = []
    if contract.obveze_odrzavanja:
        parts.append(f"<p>{escape(contract.obveze_odrzavanja)}</p>")
    if contract.rezije_brojila:
        parts.append(
            f"<p><strong>Režije / brojila:</strong> {escape(contract.rezije_brojila)}</p>"
        )
    if not parts:
        return "<em>Nisu definirane posebne obveze održavanja.</em>"
    return "".join(parts)


def _special_provisions_html(contract: Any) -> str:
    parts = []
    if contract.uvjeti_produljenja:
        parts.append(
            f"<p><strong>Uvjeti produljenja:</strong> {escape(contract.uvjeti_produljenja)}</p>"
        )
    if contract.namjena_prostora:
        parts.append(
            f"<p><strong>Namjena prostora:</strong> {escape(contract.namjena_prostora)}</p>"
        )
    if contract.napomena:
        parts.append(
            f"<p><strong>Napomena:</strong> {escape(contract.napomena)}</p>"
        )
    return "".join(parts) or "<em>Nema posebnih odredbi.</em>"


async def _resolve_contract_units(contract: Any) -> list:
    """Resolve every PropertyUnitRow linked to a contract — junction first,
    fall back to the legacy primary unit if the junction is empty."""
    from app.models.tables import ugovor_units as _junction
    from app.db.session import get_async_session_factory
    from sqlalchemy import select as _select

    sf = get_async_session_factory()
    async with sf() as session:
        result = await session.execute(
            _select(_junction.c.property_unit_id).where(
                _junction.c.ugovor_id == contract.id
            )
        )
        unit_ids = [row[0] for row in result.all()]

    if not unit_ids and contract.property_unit_id:
        unit_ids = [contract.property_unit_id]

    units = []
    for uid in unit_ids:
        u = await units_repo.get_by_id(uid)
        if u:
            units.append(u)
    return units


async def build_contract_context(contract: Any) -> Dict[str, str]:
    """Collect all template variables for the contract template."""
    nekretnina = None
    if contract.nekretnina_id:
        nekretnina = await nekretnine_repo.get_by_id(contract.nekretnina_id)

    zakupnik = None
    if contract.zakupnik_id:
        zakupnik = await zakupnici_repo.get_by_id(contract.zakupnik_id)

    units = await _resolve_contract_units(contract)

    tenant_label = (
        zakupnik.naziv_firme or zakupnik.ime_prezime or "Zakupnik"
        if zakupnik
        else "Zakupnik"
    )

    return {
        "BRAND_NAME": "Riforma",
        "BRAND_SUBTITLE": "Proptech platforma",
        "CONTRACT_REFERENCE": escape(contract.interna_oznaka or "—"),
        "GENERATED_AT": datetime.now(timezone.utc).strftime("%d.%m.%Y. %H:%M"),
        "TITLE": "UGOVOR O ZAKUPU",
        "INTRO": (
            "Ovaj ugovor definira uvjete zakupa između navedenih strana u "
            "skladu s relevantnim zakonskim odredbama."
        ),
        "PARTIES": await _build_parties_html(contract, zakupnik),
        "PROPERTY_SUMMARY": _property_html(nekretnina, units),
        "TERM_SUMMARY": _term_html(contract),
        "FINANCIAL_SUMMARY": _financial_html(contract),
        "OBLIGATIONS": _obligations_html(contract),
        "SPECIAL_PROVISIONS": _special_provisions_html(contract),
        "BODY": (
            "<p>Strane su suglasne da sve izmjene ovog ugovora moraju biti"
            " u pisanom obliku putem aneksa.</p>"
        ),
        "CONFIRMATION": (
            "Potpisom ovog ugovora strane potvrđuju da su upoznate sa svim"
            " odredbama i da ih prihvaćaju u cijelosti."
        ),
        "LANDLORD_LABEL": "Potpis najmodavca",
        "TENANT_LABEL": f"Potpis: {escape(tenant_label)}",
        "FOOTER": (
            f"Generirano {datetime.now(timezone.utc).strftime('%d.%m.%Y.')} · "
            f"Riforma proptech platforma"
        ),
    }


def _render_placeholder_template(template_name: str, context: Dict[str, str]) -> str:
    """Replace {{NAME}} placeholders literally (templates use plain substitution,
    not real Jinja expressions, so we don't want autoescape to mangle the HTML
    we've already escaped per-field)."""
    path = _BRAND_DIR / template_name
    html = path.read_text(encoding="utf-8")
    for key, value in context.items():
        html = html.replace("{{" + key + "}}", value or "")
    return html


def html_to_pdf(html: str, base_url: Optional[str] = None) -> bytes:
    """Run WeasyPrint. Raises HTTPException(503) with a clear message if the
    library (or its native deps) isn't installed on the host."""
    # macOS strips DYLD_* env vars from spawned subprocesses, so Homebrew
    # libs aren't on the dlopen search path even when `pip install
    # weasyprint` succeeded. Preload them by absolute path first.
    from app.services.pdf_common import _preload_weasyprint_native_libs

    _preload_weasyprint_native_libs()
    try:
        from weasyprint import HTML  # type: ignore
    except ImportError as exc:
        logger.error("WeasyPrint not installed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail=(
                "Generiranje PDF-a nije dostupno — WeasyPrint nije instaliran."
                " Instalirajte system pakete (libpango, libcairo) i"
                " `pip install weasyprint`."
            ),
        )
    except OSError as exc:
        logger.error("WeasyPrint native libs missing: %s", exc)
        raise HTTPException(
            status_code=503,
            detail=(
                "Generiranje PDF-a nije dostupno — nedostaju native biblioteke"
                " (libpango / libcairo). Obratite se administratoru."
            ),
        )
    return HTML(string=html, base_url=base_url or str(_BRAND_DIR)).write_pdf()


async def render_contract_pdf(contract: Any) -> bytes:
    """Top-level: take a UgovoriRow, return PDF bytes."""
    context = await build_contract_context(contract)
    html = _render_placeholder_template("ugovor-template.html", context)
    return html_to_pdf(html)


# ---------------------------------------------------------------------------
# Annex (aneks)
# ---------------------------------------------------------------------------


def _contract_summary_html(contract: Any) -> str:
    rows = [
        ("Referenca", escape(contract.interna_oznaka or "—")),
        ("Originalno trajanje",
         f"{_fmt_date(contract.datum_pocetka)} – {_fmt_date(contract.datum_zavrsetka)}"),
        ("Originalna zakupnina", _fmt_currency(contract.osnovna_zakupnina)),
    ]
    return _dl(rows)


def _tenant_summary_html(zakupnik: Any) -> str:
    if not zakupnik:
        return "<em>Zakupnik nije dostupan.</em>"
    rows = [
        ("Naziv",
         escape(zakupnik.naziv_firme or zakupnik.ime_prezime or "—")),
    ]
    if zakupnik.oib:
        rows.append(("OIB", escape(zakupnik.oib)))
    if zakupnik.kontakt_email:
        rows.append(("E-mail", escape(zakupnik.kontakt_email)))
    return _dl(rows)


def _changes_html(
    nova_zakupnina: Optional[float],
    novi_datum_zavrsetka: Optional[str],
    dodatne_promjene: Optional[str],
    original_contract: Any,
) -> str:
    rows: list[tuple[str, str]] = []
    if nova_zakupnina is not None:
        old = _fmt_currency(original_contract.osnovna_zakupnina)
        new = _fmt_currency(nova_zakupnina)
        rows.append(("Nova zakupnina", f"{new} (prethodno: {old})"))
    if novi_datum_zavrsetka:
        rows.append((
            "Novi datum završetka",
            f"{_fmt_date(novi_datum_zavrsetka)} (prethodno: {_fmt_date(original_contract.datum_zavrsetka)})",
        ))
    blocks = [_dl(rows)] if rows else ["<em>Nisu navedene konkretne financijske izmjene.</em>"]
    if dodatne_promjene:
        blocks.append(
            f'<p style="margin-top:12px;"><strong>Dodatne promjene:</strong><br>{escape(dodatne_promjene)}</p>'
        )
    return "".join(blocks)


async def build_annex_context(
    contract: Any,
    *,
    nova_zakupnina: Optional[float] = None,
    novi_datum_zavrsetka: Optional[str] = None,
    dodatne_promjene: Optional[str] = None,
    body_text: Optional[str] = None,
) -> Dict[str, str]:
    """Collect template variables for the annex template."""
    zakupnik = None
    if contract.zakupnik_id:
        zakupnik = await zakupnici_repo.get_by_id(contract.zakupnik_id)

    nekretnina = None
    if contract.nekretnina_id:
        nekretnina = await nekretnine_repo.get_by_id(contract.nekretnina_id)

    units = await _resolve_contract_units(contract)

    tenant_label = (
        zakupnik.naziv_firme or zakupnik.ime_prezime or "Zakupnik"
        if zakupnik
        else "Zakupnik"
    )

    default_body = (
        "<p>Sve odredbe izvornog ugovora koje nisu izrijekom mijenjane ovim"
        " aneksom ostaju na snazi u neizmijenjenom obliku.</p>"
        "<p>Ovaj aneks stupa na snagu danom potpisa obiju strana.</p>"
    )

    return {
        "BRAND_NAME": "Riforma",
        "BRAND_SUBTITLE": "Proptech platforma",
        "CONTRACT_REFERENCE": escape(contract.interna_oznaka or "—"),
        "GENERATED_AT": datetime.now(timezone.utc).strftime("%d.%m.%Y. %H:%M"),
        "TITLE": "ANEKS UGOVORA O ZAKUPU",
        "INTRO": (
            "Ovim aneksom strane sporazumno mijenjaju pojedine odredbe"
            " izvornog ugovora navedenog u nastavku."
        ),
        "CONTRACT_SUMMARY": _contract_summary_html(contract),
        "PROPERTY_SUMMARY": _property_html(nekretnina, units),
        "TENANT_SUMMARY": _tenant_summary_html(zakupnik),
        "CHANGES": _changes_html(
            nova_zakupnina, novi_datum_zavrsetka, dodatne_promjene, contract
        ),
        "BODY": body_text or default_body,
        "LANDLORD_LABEL": "Potpis najmodavca",
        "TENANT_LABEL": f"Potpis: {escape(tenant_label)}",
        "FOOTER": (
            f"Generirano {datetime.now(timezone.utc).strftime('%d.%m.%Y.')} · "
            f"Riforma proptech platforma"
        ),
    }


async def render_annex_pdf(
    contract: Any,
    *,
    nova_zakupnina: Optional[float] = None,
    novi_datum_zavrsetka: Optional[str] = None,
    dodatne_promjene: Optional[str] = None,
    body_text: Optional[str] = None,
) -> bytes:
    """Top-level: render an annex PDF for a contract."""
    context = await build_annex_context(
        contract,
        nova_zakupnina=nova_zakupnina,
        novi_datum_zavrsetka=novi_datum_zavrsetka,
        dodatne_promjene=dodatne_promjene,
        body_text=body_text,
    )
    html = _render_placeholder_template("aneks-template.html", context)
    return html_to_pdf(html)
