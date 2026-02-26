"""Croatian-specific field validators (OIB, IBAN)."""

import re
from typing import Optional


def validate_oib(value: Optional[str]) -> Optional[str]:
    """
    Validate Croatian OIB (Personal/Company Identification Number).
    Must be exactly 11 digits and pass the ISO 7064 MOD 11,10 check.
    Returns the cleaned value or raises ValueError.
    """
    if value is None or value == "":
        return value

    digits = re.sub(r"\s", "", value)
    if not re.fullmatch(r"\d{11}", digits):
        raise ValueError("OIB mora sadržavati točno 11 znamenki")

    # ISO 7064 MOD 11,10 checksum
    check = 10
    for digit in digits[:10]:
        check = (check + int(digit)) % 10
        if check == 0:
            check = 10
        check = (check * 2) % 11
    control = 11 - check
    if control == 10:
        raise ValueError("OIB nije ispravan (neispravan kontrolni broj)")
    if control == 11:
        control = 0
    if control != int(digits[10]):
        raise ValueError("OIB nije ispravan (neispravan kontrolni broj)")

    return digits


def validate_iban(value: Optional[str]) -> Optional[str]:
    """
    Validate IBAN using basic format check and MOD-97 checksum.
    Accepts IBANs with or without spaces.
    Returns the cleaned (no-space) value or raises ValueError.
    """
    if value is None or value == "":
        return value

    iban = re.sub(r"\s+", "", value).upper()

    # Basic format: 2 letters, 2 digits, up to 30 alphanumeric
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{1,30}", iban):
        raise ValueError("IBAN format nije ispravan")

    # MOD-97 check: move first 4 chars to end, convert letters to numbers
    rearranged = iban[4:] + iban[:4]
    numeric = ""
    for ch in rearranged:
        if ch.isalpha():
            numeric += str(ord(ch) - ord("A") + 10)
        else:
            numeric += ch

    if int(numeric) % 97 != 1:
        raise ValueError("IBAN nije ispravan (neispravan kontrolni broj)")

    return iban
