#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-eas.sh
# Run this ONCE from your local machine inside the iotpush-app repo directory.
# It links the repo to your existing expo.dev/accounts/dasecure/projects/iotpush
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo "🔧 IOTPush — EAS Setup"
echo "Project: https://expo.dev/accounts/dasecure/projects/iotpush"
echo ""

# 1. Install EAS CLI globally if not present
if ! command -v eas &> /dev/null; then
  echo "Installing EAS CLI..."
  npm install -g eas-cli@latest
fi

echo "EAS CLI version: $(eas --version)"
echo ""

# 2. Login to Expo (opens browser)
echo "Step 1/4: Login to Expo as dasecure..."
eas login
echo ""

# 3. Link to the existing project
# This updates app.json with the correct projectId from expo.dev
echo "Step 2/4: Linking to dasecure/iotpush project..."
eas init --id "$(eas project:info --json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo '')"

# If the above fails (project not yet initialized), use:
# eas init  ← interactive, will ask to link to existing project

echo ""

# 4. Configure credentials (EAS manages certs — recommended)
echo "Step 3/4: Setting up iOS credentials..."
echo "EAS will handle:"
echo "  - Apple Distribution Certificate"
echo "  - Provisioning Profile"
echo "  - Push notification certificates"
echo ""
echo "You'll need:"
echo "  - Apple ID: your Apple Developer account email"
echo "  - Team ID:  find at developer.apple.com/account (top right)"
echo ""
eas credentials

echo ""

# 5. Verify the setup with a dry run
echo "Step 4/4: Verifying config..."
eas build:inspect --platform ios --profile production
echo ""

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Add EXPO_TOKEN secret to GitHub:"
echo "     → expo.dev/settings/access-tokens → Create Token"
echo "     → github.com/dasecure/iotpush-app/settings/secrets/actions"
echo ""
echo "  2. Add IOTPUSH_TOPIC + IOTPUSH_API_KEY to GitHub secrets"
echo ""
echo "  3. Push to main — GitHub Actions takes it from there:"
echo "     git push origin main"
echo ""
echo "  4. Track builds at:"
echo "     https://expo.dev/accounts/dasecure/projects/iotpush/builds"
