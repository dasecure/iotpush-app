/**
 * The JS side of the Apple Shortcuts integration.
 *
 * Everything here degrades to "not supported": on Android, in Expo Go, or in
 * any build without the native module, `supported` is false and the Settings
 * screen simply doesn't render the section. No platform checks leak anywhere
 * else in the app.
 *
 * Enabling mints a scoped account API key over the user's own session
 * (PR #11 opened /api/keys to the mobile JWT) and hands it straight to the
 * Keychain via the bridge. The key never touches AsyncStorage and is never
 * held in JS longer than the enable call.
 */
import { NativeModules, Platform } from "react-native";
import { supabase } from "./supabase";

const bridge =
  Platform.OS === "ios" ? (NativeModules as any).IotpushShortcutsBridge : null;

const KEY_NAME = "Apple Shortcuts";
// Exactly what the two intents need, nothing more. No topics:write, no
// receipts:read — a stolen phone should not be able to widen its own access.
const KEY_SCOPES = ["push:send", "questions:ask", "questions:read"];

export const appleShortcuts = {
  supported: !!bridge,

  async isEnabled(): Promise<boolean> {
    if (!bridge) return false;
    try {
      return await bridge.hasApiKey();
    } catch {
      return false;
    }
  },

  /** Mint the key and store it in the Keychain. Throws with a user-facing message. */
  async enable(): Promise<void> {
    if (!bridge) throw new Error("Apple Shortcuts requires an iOS build of the app.");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("You need to be signed in.");

    const response = await fetch("https://www.iotpush.com/api/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        name: KEY_NAME,
        scopes: KEY_SCOPES,
        // Re-enabling or reinstalling must replace the old key, not pile up
        // orphans until the account's key limit is hit.
        replace_existing: true,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.key) {
      throw new Error(result.error || "Could not create the Shortcuts key. Try again.");
    }

    await bridge.setApiKey(result.key);
  },

  /**
   * Clear the Keychain, then best-effort revoke the key server-side. The local
   * clear is the part that must succeed — a Keychain with no key means the
   * intents fail closed. Revocation failing (offline, session expired) leaves
   * a dormant key the dashboard can revoke, which the UI says out loud.
   */
  async disable(): Promise<{ revoked: boolean }> {
    if (!bridge) return { revoked: false };

    await bridge.clearApiKey();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { revoked: false };
      const auth = { Authorization: `Bearer ${session.access_token}` };

      const list = await fetch("https://www.iotpush.com/api/keys", { headers: auth });
      const { keys } = await list.json();
      const mine = (keys || []).filter(
        (k: any) => k.name === KEY_NAME && !k.revoked_at
      );
      let revoked = false;
      for (const k of mine) {
        const res = await fetch(`https://www.iotpush.com/api/keys/${k.id}`, {
          method: "DELETE",
          headers: auth,
        });
        revoked = revoked || res.ok;
      }
      return { revoked };
    } catch {
      return { revoked: false };
    }
  },
};
