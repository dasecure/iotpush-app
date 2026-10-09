# Changelog

## 2.5.0 — 2026-10-09

### Continue with Google (iOS + Android), sign-in aligned with iotpush.com
- "Continue with Google" under "Continue with ZapQR" on login and signup. Supabase Google OAuth
  with PKCE (S256, verifier from expo-crypto — not supabase-js, which falls back to Math.random
  on Hermes) in the system browser. New and returning accounts alike.
- The code returns via iotpush.com `/auth/native/google` (inside the existing Supabase redirect
  allow list) to `com.dasecure.iotpush://auth/google`; an app_state echo means a redirect the
  app did not start can neither complete nor cancel a sign-in. Requires that web route deployed.
- Login and signup now match the website word for word: ZapQR, Google, "No password needed." /
  "One step. No password, no confirmation email.", then email. "Log In" -> "Sign In".
- JS + assets only (no new native modules): ships as a store build or an OTA update.

### Sign in with ZapQR (iOS + Android)
- "Continue with ZapQR" on the login screen and "Sign up with ZapQR" on signup: passkey
  sign-in through auth.zapqr.ai in the system browser (authorization code + PKCE). New and
  returning accounts alike — no password, no confirmation email. Email + password still works.
- Lands on the same iotPush account as the website's ZapQR button (matched by ZapQR identity,
  first time by verified email).
- Adds `expo-web-browser` + `expo-crypto` and the `com.dasecure.iotpush://` URL scheme, so this
  needs a new store build (not an OTA update). Requires iotpush.com `POST /api/auth/zapqr/native`.

### Performance — Topics refresh
- Topics screen now loads via one `topics_overview()` RPC (migration 013) instead of
  3 + N sequential requests (one `count(*)` per topic, awaited serially). 27 topics:
  ~30 round trips → 1 (server time ≈ 6 ms).
- Subscription state and topics refresh in parallel; subscription fetch no longer
  re-runs on every topic-list change.
- Topic filter box appears once you have more than 6 topics; cards show last activity.

### Inbox search & filters
- Debounced server-side search over title + body (trigram index), with match highlighting.
- Filter chips: topic multi-select picker, Needs answer, priority, 24h/7d/30d, Has link,
  My topics / Subscribed. Clear-all, no-match empty state, infinite scroll (50/page).
- Inbox now includes subscribed topics (filterable via the Subscribed / My topics chips).
- Realtime inserts respect the active search and filters.

### Security
- Subscribers no longer receive or see the owner's API key for private topics.

## v2.0.0 (2026-04-06)

### Two-Way Notification System
- Device auto-registers with /api/devices on push token acquisition
- Notification actions: dynamically registers Expo categories from actions payload
- Action tap reports to server via POST /api/action, triggers webhooks
- Reply-type actions supported with text input
- URL-type actions open links and report

### Cross-Device Subscribe
- New Subscribe screen: enter topic name + optional API key
- Subscribe button in Topics header
- Calls POST /api/subscribe endpoint
- Supports private topic access control

### CI/CD
- GitHub Actions: auto-build iOS + Android on push to main
- Auto-submit iOS to App Store Connect / TestFlight
- IOTPush notification on build completion
- Manual trigger with platform/profile/submit options
- PR preview builds

## v1.1.1

- Icon format fix
- Version bump

## v1.1.0

- Initial release with topic management, push notifications, Pushover compat
