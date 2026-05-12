/**
 * Shared helper for "save server PDF as a file" flows.
 *
 * Handles the boilerplate around an axios `responseType: "blob"` response:
 *   - wrap in a Blob with the right MIME type
 *   - trigger a browser download via a transient <a download>
 *   - clean up the object URL
 *
 * Also handles the case where the server returns a JSON error body — axios
 * delivers that as a Blob too, so we read it back as text and parse out the
 * `detail` / `message` field for the toast.
 */

export const downloadPdfFromResponse = (axiosResponse, filename) => {
  const blob = new Blob([axiosResponse.data], { type: "application/pdf" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

export const extractBlobErrorDetail = async (
  err,
  fallback = "Greška pri generiranju PDF-a.",
) => {
  try {
    const blob = err?.response?.data;
    if (blob && typeof blob.text === "function") {
      const text = await blob.text();
      const parsed = JSON.parse(text);
      return parsed?.detail || parsed?.message || fallback;
    }
  } catch (_) {
    /* fall through */
  }
  return fallback;
};
