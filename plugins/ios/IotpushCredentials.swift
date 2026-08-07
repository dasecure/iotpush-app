//
// The one credential the Shortcuts integration has, stored in the Keychain.
//
// The app's Supabase session lives in AsyncStorage, whose on-disk layout is an
// implementation detail of a JS library — nothing native should build on it.
// Instead, the Settings toggle mints a scoped account API key over the normal
// authenticated API and hands it to this store through the RN bridge. The
// intents read it from here and nowhere else.
//
// kSecAttrAccessibleAfterFirstUnlock, not WhenUnlocked: an intent triggered by
// an automation can run while the phone is locked (post first unlock), and a
// credential the intent cannot read is indistinguishable from "not enabled".
//
import Foundation
import Security

enum IotpushCredentials {
  private static let service = "com.dasecure.iotpush.shortcuts"
  private static let account = "api_key"

  static func apiKey() -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
          let data = item as? Data,
          let key = String(data: data, encoding: .utf8),
          !key.isEmpty
    else { return nil }
    return key
  }

  @discardableResult
  static func setApiKey(_ key: String) -> Bool {
    let data = Data(key.utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    let update: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
    ]
    let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
    if status == errSecItemNotFound {
      var add = query
      add[kSecValueData as String] = data
      add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
      return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }
    return status == errSecSuccess
  }

  @discardableResult
  static func clearApiKey() -> Bool {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    let status = SecItemDelete(query as CFDictionary)
    return status == errSecSuccess || status == errSecItemNotFound
  }
}
