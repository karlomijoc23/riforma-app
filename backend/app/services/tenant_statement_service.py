"""Generate a per-tenant statement PDF.

A "statement" lists every bill (rent + utilities + others) the tenant
owes for a given period, with running totals and an outstanding balance
at the end. This is what landlords mail to commercial tenants monthly
or quarterly so they can reconcile against their own books.

Uses WeasyPrint (already a dep from earlier deploys). Falls back to a
clear 503 if WeasyPrint native libs aren't installed on the host.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from html import escape
from typing import Any, List, Optional

from fastapi import HTTPException

from app.db.repositories.instance import (
    nekretnine as nekretnine_repo,
    racuni,
    ugovori,
    zakupnici as zakupnici_repo,
)
from app.models.tables import RacuniRow, UgovoriRow

logger = logging.getLogger(__name__)


def _fmt_date(value: Any) -> str:
    if not value:
        return "—"
    if isinstance(value, str):
        try:
            value = date.fromisoformat(value)
        except ValueError:
            return value
    try:
        return value.strftime("%d.%m.%Y.")
    except Exception:
        return str(value)


def _fmt_currency(value: Any) -> str:
    if value is None or value == "":
        return "0,00\u00a0€"
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return str(value)
    integer, _, fractional = f"{amount:,.2f}".partition(".")
    integer = integer.replace(",", ".")
    return f"{integer},{fractional}\u00a0€"


async def _collect_tenant_charges(
    zakupnik_id: str, period_od: date, period_do: date
) -> List[Any]:
    """Bills + contract rent installments hitting this tenant in the period.

    For now: just the bills with `zakupnik_id` set. Rent installments
    derived from contracts could be layered later — but most billable
    rent already lives in `racuni` rows of tip 'najam' / 'ostalo'.
    """
    rows = await racuni.find_all(
        extra_conditions=[
            RacuniRow.zakupnik_id == zakupnik_id,
            RacuniRow.datum_racuna.isnot(None),
            RacuniRow.datum_racuna >= period_od,
            RacuniRow.datum_racuna <= period_do,
        ],
        order_by="datum_racuna",
        order_dir="asc",
    )
    return rows


def _table_rows_html(items: List[Any]) -> str:
    if not items:
        return (
            '<tr><td colspan="6" style="text-align:center;'
            'padding:24px;color:#94a3b8;">'
            "Za odabrano razdoblje nema zaduženja.</td></tr>"
        )

    out: List[str] = []
    for r in items:
        oznaka = escape(r.broj_racuna or "—")
        tip = escape((r.tip_utroska or "—").replace("_", " ").capitalize())
        dobavljac = escape(r.dobavljac or "—")
        datum = escape(_fmt_date(r.datum_racuna))
        iznos = _fmt_currency(r.iznos)
        plac = _fmt_currency(r.total_paid or 0)
        ostatak = _fmt_currency((r.iznos or 0) - (r.total_paid or 0))
        out.append(
            f"<tr>"
            f'<td style="padding:8px;">{datum}</td>'
            f'<td style="padding:8px;">{tip}</td>'
            f'<td style="padding:8px;">{dobavljac}</td>'
            f'<td style="padding:8px;font-family:monospace;">{oznaka}</td>'
            f'<td style="padding:8px;text-align:right;">{iznos}</td>'
            f'<td style="padding:8px;text-align:right;">{plac}</td>'
            f'<td style="padding:8px;text-align:right;'
            f'font-weight:600;">{ostatak}</td>'
            f"</tr>"
        )
    return "".join(out)


async def render_tenant_statement_pdf(
    zakupnik_id: str,
    period_od: date,
    period_do: date,
) -> bytes:
    """Top-level: render a statement PDF for the tenant + period."""
    zakupnik = await zakupnici_repo.get_by_id(zakupnik_id)
    if not zakupnik:
        raise HTTPException(status_code=404, detail="Zakupnik nije pronađen")

    items = await _collect_tenant_charges(zakupnik_id, period_od, period_do)

    total_charged = sum((r.iznos or 0) for r in items)
    total_paid = sum((r.total_paid or 0) for r in items)
    outstanding = total_charged - total_paid

    tenant_label = (
        zakupnik.naziv_firme or zakupnik.ime_prezime or "Zakupnik"
    )
    oib = zakupnik.oib or "—"

    rows_html = _table_rows_html(items)

    html = f"""<!DOCTYPE html>
