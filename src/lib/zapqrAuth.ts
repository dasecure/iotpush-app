/**
 * "Continue with ZapQR" — the device half. Protocol details live in
 * zapqrOidc.ts; this file opens the browser, keeps the one in-flight
 * transaction, and turns the server's answer into a Supabase session.
 *
 * Flow:
 *   1. make state + nonce + PKCE verifier (OS CSPRNG), keep them in memory only
 *   2. open auth.zapqr.ai in the system browser — ASWebAuthenticationSession on
 *      iOS, a Custom Tab on Android. Never a WebView: passkeys need the real
 *      browser, and the app must not be able to see what is typed there
 *   3. the browser returns to com.dasecure.iotpush://auth/zapqr?code=…
 *   4. POST { code, code_verifier, nonce } to iotpush.com, which redeems the
 *      code, verifies the ID token and returns an ordinary Supabase session
 *   5. supabase.auth.setSession() — from here on nothing else in the app can
 *      tell this sign-in from an email one
 *
 * The redirect can reach us two ways: as the browser call's return value, or
 * as a plain deep link (always on Android; on iOS when the person finished in
 * Safari, e.g. from an emailed link). Both land in complete(), which redeems a
 * transaction exactly once and shares the outcome with whoever else asks.
 */
import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";
import {
  base64url,
  buildAuthorizeUrl,
  isZapqrRedirect,
  parseCallback,
  toBase64url,
  ZAPQR_EXCHANGE_URL,
  ZAPQR_REDIRECT_URI,
  type ZapqrTx,
} from "./zapqrOidc";

export type ZapqrSignInResult =
  | { status: "signed_in" }
  | { status: "cancelled" }
  | { status: "error"; message: string };

const GENERIC = "ZapQR sign-in failed. Please try again.";
const OFFLINE = "Couldn't reach iotPush. Check your connection and try again.";
const EXCHANGE_TIMEOUT_MS = 20_000;

type Pending = { tx: ZapqrTx; outcome: Promise<ZapqrSignInResult> | null };
let pending: Pending | null = null;

async function newTx(): Promise<{ tx: ZapqrTx; challenge: string }> {
  const [s, n, v] = await Promise.all([
    Crypto.getRandomBytesAsync(16),
    Crypto.getRandomBytesAsync(16),
    Crypto.getRandomBytesAsync(32),
  ]);
  const tx = { state: base64url(s), nonce: base64url(n), verifier: base64url(v) };
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, tx.verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return { tx, challenge: toBase64url(digest) };
}

async function redeem(code: string, tx: ZapqrTx): Promise<ZapqrSignInResult> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), EXCHANGE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(ZAPQR_EXCHANGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ code, code_verifier: tx.verifier, nonce: tx.nonce }),
      signal: abort.signal,
    });
  } catch {
    return { status: "error", message: OFFLINE };
  } finally {
    clearTimeout(timer);
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* handled below */
  }

  if (!res.ok) {
    if (res.status === 429) return { status: "error", message: "Too many attempts. Please wait a minute and try again." };
    // The server only ever sends strings from its own fixed table.
    const msg = typeof body?.error === "string" && body.error.length <= 200 ? body.error : GENERIC;
    return { status: "error", message: msg };
  }
  if (typeof body?.access_token !== "string" || typeof body?.refresh_token !== "string") {
    return { status: "error", message: GENERIC };
  }

  const { error } = await supabase.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });
  if (error) return { status: "error", message: "We couldn't start your session. Please try again." };
  return { status: "signed_in" };
}

/** Redeem the pending transaction with this redirect — once. Null when there is nothing to redeem. */
function complete(url: string): Promise<ZapqrSignInResult> | null {
  const p = pending;
  if (!p) return null;
  if (p.outcome) return p.outcome;

  const parsed = parseCallback(url, p.tx.state);
  if (!parsed.ok) {
    // Not addressed to this transaction: leave it pending so the real redirect
    // can still land. Anyone can fire our URL scheme; only state proves origin.
    if (parsed.reason === "not_ours" || parsed.reason === "state" || parsed.reason === "malformed") return null;
    p.outcome = Promise.resolve(
      parsed.reason === "cancelled" ? { status: "cancelled" as const } : { status: "error" as const, message: GENERIC },
    );
    return p.outcome;
  }
  p.outcome = redeem(parsed.code, p.tx);
  return p.outcome;
}

/**
 * For the app's deep-link listener. Returns true when the URL is a ZapQR
 * redirect (handled or not) so the caller can stop routing it.
 */
export function handleZapqrRedirect(url: string | null | undefined): boolean {
  if (!isZapqrRedirect(url)) return false;
  if (complete(url as string) && Platform.OS === "ios") {
    // Finished outside the sign-in sheet (Safari) — close the sheet.
    try {
      WebBrowser.dismissAuthSession();
    } catch {
      /* nothing open */
    }
  }
  return true;
}

export async function signInWithZapQR(loginHint?: string | null): Promise<ZapqrSignInResult> {
  if (pending) return { status: "error", message: "A ZapQR sign-in is already in progress." };

  let mine: Pending;
  let authUrl: string;
  try {
    const { tx, challenge } = await newTx();
    mine = { tx, outcome: null };
    authUrl = buildAuthorizeUrl(tx, challenge, loginHint);
  } catch {
    return { status: "error", message: GENERIC };
  }
  pending = mine;

  try {
    const result = await WebBrowser.openAuthSessionAsync(authUrl, ZAPQR_REDIRECT_URI, {
      // iOS: a private sign-in sheet with no cookies shared with Safari. Every
      // tap of the button asks who you are (a passkey is one touch), so signing
      // out and in as someone else just works, and iOS shows no
      // "wants to use zapqr.ai to sign in" alert. Ignored on Android.
      preferEphemeralSession: true,
      showInRecents: true,
    });

    if (result.type === "success" && result.url) {
      const outcome = complete(result.url);
      if (outcome) return await outcome;
      return { status: "error", message: GENERIC };
    }
    // Sheet closed. If the redirect arrived as a deep link in the meantime,
    // that sign-in is the answer; otherwise the person backed out.
    if (mine.outcome) return await mine.outcome;
    return { status: "cancelled" };
  } catch {
    return { status: "error", message: GENERIC };
  } finally {
    if (pending === mine) pending = null;
  }
}
