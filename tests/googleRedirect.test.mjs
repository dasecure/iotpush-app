// npm test   (node --experimental-strip-types --test)
import { test } from "node:test";
import assert from "node:assert/strict";

const { GOOGLE_APP_REDIRECT, GOOGLE_BOUNCE_URL, bounceUrlFor, isGoogleRedirect, parseGoogleRedirect } =
  await import("../src/lib/googleRedirect.ts");
const { isZapqrRedirect } = await import("../src/lib/zapqrOidc.ts");

const R = GOOGLE_APP_REDIRECT;
const STATE = "Zm9vYmFyYmF6cXV4cXV1eA";
const CODE = "3f6c1d2e-8a4b-4c5d-9e0f-1a2b3c4d5e6f";

test("constants match the server's hand-off route", () => {
  assert.equal(R, "com.dasecure.iotpush://auth/google");
  assert.equal(GOOGLE_BOUNCE_URL, "https://www.iotpush.com/auth/native/google");
  assert.equal(bounceUrlFor(STATE), `${GOOGLE_BOUNCE_URL}?app_state=${STATE}`);
});

test("recognises only our redirect, and never collides with ZapQR's", () => {
  assert.ok(isGoogleRedirect(R));
  assert.ok(isGoogleRedirect(`${R}?code=x`));
  assert.ok(!isGoogleRedirect(`${R}extra`));
  assert.ok(!isGoogleRedirect("com.dasecure.iotpush://auth/zapqr?code=x"));
  assert.ok(!isZapqrRedirect(`${R}?code=x`));
  assert.ok(!isGoogleRedirect("iotpush://subscribe?topic=a"));
  assert.ok(!isGoogleRedirect(null));
});

test("a matching state with a code completes", () => {
  assert.deepEqual(parseGoogleRedirect(`${R}?code=${CODE}&app_state=${STATE}`, STATE), { ok: true, code: CODE });
});

test("state is checked first — for errors too", () => {
  assert.deepEqual(parseGoogleRedirect(`${R}?code=${CODE}&app_state=other-state-value-x`, STATE), { ok: false, reason: "state" });
  assert.deepEqual(parseGoogleRedirect(`${R}?code=${CODE}`, STATE), { ok: false, reason: "state" });
  assert.deepEqual(parseGoogleRedirect(`${R}?error=cancelled`, STATE), { ok: false, reason: "state" });
  assert.deepEqual(parseGoogleRedirect(`${R}?code=${CODE}&app_state=${STATE}`, ""), { ok: false, reason: "state" });
});

test("maps the hand-off's two error codes", () => {
  assert.deepEqual(parseGoogleRedirect(`${R}?error=cancelled&app_state=${STATE}`, STATE), { ok: false, reason: "cancelled" });
  assert.deepEqual(parseGoogleRedirect(`${R}?error=signin_failed&app_state=${STATE}`, STATE), { ok: false, reason: "failed" });
});

test("refuses malformed and ambiguous input", () => {
  assert.deepEqual(parseGoogleRedirect(`${R}?app_state=${STATE}`, STATE), { ok: false, reason: "malformed" });
  assert.deepEqual(parseGoogleRedirect(`${R}?code=${"x".repeat(129)}&app_state=${STATE}`, STATE), { ok: false, reason: "malformed" });
  assert.deepEqual(parseGoogleRedirect(`${R}?code=a&code=b&app_state=${STATE}`, STATE), { ok: false, reason: "malformed" });
  assert.deepEqual(parseGoogleRedirect(`${R}?code=%E0%A4%A&app_state=${STATE}`, STATE), { ok: false, reason: "malformed" });
  assert.deepEqual(parseGoogleRedirect("https://evil.example/?code=x", STATE), { ok: false, reason: "not_ours" });
});
