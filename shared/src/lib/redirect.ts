// Same-origin redirect guard for auth hand-off targets (return_to /
// post_logout_redirect_uri). These arrive from the query string and are fed to
// react-router navigate() / Kratos loginUrl(); an unvalidated value is an
// open-redirect / re-phishing surface (CWE-601). We only ever navigate to a
// destination that resolves onto our own origin.

const DEFAULT_FALLBACK = "/";

/**
 * Resolve a caller-supplied redirect target to a safe, same-origin in-app path.
 *
 * Returns the `pathname + search + hash` of `raw` when it resolves onto the
 * current origin over http(s); otherwise returns `fallback` (default "/").
 * This rejects absolute cross-origin URLs, protocol-relative "//host",
 * backslash-obfuscated "/\\host", and non-http schemes such as "javascript:".
 */
export function safeInternalPath(raw: string | null | undefined, fallback: string = DEFAULT_FALLBACK): string {
  if (!raw) return fallback;
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return fallback;
  }
  if (url.origin !== origin) return fallback;
  if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
  const path = `${url.pathname}${url.search}${url.hash}`;
  return path.startsWith("/") ? path : fallback;
}
