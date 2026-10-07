// npm test   (node --experimental-strip-types --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";

const {
  base64url, toBase64url, buildAuthorizeUrl, cleanLoginHint, isZapqrRedirect, parseCallback,
  ZAPQR_ISSUER, ZAPQR_CLIENT_ID, ZAPQR_REDIRECT_URI, ZAPQR_EXCHANGE_URL,
} = await import("../src/lib/zapqrOidc.ts");

const R = ZAPQR_REDIRECT_URI;
const ISS = `iss=${encodeURIComponent(ZAPQR_ISSUER)}`;

test("constants match the IdP registration and the server", () => {
  assert.equal(ZAPQR_ISSUER, "https://auth.zapqr.ai");
  assert.equal(ZAPQR_CLIENT_ID, "zq_iotpush_app");
  assert.equal(R, "com.dasecure.iotpush://auth/zapqr");
  assert.equal(ZAPQR_EXCHANGE_URL, "https://www.iotpush.com/api/auth/zapqr/native");
});

test("base64url agrees with Node for every length 0..64 and for random data", () => {
  for (let n = 0; n <= 64; n++) {
    const b = randomBytes(n);
    assert.equal(base64url(new Uint8Array(b)), b.toString("base64url"), `len ${n}`);
  }
  assert.equal(base64url(new Uint8Array([0xfb, 0xff, 0xfe])), "-__-");
});

test("PKCE: a 32-byte verifier is 43 chars and its S256 challenge matches RFC 7636", () => {
  const verifier = base64url(new Uint8Array(randomBytes(32)));
  assert.match(verifier, /^[A-Za-z0-9\-_]{43}$/);
  // RFC 7636 Appendix B test vector.
  const v = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const nativeStyle = createHash("sha256").update(v).digest("base64"); // what expo-crypto returns
  assert.equal(toBase64url(nativeStyle), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("authorize URL: code flow, S256, exact redirect, nonce and state present", () => {
  const u = new URL(buildAuthorizeUrl({ state: "st-1", nonce: "no-1" }, "chal", " Vincent@DaSecure.com "));
  assert.equal(u.origin + u.pathname, "https://auth.zapqr.ai/auth");
  const p = u.searchParams;
  assert.equal(p.get("client_id"), "zq_iotpush_app");
  assert.equal(p.get("redirect_uri"), R);
  assert.equal(p.get("response_type"), "code");
  assert.equal(p.get("scope"), "openid email");
  assert.equal(p.get("state"), "st-1");
  assert.equal(p.get("nonce"), "no-1");
  assert.equal(p.get("code_challenge"), "chal");
  assert.equal(p.get("code_challenge_method"), "S256");
  assert.equal(p.get("login_hint"), "vincent@dasecure.com");
  // Never asks for more than it needs, never sends a secret or the verifier.
  for (const k of ["client_secret", "code_verifier", "prompt", "resource"]) assert.equal(p.get(k), null, k);
});

test("login_hint is dropped unless it is shaped like an address; it cannot inject parameters", () => {
  for (const bad of [null, undefined, "", "nope", "a@b", "a b@c.d"]) assert.equal(cleanLoginHint(bad), null, String(bad));
  const u = new URL(buildAuthorizeUrl({ state: "s", nonce: "n" }, "c", "a@b.co&redirect_uri=evil://x"));
  assert.equal(u.searchParams.getAll("redirect_uri").length, 1);
  assert.equal(u.searchParams.get("redirect_uri"), R);
});

test("isZapqrRedirect: only our exact redirect, with or without a query", () => {
  for (const yes of [R, `${R}?code=x`, `${R}#frag`]) assert.equal(isZapqrRedirect(yes), true, yes);
  for (const no of [null, undefined, "", "iotpush://inbox", "iotpush://auth/zapqr?code=x", `${R}x?code=1`, `${R}/more`, "com.dasecure.iotpush://subscribe?topic=a", `https://evil.example/?u=${R}`]) {
    assert.equal(isZapqrRedirect(no), false, String(no));
  }
});

test("callback: the happy path yields the code", () => {
  assert.deepEqual(parseCallback(`${R}?code=abc_123-XYZ&state=st&${ISS}`, "st"), { ok: true, code: "abc_123-XYZ" });
  assert.deepEqual(parseCallback(`${R}?state=st&${ISS}&code=a%2Bb#ignored`, "st"), { ok: true, code: "a+b" });
});

test("callback: state is checked first — a foreign redirect can neither complete nor cancel", () => {
  assert.equal(parseCallback(`${R}?code=abc&state=other&${ISS}`, "st").reason, "state");
  assert.equal(parseCallback(`${R}?code=abc&${ISS}`, "st").reason, "state");
  assert.equal(parseCallback(`${R}?error=access_denied&state=other&${ISS}`, "st").reason, "state");
  assert.equal(parseCallback(`${R}?code=abc&state=&${ISS}`, "").reason, "state");
});

test("callback: issuer (RFC 9207) must be present and exact", () => {
  assert.equal(parseCallback(`${R}?code=abc&state=st`, "st").reason, "issuer");
  assert.equal(parseCallback(`${R}?code=abc&state=st&iss=https%3A%2F%2Fevil.example`, "st").reason, "issuer");
  assert.equal(parseCallback(`${R}?code=abc&state=st&iss=https%3A%2F%2Fauth.zapqr.ai%2F`, "st").reason, "issuer");
});

test("callback: errors, cancellation, and junk", () => {
  assert.equal(parseCallback(`${R}?error=access_denied&state=st&${ISS}`, "st").reason, "cancelled");
  assert.equal(parseCallback(`${R}?error=server_error&state=st&${ISS}`, "st").reason, "idp_error");
  // An error wins over a code that rides along with it.
  assert.equal(parseCallback(`${R}?error=invalid_request&code=abc&state=st&${ISS}`, "st").reason, "idp_error");
  assert.equal(parseCallback(`${R}?state=st&${ISS}`, "st").reason, "malformed");
  assert.equal(parseCallback(`${R}?code=${"x".repeat(513)}&state=st&${ISS}`, "st").reason, "malformed");
  assert.equal(parseCallback(`${R}?code=%E0%A4%A&state=st&${ISS}`, "st").reason, "malformed");
  // Duplicated parameters are ambiguous and refused, whichever copy is "right".
  assert.equal(parseCallback(`${R}?code=a&code=b&state=st&${ISS}`, "st").reason, "malformed");
  assert.equal(parseCallback(`${R}?code=a&state=st&state=other&${ISS}`, "st").reason, "malformed");
  assert.equal(parseCallback("iotpush://auth/zapqr?code=a&state=st", "st").reason, "not_ours");
  // Prototype keys are just strings.
  assert.equal(parseCallback(`${R}?__proto__=x&code=a&state=st&${ISS}`, "st").ok, true);
});
