# Changelog

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
