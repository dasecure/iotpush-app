//
// The RN side of the credential handoff. JS mints the key over the normal
// authenticated API; this module's only job is to move it into the Keychain
// where the intents can read it. It never returns the key to JS.
//
import Foundation

@objc(IotpushShortcutsBridge)
class IotpushShortcutsBridge: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func setApiKey(
    _ key: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    if IotpushCredentials.setApiKey(key) {
      resolve(true)
    } else {
      reject("keychain_error", "Could not store the key in the Keychain.", nil)
    }
  }

  @objc func clearApiKey(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    _ = IotpushCredentials.clearApiKey()
    resolve(true)
  }

  @objc func hasApiKey(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(IotpushCredentials.apiKey() != nil)
  }
}
