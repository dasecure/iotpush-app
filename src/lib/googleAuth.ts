/**
 * "Continue with Google" — the device half. Protocol details live in
 * googleRedirect.ts.
 *
 * Flow:
 *   1. make app_state + a PKCE verifier from the OS CSPRNG (expo-crypto) and
 *      keep them in memory only. NOT supabase-js's signInWithOAuth: on Hermes
 *      there is no global WebCrypto, so it falls back to a Math.random()
 *      verifier sent as a "plain" challenge. Same primitives as zapqrAuth.ts
 *   2. open Supabase's /authorize for Google (S256) in the system browser —
 *      ASWebAuthenticationSession on iOS, a Custom Tab on Android. Never a
 *      WebView: Google blocks sign-in there, and the app must not see what is
 *      typed
 *   3. Supabase lands the code on iotpush.com/auth/native/google, which hands
 *      it to com.dasecure.iotpush://auth/google?code=…&app_state=…
 *   4. redeem { auth_code, code_verifier } at Supabase's token endpoint
 *   5. supabase.auth.setSession() — from here on nothing else in the app can
 *      tell this sign-in from an email one
 *
 * The redirect can reach us two ways: as the browser call's return value, or
 * as a plain deep link (always on Android). Both land in complete(), which
 * redeems an attempt exactly once and shares the outcome with whoever asks.
 */
import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";
import { base64url, toBase64url } from "./zapqrOidc";
import { bounceUrlFor, GOOGLE_APP_REDIRECT, isGoogleRedirect, parseGoogleRedirect } from "./googleRedirect";

export type GoogleSignInResult =
  | { status: "signed_in" }
  | { status: "cancelled" }
  | { status: "error"; message: string };

const GENERIC = "Google sign-in failed. Please try again.";
const OFFLINE = "Couldn't reach iotPush. Check your connection and try again.";
const EXCHANGE_TIMEOUT_MS = 20_000;

type Attempt = { state: string; verifier: string };
type Pending = { attempt: Attempt; outcome: Promise<GoogleSignInResult> | null };
let pending: Pending | null = null;

async function newAttempt(): Promise<{ attempt: Attempt; challenge: string }> {
  const [s, v] = await Promise.all([Crypto.getRandomBytesAsync(16), Crypto.getRandomBytesAsync(32)]);
  const attempt = { state: base64url(s), verifier: base64url(v) };
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, attempt.verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return { attempt, challenge: toBase64url(digest) };
}

function authorizeUrl(attempt: Attempt, challenge: string): string {
  const params: [string, string][] = [
    ["provider", "google"],
    ["redirect_to", bounceUrlFor(attempt.state)],
    ["code_challenge", challenge],
    ["code_challenge_method", "s256"],
    // Passed through to Google: pick or switch accounts every time.
    ["prompt", "select_account"],
  ];
  return `${SUPABASE_URL}/auth/v1/authorize?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

async function redeem(code: string, attempt: Attempt): Promise<GoogleSignInResult> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), EXCHANGE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ auth_code: code, code_verifier: attempt.verifier }),
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
  if (res.status === 429) return { status: "error", message: "Too many attempts. Please wait a minute and try again." };
  // Supabase's error text is not shown: it can name internals and is not written for people.
  if (!res.ok || typeof body?.access_token !== "string" || typeof body?.refresh_token !== "string") {
    return { status: "error", message: GENERIC };
  }

  const { error } = await supabase.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });
  if (error) return { status: "error", message: "We couldn't start your session. Please try again." };
  return { status: "signed_in" };
}

/** Redeem the pending attempt with this redirect — once. Null when there is nothing to redeem. */
function complete(url: string): Promise<GoogleSignInResult> | null {
  const p = pending;
  if (!p) return null;
  if (p.outcome) return p.outcome;

  const parsed = parseGoogleRedirect(url, p.attempt.state);
  if (!parsed.ok) {
    // Not addressed to this attempt: leave it pending so the real redirect can
    // still land. Anyone can fire our URL scheme; only state proves origin.
    if (parsed.reason === "not_ours" || parsed.reason === "state" || parsed.reason === "malformed") return null;
    p.outcome = Promise.resolve(
      parsed.reason === "cancelled" ? { status: "cancelled" as const } : { status: "error" as const, message: GENERIC },
    );
    return p.outcome;
  }
  p.outcome = redeem(parsed.code, p.attempt);
  return p.outcome;
}

/**
 * For the app's deep-link listener. Returns true when the URL is a Google
 * sign-in redirect (handled or not) so the caller can stop routing it.
 */
export function handleGoogleRedirect(url: string | null | undefined): boolean {
  if (!isGoogleRedirect(url)) return false;
  if (complete(url as string) && Platform.OS === "ios") {
    // Finished outside the sign-in sheet — close the sheet.
    try {
      WebBrowser.dismissAuthSession();
    } catch {
      /* nothing open */
    }
  }
  return true;
}

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  if (pending) return { status: "error", message: "A Google sign-in is already in progress." };

  let mine: Pending;
  let url: string;
  try {
    const { attempt, challenge } = await newAttempt();
    mine = { attempt, outcome: null };
    url = authorizeUrl(attempt, challenge);
  } catch {
    return { status: "error", message: GENERIC };
  }
  pending = mine;

  try {
    const result = await WebBrowser.openAuthSessionAsync(url, GOOGLE_APP_REDIRECT, {
      // Not ephemeral, unlike ZapQR: reusing the Google account already signed
      // in to the browser makes this one tap. prompt=select_account still lets
      // the person pick or switch accounts every time.
      preferEphemeralSession: false,
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
