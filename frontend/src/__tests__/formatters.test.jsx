import {
  parseNumericValue,
  parseSmartNumber,
  formatCurrency,
  formatArea,
  formatPercentage,
  formatDeltaPercentage,
  formatDate,
  formatContractDate,
  formatDateTime,
  formatBooleanish,
  pdfDateStamp,
  formatPropertyType,
} from "../shared/formatters";

describe("parseNumericValue", () => {
  it("returns null for null, undefined, and empty string", () => {
    expect(parseNumericValue(null)).toBeNull();
    expect(parseNumericValue(undefined)).toBeNull();
    expect(parseNumericValue("")).toBeNull();
  });

  it("returns the number when given a finite number", () => {
    expect(parseNumericValue(42)).toBe(42);
    expect(parseNumericValue(0)).toBe(0);
    expect(parseNumericValue(-3.14)).toBe(-3.14);
  });

  it("returns null for non-finite numbers", () => {
    expect(parseNumericValue(NaN)).toBeNull();
    expect(parseNumericValue(Infinity)).toBeNull();
    expect(parseNumericValue(-Infinity)).toBeNull();
  });

  it("parses numeric strings", () => {
    expect(parseNumericValue("123")).toBe(123);
    expect(parseNumericValue("45.67")).toBe(45.67);
  });

  it("strips non-numeric characters from strings", () => {
    expect(parseNumericValue("$1,000.50")).toBe(1000.5);
  });

  it("returns 0 for strings with no numeric characters (Number('') === 0)", () => {
    // "abc" -> normalised "" -> Number("") === 0 which is finite
    expect(parseNumericValue("abc")).toBe(0);
  });

  it("returns null for other types", () => {
    expect(parseNumericValue({})).toBeNull();
    expect(parseNumericValue([])).toBeNull();
  });
});

describe("parseSmartNumber", () => {
  it("returns 0 for null, undefined, and empty string", () => {
    expect(parseSmartNumber(null)).toBe(0);
    expect(parseSmartNumber(undefined)).toBe(0);
    expect(parseSmartNumber("")).toBe(0);
  });

  it("returns the value when given a number", () => {
    expect(parseSmartNumber(42)).toBe(42);
    expect(parseSmartNumber(0)).toBe(0);
  });

  it("parses European locale format 1.234,56", () => {
    expect(parseSmartNumber("1.234,56")).toBe(1234.56);
  });

  it("parses US locale format 1,234.56", () => {
    expect(parseSmartNumber("1,234.56")).toBe(1234.56);
  });

  it("parses comma-as-decimal format 1234,56", () => {
    expect(parseSmartNumber("1234,56")).toBe(1234.56);
  });

  it("returns 0 for unparseable strings", () => {
    expect(parseSmartNumber("abc")).toBe(0);
  });
});

describe("formatCurrency", () => {
  it("formats a number with Croatian locale and euro sign", () => {
    const result = formatCurrency(1000);
    // hr-HR uses dot as thousand separator and comma as decimal
    expect(result).toContain("1.000,00");
    expect(result).toContain("\u20AC"); // euro sign
  });

  it("returns em dash for null/undefined/empty", () => {
    expect(formatCurrency(null)).toBe("\u2014");
    expect(formatCurrency(undefined)).toBe("\u2014");
    expect(formatCurrency("")).toBe("\u2014");
  });

  it("formats zero correctly", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0,00");
    expect(result).toContain("\u20AC");
  });

  it("formats decimal values", () => {
    const result = formatCurrency(1234.5);
    expect(result).toContain("1.234,50");
  });
});

describe("formatArea", () => {
  it("formats area with m\u00B2 suffix", () => {
    const result = formatArea(120);
    expect(result).toContain("120");
    expect(result).toContain("m\u00B2");
  });

  it("returns em dash for null/undefined/empty", () => {
    expect(formatArea(null)).toBe("\u2014");
    expect(formatArea(undefined)).toBe("\u2014");
    expect(formatArea("")).toBe("\u2014");
  });

  it("formats decimal areas", () => {
    const result = formatArea(45.75);
    expect(result).toContain("45,75");
    expect(result).toContain("m\u00B2");
  });
});

describe("formatPercentage", () => {
  it("formats a number as percentage with one decimal", () => {
    expect(formatPercentage(79.17)).toBe("79.2 %");
  });

  it("returns em dash for null/undefined/NaN", () => {
    expect(formatPercentage(null)).toBe("\u2014");
    expect(formatPercentage(undefined)).toBe("\u2014");
    expect(formatPercentage(NaN)).toBe("\u2014");
  });

  it("handles string values", () => {
    expect(formatPercentage("50.5")).toBe("50.5 %");
  });

  it("handles zero", () => {
    expect(formatPercentage(0)).toBe("0.0 %");
  });
});

