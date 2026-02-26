/**
 * Accessibility utilities for Riforma.
 */

/**
 * Announce a message to screen readers via aria-live region.
 */
export const announce = (message, priority = "polite") => {
  const el = document.getElementById("aria-live-region");
  if (el) {
    el.setAttribute("aria-live", priority);
    el.textContent = "";
    // Force re-announcement by clearing and setting async
    requestAnimationFrame(() => {
      el.textContent = message;
    });
  }
};

/**
 * Trap focus within a container element.
 * Returns cleanup function.
 */
export const trapFocus = (containerEl) => {
  if (!containerEl) return () => {};

  const focusable = containerEl.querySelectorAll(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  const handler = (e) => {
    if (e.key !== "Tab") return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };

  containerEl.addEventListener("keydown", handler);
  first?.focus();

  return () => containerEl.removeEventListener("keydown", handler);
};

/**
 * Generate a unique ID for aria-describedby linking.
 */
let _idCounter = 0;
export const generateAriaId = (prefix = "aria") => {
  _idCounter += 1;
  return `${prefix}-${_idCounter}`;
};

/**
 * KeyboardShortcuts - common keyboard handlers.
 */
export const handleEscapeKey = (callback) => (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    callback();
  }
};

export const handleEnterKey = (callback) => (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    callback();
  }
};
