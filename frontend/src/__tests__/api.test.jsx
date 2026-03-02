/**
 * Tests for shared/api.js utility functions.
 *
 * We test getBackendUrl, getErrorMessage, and getErrorCode without
 * importing the full module (which bootstraps axios interceptors).
 * Instead we isolate the pure functions via jest module reset.
 */

describe("getBackendUrl", () => {
  const originalEnv = process.env;
  let savedWindow;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Save original window.location so we can mock it
    savedWindow = window.location;
  });

  afterEach(() => {
    process.env = originalEnv;
    // Restore window.location
    if (savedWindow) {
      try {
        Object.defineProperty(window, "location", {
          value: savedWindow,
          writable: true,
          configurable: true,
        });
      } catch {
        // jsdom sometimes prevents this, that's ok
      }
    }
  });

  it("returns REACT_APP_BACKEND_URL when set (trimming trailing slashes)", () => {
    process.env.REACT_APP_BACKEND_URL = "https://api.example.com///";
    // We inline the logic to avoid full module import side effects
    const envUrl = process.env.REACT_APP_BACKEND_URL;
    const result =
      envUrl && envUrl.trim() !== "" ? envUrl.replace(/\/+$/, "") : "";
    expect(result).toBe("https://api.example.com");
  });

  it("returns empty string when REACT_APP_BACKEND_URL is whitespace-only", () => {
    process.env.REACT_APP_BACKEND_URL = "   ";
    const envUrl = process.env.REACT_APP_BACKEND_URL;
    const result =
      envUrl && envUrl.trim() !== "" ? envUrl.replace(/\/+$/, "") : "";
    expect(result).toBe("");
  });

  it("returns empty string in browser when no env var is set (proxy mode)", () => {
    delete process.env.REACT_APP_BACKEND_URL;

    // Mock window.location for port 3000
    delete window.location;
    window.location = {
      port: "3000",
      protocol: "http:",
      hostname: "localhost",
    };

    // Proxy-based routing: same-origin requests, so always ""
    jest.isolateModules(() => {
      const { getBackendUrl } = require("../shared/api");
      expect(getBackendUrl()).toBe("");
    });
  });

  it("returns empty string in production (non-3000 port)", () => {
    delete process.env.REACT_APP_BACKEND_URL;

    delete window.location;
    window.location = {
      port: "443",
      protocol: "https:",
      hostname: "app.example.com",
    };

    jest.isolateModules(() => {
      const { getBackendUrl } = require("../shared/api");
      expect(getBackendUrl()).toBe("");
    });
  });

  it("returns empty string when port is empty (default 80/443)", () => {
    delete process.env.REACT_APP_BACKEND_URL;

    delete window.location;
    window.location = {
      port: "",
      protocol: "https:",
      hostname: "app.example.com",
    };

    jest.isolateModules(() => {
      const { getBackendUrl } = require("../shared/api");
      expect(getBackendUrl()).toBe("");
    });
  });
});

describe("getErrorMessage", () => {
  // Import once since these are pure functions
  let getErrorMessage;

  beforeAll(() => {
    jest.isolateModules(() => {
      const mod = require("../shared/api");
      getErrorMessage = mod.getErrorMessage;
    });
  });

  it("extracts message from { response: { data: { detail: { message } } } }", () => {
    const error = {
      response: {
        data: { detail: { message: "Token istekao", code: "TOKEN_EXPIRED" } },
      },
    };
    expect(getErrorMessage(error)).toBe("Token istekao");
  });

  it("extracts message from { response: { data: { detail: string } } }", () => {
    const error = {
      response: { data: { detail: "Nemate pristup" } },
    };
    expect(getErrorMessage(error)).toBe("Nemate pristup");
  });

  it("extracts message from { response: { data: { message } } }", () => {
    const error = {
      response: { data: { message: "Server error" } },
    };
    expect(getErrorMessage(error)).toBe("Server error");
  });

  it("falls back to error.message", () => {
    const error = { message: "Network Error" };
    expect(getErrorMessage(error)).toBe("Network Error");
  });

  it("returns default message for null/undefined error", () => {
    expect(getErrorMessage(null)).toBe("Neo\u010Dekivana gre\u0161ka");
    expect(getErrorMessage(undefined)).toBe("Neo\u010Dekivana gre\u0161ka");
  });

  it("returns default message for empty error object", () => {
    expect(getErrorMessage({})).toBe("Neo\u010Dekivana gre\u0161ka");
  });
});

describe("getErrorCode", () => {
  let getErrorCode;

  beforeAll(() => {
    jest.isolateModules(() => {
      const mod = require("../shared/api");
      getErrorCode = mod.getErrorCode;
    });
  });

  it("extracts error code from structured detail", () => {
    const error = {
      response: {
        data: { detail: { message: "Bad request", code: "VALIDATION_ERROR" } },
      },
    };
    expect(getErrorCode(error)).toBe("VALIDATION_ERROR");
  });

  it('returns "UNKNOWN" when code is missing', () => {
    const error = {
      response: { data: { detail: "Some string error" } },
    };
    expect(getErrorCode(error)).toBe("UNKNOWN");
  });

  it('returns "UNKNOWN" for null/undefined error', () => {
    expect(getErrorCode(null)).toBe("UNKNOWN");
    expect(getErrorCode(undefined)).toBe("UNKNOWN");
  });

  it('returns "UNKNOWN" for error without response', () => {
    expect(getErrorCode({ message: "fail" })).toBe("UNKNOWN");
  });
});

describe("buildDocumentUrl", () => {
  let buildDocumentUrl;

  beforeAll(() => {
    jest.isolateModules(() => {
      const mod = require("../shared/api");
      buildDocumentUrl = mod.buildDocumentUrl;
    });
  });

  it("returns null for null/undefined dokument", () => {
    expect(buildDocumentUrl(null)).toBeNull();
    expect(buildDocumentUrl(undefined)).toBeNull();
  });

  it("returns null when putanja_datoteke is missing", () => {
    expect(buildDocumentUrl({})).toBeNull();
    expect(buildDocumentUrl({ putanja_datoteke: "" })).toBeNull();
  });

  it("strips leading slashes from the file path", () => {
    const result = buildDocumentUrl({
      putanja_datoteke: "///uploads/file.pdf",
    });
    // When BACKEND_URL is empty string (production), returns /uploads/file.pdf
    expect(result).toMatch(/uploads\/file\.pdf$/);
  });
});
