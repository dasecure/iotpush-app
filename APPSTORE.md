# iotpush — App Store Submission

## App Information

- **App Name:** iotpush
- **Subtitle:** IoT push notifications
- **Bundle ID:** com.dasecure.iotpush
- **SKU:** iotpush
- **ASC App ID:** 6758430222
- **Primary Language:** English (U.S.)
- **Category:** Developer Tools
- **Secondary Category:** Utilities
- **Content Rights:** Does not contain third-party content
- **Age Rating:** 4+ (no objectionable content)

## Version Information

- **Version:** 1.0.0
- **Build:** (from EAS)
- **Copyright:** © 2026 DaSecure Solutions LLC

## App Store Description

### Short Description (App Store subtitle, 30 chars)
IoT push notifications

### Promotional Text (170 chars)
Get instant push notifications from your IoT devices, servers, and scripts. One HTTP POST = one notification on your phone. No complex setup needed.

### Description (4000 chars max)
iotpush delivers push notifications from your IoT devices, servers, and automation scripts straight to your phone. No complex setup — just send an HTTP request and get notified instantly.

**Simple by design**
Send a single HTTP POST request to get a push notification. No SDKs to install, no webhooks to configure, no polling. If your device can make an HTTP request, it can send you a push notification.

**Organize with Topics**
Create topics to group your notifications. Monitor your home sensors in one topic, your server alerts in another, and your CI/CD pipelines in a third.

**Key Features:**
• Instant push notifications via simple REST API
• Topic-based message organization
• Subscribe/unsubscribe to specific topics
• Full message history with timestamps
• Pull-to-refresh for latest messages
• Dark mode interface
• Works with any device that can make HTTP requests

**Use Cases:**
• IoT sensor alerts (temperature, humidity, motion)
• Server monitoring and uptime alerts
• CI/CD build notifications
• Smart home automation triggers
• Cron job completion alerts
• Custom app notifications
• Raspberry Pi / Arduino / ESP32 projects

**How it works:**
1. Create an account at iotpush.com
2. Create a topic and get your API key
3. Send an HTTP POST from your device/script:
   ```
   curl -X POST https://iotpush.com/api/send \
     -H "x-api-key: YOUR_KEY" \
     -d '{"topic":"alerts","title":"Temp High","body":"Sensor reads 95°F"}'
   ```
4. Get instant push notification on your phone!

**For developers, by developers.** Built for the maker community — hobbyists, IoT tinkerers, and developers who need a quick, reliable way to get notified.

iotpush requires an iotpush.com account. Free tier includes 3 topics and 100 messages/month.

**Privacy focused:** We only collect data necessary for delivering notifications. No tracking, no ads.

### Keywords (100 chars max)
iot,push,notification,alert,sensor,mqtt,api,webhook,server,monitor,arduino,raspberry,smart home

## App Review Information

### Review Notes
This app receives push notifications from IoT devices and servers via the iotpush.com REST API. To test:

1. Log in with the demo account below
2. You'll see a list of topics (notification channels)
3. Tap a topic to see its message history
4. To trigger a live notification, run this curl command:

```
curl -X POST https://www.iotpush.com/api/push/demo-alerts \
  -H "Content-Type: application/json" \
  -H "x-api-key: demo_ac7a77a9ae74448461a047bc0f2cc1a6" \
  -d '{"title":"Test Alert","message":"This is a test notification from App Review"}'
```

5. A push notification should appear on the device
6. The message also appears in the topic's message list

### Demo Account
- **Email:** review@iotpush.com
- **Password:** AppReview2026!
- **API Key:** demo_ac7a77a9ae74448461a047bc0f2cc1a6
- **Demo Topic:** demo-alerts (pre-loaded with 4 sample messages)

### Contact
- **First Name:** Vincent
- **Last Name:** Ooi
- **Email:** vincent@dasecure.com
- **Phone:** (Vincent's phone number)

## Screenshots Needed

### iPhone 6.7" (iPhone 15 Pro Max) — REQUIRED
1. **Topics list** — Shows topics with message counts and subscription toggles
2. **Messages view** — Message list for a topic with timestamps
3. **Push notification** — Lock screen or banner notification from iotpush
4. **Create topic** — Modal for creating a new topic
5. **Login screen** — Clean login form with iotpush branding

### iPhone 6.5" (iPhone 14 Plus) — REQUIRED
Same 5 screenshots

### iPhone 5.5" (iPhone 8 Plus) — REQUIRED  
Same 5 screenshots

### Screenshot Specifications
- 6.7": 1290 x 2796 px
- 6.5": 1284 x 2778 px
- 5.5": 1242 x 2208 px
- Format: PNG or JPEG, no alpha

## App Privacy (Privacy Nutrition Labels)

### Data Collected
| Data Type | Collection | Linked to Identity | Used for Tracking |
|-----------|-----------|-------------------|-------------------|
| Email Address | Yes | Yes | No |
| User ID | Yes | Yes | No |
| Product Interaction | Yes (messages) | Yes | No |
| Device ID | Yes (push token) | Yes | No |

### Data Not Collected
- Location, Health, Financial, Contacts, Photos, Search History, Browsing History, Name

### Privacy Policy URL
https://www.iotpush.com/privacy

## Build & Submit Commands

```bash
# Build for iOS
cd iotpush-app
eas build --platform ios --profile production

# Submit to App Store Connect  
eas submit --platform ios --profile production

# Build + submit
eas build --platform ios --profile production --auto-submit

# Android (Google Play)
eas build --platform android --profile production
```

## Google Play Submission

### Short Description (80 chars)
Get instant push notifications from your IoT devices and servers.

### Full Description
(Same as App Store description above, minus the code block formatting)

### Category: Tools
### Content Rating: Everyone
### Target Audience: 18+

### Screenshots: Same as iOS but 1080x1920 px for phone

## Pre-Submission Checklist

- [ ] Create demo account (review@iotpush.com) with demo topic and API key
- [ ] Test the demo curl command works end-to-end
- [ ] Take all required screenshots (5 per size, 3 sizes)  
- [ ] Verify app icon meets guidelines (1024x1024, no alpha, no rounded corners)
- [ ] Verify privacy policy is live at iotpush.com/privacy
- [ ] Verify Terms of Service at iotpush.com/terms
- [ ] Set up App Store Connect listing (ASC ID: 6758430222 already exists)
- [ ] Fix Android EAS build (newArchEnabled=false)
- [ ] EAS iOS production build succeeds
- [ ] Test production build on real device
- [ ] Verify push notifications work on production build
