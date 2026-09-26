# Changelog

## Unreleased

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