<html lang="hr"><head><meta charset="utf-8"><style>
  body {{ font-family: 'Helvetica', Arial, sans-serif; color: #1b1d21;
         padding: 40px 48px; font-size: 12px; }}
  header {{ display: flex; justify-content: space-between;
           border-bottom: 2px solid #1d3557; padding-bottom: 14px; margin-bottom: 24px; }}
  .brand-name {{ font-weight: 700; font-size: 18px; letter-spacing: 0.06em;
                text-transform: uppercase; color: #1d3557; }}
  .meta {{ font-size: 11px; color: #6c757d; text-align: right; }}
  h1 {{ font-size: 20px; margin: 0 0 8px; color: #1d3557;
        text-transform: uppercase; letter-spacing: 0.04em; }}
  .info {{ display: flex; gap: 32px; margin: 16px 0 24px; }}
  .info > div {{ flex: 1; }}
  .info strong {{ display: block; font-size: 10px; color: #6c757d;
                  text-transform: uppercase; margin-bottom: 4px; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 16px; }}
  thead th {{ background: #f1f5f9; padding: 10px 8px; text-align: left;
              font-size: 10px; text-transform: uppercase; color: #475569;
              border-bottom: 2px solid #cbd5e1; }}
  tbody tr {{ border-bottom: 1px solid #e2e8f0; }}
  tbody tr:nth-child(even) {{ background: #fafbfc; }}
  .totals {{ margin-top: 24px; padding: 16px;
             background: #f8fafc; border-radius: 6px; }}
  .totals-row {{ display: flex; justify-content: space-between;
                 padding: 6px 0; }}
  .totals-row.outstanding {{ font-weight: 700; font-size: 14px;
                             color: #1d3557; border-top: 2px solid #1d3557;
                             margin-top: 8px; padding-top: 12px; }}
  footer {{ position: fixed; bottom: 20px; left: 48px; right: 48px;
            font-size: 10px; color: #94a3b8; text-align: center;
            border-top: 1px solid #e2e8f0; padding-top: 8px; }}
</style></head><body>

<header>
  <div>
    <div class="brand-name">Riforma</div>
    <div style="font-size:11px;color:#6c757d;">Proptech platforma</div>
  </div>
  <div class="meta">
    <div>Generirano: {datetime.now(timezone.utc).strftime("%d.%m.%Y. %H:%M")}</div>
  </div>
</header>

<h1>Specifikacija zaduženja zakupnika</h1>
<p style="color:#475569;margin:0 0 8px;">
  Razdoblje: <strong>{escape(_fmt_date(period_od))} – {escape(_fmt_date(period_do))}</strong>
</p>

<div class="info">
  <div>
    <strong>Zakupnik</strong>
    <div style="font-size:14px;font-weight:600;">{escape(tenant_label)}</div>
  </div>
  <div>
    <strong>OIB</strong>
    <div>{escape(oib)}</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Datum</th><th>Vrsta</th><th>Dobavljač</th><th>Br. računa</th>
      <th style="text-align:right;">Iznos</th>
      <th style="text-align:right;">Plaćeno</th>
      <th style="text-align:right;">Ostatak</th>
    </tr>
  </thead>
  <tbody>{rows_html}</tbody>
</table>

<div class="totals">
  <div class="totals-row">
    <span>Ukupno zaduženo</span><span>{_fmt_currency(total_charged)}</span>
  </div>
  <div class="totals-row">
    <span>Ukupno plaćeno</span><span>{_fmt_currency(total_paid)}</span>
  </div>
  <div class="totals-row outstanding">
    <span>Saldo (preostalo za platiti)</span>
    <span>{_fmt_currency(outstanding)}</span>
  </div>
</div>

<footer>
  Riforma proptech platforma · Specifikacija je informativnog karaktera.
</footer>

</body></html>"""

    # Reuse the WeasyPrint runner from the contract PDF service.
    from app.services.contract_pdf_service import html_to_pdf
    return html_to_pdf(html)