describe("formatDeltaPercentage", () => {
  it("formats positive delta with plus sign", () => {
    expect(formatDeltaPercentage(12.3)).toBe("+12.3 %");
  });

  it("formats negative delta without extra sign", () => {
    expect(formatDeltaPercentage(-5.7)).toBe("-5.7 %");
  });

  it("formats zero without sign", () => {
    expect(formatDeltaPercentage(0)).toBe("0.0 %");
  });

  it("returns em dash for null/undefined/NaN", () => {
    expect(formatDeltaPercentage(null)).toBe("\u2014");
    expect(formatDeltaPercentage(undefined)).toBe("\u2014");
    expect(formatDeltaPercentage(NaN)).toBe("\u2014");
  });
});

describe("formatDate", () => {
  it("formats a valid date string using Croatian locale", () => {
    const result = formatDate("2024-03-15");
    // hr-HR locale: dd. mm. yyyy. or similar
    expect(result).toMatch(/15/);
    expect(result).toMatch(/3/);
    expect(result).toMatch(/2024/);
  });

  it("returns em dash for falsy values", () => {
    expect(formatDate(null)).toBe("\u2014");
    expect(formatDate(undefined)).toBe("\u2014");
    expect(formatDate("")).toBe("\u2014");
  });

  it("returns em dash for invalid date strings", () => {
    expect(formatDate("not-a-date")).toBe("\u2014");
  });
});

describe("formatContractDate", () => {
  it("formats a date as dd/mm/yy", () => {
    const result = formatContractDate("2024-03-15");
    expect(result).toBe("15/03/24");
  });

  it("returns em dash for falsy values", () => {
    expect(formatContractDate(null)).toBe("\u2014");
    expect(formatContractDate(undefined)).toBe("\u2014");
    expect(formatContractDate("")).toBe("\u2014");
  });

  it("returns em dash for invalid date strings", () => {
    expect(formatContractDate("xyz")).toBe("\u2014");
  });

  it("pads single-digit day and month with zeroes", () => {
    const result = formatContractDate("2024-01-05");
    expect(result).toBe("05/01/24");
  });
});

describe("formatDateTime", () => {
  it("formats a valid date-time string with date and time parts", () => {
    const result = formatDateTime("2024-03-15T14:30:00");
    // Should contain date and time components
    expect(result).toMatch(/15/);
    expect(result).toMatch(/03/);
    expect(result).toMatch(/2024/);
    expect(result).toMatch(/14/);
    expect(result).toMatch(/30/);
  });

  it("returns em dash for falsy values", () => {
    expect(formatDateTime(null)).toBe("\u2014");
    expect(formatDateTime(undefined)).toBe("\u2014");
    expect(formatDateTime("")).toBe("\u2014");
  });

  it("returns em dash for invalid date strings", () => {
    expect(formatDateTime("not-a-date")).toBe("\u2014");
  });
});

describe("formatBooleanish", () => {
  it('returns "Da" for true and "DA"', () => {
    expect(formatBooleanish(true)).toBe("Da");
    expect(formatBooleanish("DA")).toBe("Da");
  });

  it('returns "Ne" for false and "NE"', () => {
    expect(formatBooleanish(false)).toBe("Ne");
    expect(formatBooleanish("NE")).toBe("Ne");
  });

  it("returns em dash for null, undefined, and empty string", () => {
    expect(formatBooleanish(null)).toBe("\u2014");
    expect(formatBooleanish(undefined)).toBe("\u2014");
    expect(formatBooleanish("")).toBe("\u2014");
  });

  it("returns the value as-is for unrecognized strings", () => {
    expect(formatBooleanish("Mozda")).toBe("Mozda");
  });
});

describe("pdfDateStamp", () => {
  it("returns a string in dd.mm.yy format", () => {
    const result = pdfDateStamp();
    expect(result).toMatch(/^\d{2}\.\d{2}\.\d{2}$/);
  });

  it("matches the current date", () => {
    const now = new Date();
    const dd = now.getDate().toString().padStart(2, "0");
    const mm = (now.getMonth() + 1).toString().padStart(2, "0");
    const yy = now.getFullYear().toString().slice(-2);
    expect(pdfDateStamp()).toBe(`${dd}.${mm}.${yy}`);
  });
});

describe("formatPropertyType", () => {
  it("maps known property types to Croatian labels", () => {
    expect(formatPropertyType("poslovna_zgrada")).toBe("Poslovna zgrada");
    expect(formatPropertyType("stan")).toBe("Stan");
    expect(formatPropertyType("zemljiste")).toBe("Zemlji\u0161te");
    expect(formatPropertyType("ostalo")).toBe("Ostalo");
  });

  it('returns "Nepoznata vrsta" for falsy values', () => {
    expect(formatPropertyType(null)).toBe("Nepoznata vrsta");
    expect(formatPropertyType(undefined)).toBe("Nepoznata vrsta");
    expect(formatPropertyType("")).toBe("Nepoznata vrsta");
  });

  it("returns the raw value for unknown types", () => {
    expect(formatPropertyType("warehouse")).toBe("warehouse");
  });
});
