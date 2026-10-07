/**
 * "Continue with ZapQR" — the protocol half, with no React Native imports so
 * it runs under `node --test` exactly as it runs on a phone.
 *
 * The app is a PUBLIC OpenID Connect client of auth.zapqr.ai: authorization
 * code + PKCE (S256) in the system browser, redirect back on the app's own
 * reverse-DNS scheme (RFC 8252). It never sees a client secret and never
 * redeems the code itself — the code, the PKCE verifier and the nonce go to
 * iotpush.com, which redeems them and answers with a Supabase session. See
 * zapqrAuth.ts for the part that touches the device.
 */

export const ZAPQR_ISSUER = "https://auth.zapqr.ai";
/** Registered at the IdP as a first-party native client. Public, not a secret. */
export const ZAPQR_CLIENT_ID = "zq_iotpush_app";
/** Must match the IdP registration AND the server's constant, character for character. */
export const ZAPQR_REDIRECT_URI = "com.dasecure.iotpush://auth/zapqr";
export const ZAPQR_EXCHANGE_URL = "https://www.iotpush.com/api/auth/zapqr/native";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** RFC 4648 §5, unpadded. Hand-rolled: no Buffer on Hermes, and btoa wants a binary string. */
export function base64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    if (i + 1 < bytes.length) out += B64[((b & 15) << 2) | (c >> 6)];
    if (i + 2 < bytes.length) out += B64[c & 63];
  }
  return out;
}

/** Standard base64 (what the native SHA-256 returns) -> base64url, unpadded. */
export function toBase64url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type ZapqrTx = { state: string; nonce: string; verifier: string };

/** A login_hint worth forwarding: shaped like an address, nothing more. */
export function cleanLoginHint(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

export function buildAuthorizeUrl(tx: Pick<ZapqrTx, "state" | "nonce">, challenge: string, loginHint?: string | null): string {
  const params: [string, string][] = [
    ["client_id", ZAPQR_CLIENT_ID],
    ["redirect_uri", ZAPQR_REDIRECT_URI],
    ["response_type", "code"],
    ["scope", "openid email"],
    ["state", tx.state],
    ["nonce", tx.nonce],
    ["code_challenge", challenge],
    ["code_challenge_method", "S256"],
  ];
  const hint = cleanLoginHint(loginHint);
  if (hint) params.push(["login_hint", hint]);
  return `${ZAPQR_ISSUER}/auth?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

/** True for any URL on our redirect, whatever follows — used to keep it away from the app's deep-link router. */
export function isZapqrRedirect(url: string | null | undefined): boolean {
  if (!url || !url.startsWith(ZAPQR_REDIRECT_URI)) return false;
  const rest = url.slice(ZAPQR_REDIRECT_URI.length);
  return rest === "" || rest[0] === "?" || rest[0] === "#";
}

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
      // A repeated parameter is ambiguous by definition (RFC 6749 §3.1) — refuse.
      if (Object.prototype.hasOwnProperty.call(out, k)) return null;
      out[k] = v;
    }
  } catch {
    return null; // malformed percent-encoding
  }
  return out;
}

export type CallbackResult =
  | { ok: true; code: string }
  | { ok: false; reason: "not_ours" | "malformed" | "state" | "issuer" | "cancelled" | "idp_error" };

/**
 * What the browser handed back. Order matters:
 *   state   first, for errors too — a redirect we did not start (another app
 *           firing our scheme) can neither complete nor cancel a sign-in
 *   iss     RFC 9207: the response must say it came from auth.zapqr.ai. The
 *           IdP always sends it, so a missing one is refused, not waved through
 *   error   access_denied is the person changing their mind, not a failure
 */
export function parseCallback(url: string, expectedState: string): CallbackResult {
  if (!isZapqrRedirect(url)) return { ok: false, reason: "not_ours" };
  const q = parseQuery(url);
  if (!q) return { ok: false, reason: "malformed" };
  if (!expectedState || q.state !== expectedState) return { ok: false, reason: "state" };
  if (q.iss !== ZAPQR_ISSUER) return { ok: false, reason: "issuer" };
  if (q.error) return { ok: false, reason: q.error === "access_denied" ? "cancelled" : "idp_error" };
  if (!q.code || q.code.length > 512) return { ok: false, reason: "malformed" };
  return { ok: true, code: q.code };
}
