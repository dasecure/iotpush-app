#!/usr/bin/env bash
# Wait for an EAS build to finish. eas-cli has no `build:wait` command,
# so poll `build:view --json`. Exit 0 on FINISHED, 1 on ERRORED/CANCELED/timeout.
set -euo pipefail
BUILD_ID="${1:?usage: eas-wait.sh <build-id> [timeout-minutes]}"
TIMEOUT_MIN="${2:-90}"
deadline=$(( $(date +%s) + TIMEOUT_MIN * 60 ))
last=""
while :; do
  status=$(eas build:view "$BUILD_ID" --json 2>/dev/null | jq -r '.status // empty' || true)
  if [ -n "$status" ] && [ "$status" != "$last" ]; then
    echo "$(date -u +%H:%M:%S) build $BUILD_ID: $status"; last="$status"
  fi
  case "$status" in
    FINISHED) exit 0 ;;
    ERRORED|CANCELED)
      echo "::error::EAS build $BUILD_ID ended $status — https://expo.dev/accounts/dasecure/projects/iotpush/builds/$BUILD_ID"
      exit 1 ;;
  esac
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "::error::Timed out after ${TIMEOUT_MIN}m waiting for build $BUILD_ID (last status: ${status:-unknown})"
    exit 1
  fi
  sleep 30
done
