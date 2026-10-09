/**
 * "Continue with Google" — the protocol half, with no React Native imports so
 * it can be unit-tested under plain Node. googleAuth.ts is the part that
 * touches the device.
 *
 * Supabase runs Google OAuth with PKCE. Its redirect allow list covers
 * https://www.iotpush.com/** but not our URL scheme, so the code lands on
 * iotpush.com/auth/native/google first, which hands it straight to
 *
 *   com.dasecure.iotpush://auth/google?code=…&app_state=…
 *
 * The code is useless without the code_verifier that never leaves this app
 * instance. `app_state` is our own random value, echoed back by that page, so
 * a redirect this app did not start (another app firing our scheme) can
 * neither complete nor cancel a sign-in in flight — the same rule as ZapQR.
 */

export const GOOGLE_APP_REDIRECT = "com.dasecure.iotpush://auth/google";
export const GOOGLE_BOUNCE_URL = "https://www.iotpush.com/auth/native/google";

/** Where Supabase sends the browser after Google: our hand-off page, tagged with this attempt's state. */
export function bounceUrlFor(appState: string): string {
  return `${GOOGLE_BOUNCE_URL}?app_state=${encodeURIComponent(appState)}`;
}

/** True for any URL on our redirect, whatever follows — keeps it away from the app's deep-link router. */
export function isGoogleRedirect(url: string | null | undefined): boolean {
  if (!url || !url.startsWith(GOOGLE_APP_REDIRECT)) return false;
  const rest = url.slice(GOOGLE_APP_REDIRECT.length);
  return rest === "" || rest[0] === "?" || rest[0] === "#";
}

// Same strict parser as zapqrOidc.ts, kept local so this file stays import-free
// (it runs under plain Node in tests). A repeated parameter is refused.
function parseQuery(url: string): Record<string, string> | null {
  const q = url.indexOf("?");
  if (q < 0) return {};
  const hash = url.indexOf("#", q);
  const out: Record<string, string> = {};
  try {
    for (const pair of url.slice(q + 1, hash < 0 ? undefined : hash).split("&")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      const k = decodeURIComponent((eq < 0 ? pair : pair.slice(0, eq)).replace(/\+/g, " "));
      const v = eq < 0 ? "" : decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, " "));
      if (Object.prototype.hasOwnProperty.call(out, k)) return null;
      out[k] = v;
    }
  } catch {
    return null; // malformed percent-encoding
  }
  return out;
}

export type GoogleCallback =
  | { ok: true; code: string }
  | { ok: false; reason: "not_ours" | "malformed" | "state" | "cancelled" | "failed" };

/**
 * Order matters: state first, for errors too — then the outcome.
 * The hand-off page only ever sends error=cancelled or error=signin_failed.
 */
export function parseGoogleRedirect(url: string, expectedState: string): GoogleCallback {
  if (!isGoogleRedirect(url)) return { ok: false, reason: "not_ours" };
  const q = parseQuery(url);
  if (!q) return { ok: false, reason: "malformed" };
  if (!expectedState || q.app_state !== expectedState) return { ok: false, reason: "state" };
  if (q.error) return { ok: false, reason: q.error === "cancelled" ? "cancelled" : "failed" };
  if (!q.code || q.code.length > 128) return { ok: false, reason: "malformed" };
  return { ok: true, code: q.code };
}
