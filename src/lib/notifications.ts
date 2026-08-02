import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform, Linking } from "react-native";
import { supabase } from "./supabase";
import type { NotificationAction } from "./types";

let AsyncStorage: any = null;
try {
  AsyncStorage = require("@react-native-async-storage/async-storage").default;
} catch {}

const API_BASE = "https://www.iotpush.com/api";

// ─── Configure notification behavior ───
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (e) {
  console.log("Failed to set notification handler:", e);
}

// ─── Create Android notification channels at startup (before auth) ───
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#f97316",
    sound: "default",
  }).catch((e) => console.log("Failed to create default channel:", e));

  Notifications.setNotificationChannelAsync("high-priority", {
    name: "High Priority",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 250, 500],
    lightColor: "#ef4444",
    sound: "default",
  }).catch((e) => console.log("Failed to create high-priority channel:", e));
}

// ─── Register static notification action categories at startup ───
// These must be registered BEFORE any notification arrives so iOS/Android
// can show the action buttons on the lock screen and notification shade.
//
// The server maps each push's actions array to one of these category IDs.
// You can use ANY action ids/labels in your push — the in-app buttons
// render dynamically. These static categories only affect the OS-level
// notification buttons (long-press on iOS, expand on Android).
const STATIC_CATEGORIES = [
  // Single actions
  {
    id: "iotpush_ack",
    actions: [
      { identifier: "ack", buttonTitle: "Acknowledge", options: { opensAppToForeground: true, isDestructive: false, isAuthenticationRequired: false } },
    ],
  },
  {
    id: "iotpush_reply_only",
    actions: [
      { identifier: "reply", buttonTitle: "Reply", options: { opensAppToForeground: true, isDestructive: false, isAuthenticationRequired: false }, textInput: { submitButtonTitle: "Send", placeholder: "Type your reply..." } },
    ],
  },
  // Two actions
  {
    id: "iotpush_ack_snooze",
    actions: [
      { identifier: "ack", buttonTitle: "Acknowledge", options: { opensAppToForeground: true, isDestructive: false, isAuthenticationRequired: false } },
      { identifier: "snooze", buttonTitle: "Snooze 5m", options: { opensAppToForeground: false, isDestructive: false, isAuthenticationRequired: false } },
    ],
  },
  {
    id: "iotpush_confirm_deny",
    actions: [
      { identifier: "confirm", buttonTitle: "Confirm", options: { opensAppToForeground: true, isDestructive: false, isAuthenticationRequired: false } },
      { identifier: "deny", buttonTitle: "Deny", options: { opensAppToForeground: true, isDestructive: true, isAuthenticationRequired: false } },
    ],
  },
  {
    id: "iotpush_approve_reject",
    actions: [
      { identifier: "approve", buttonTitle: "Approve", options: { opensAppToForeground: true, isDestructive: false, isAuthenticationRequired: false } },
      { identifier: "reject", buttonTitle: "Reject", options: { opensAppToForeground: true, isDestructive: true, isAuthenticationRequired: false } },
    ],
  },
  {
    id: "iotpush_yes_no",
    actions: [
      { identifier: "yes", buttonTitle: "Yes", options: { opensAppToForeground: true, isDestructive: false, isAuthenticationRequired: false } },
      { identifier: "no", buttonTitle: "No", options: { opensAppToForeground: true, isDestructive: false, isAuthenticationRequired: false } },
    ],
  },
  {
    id: "iotpush_open_dismiss",
    actions: [
      { identifier: "open", buttonTitle: "Open", options: { opensAppToForeground: true, isDestructive: false, isAuthenticationRequired: false } },
      { identifier: "dismiss", buttonTitle: "Dismiss", options: { opensAppToForeground: false, isDestructive: false, isAuthenticationRequired: false } },
    ],
  },
  // Three actions
  {
    id: "iotpush_ack_snooze_reply",
    actions: [
      { identifier: "ack", buttonTitle: "Acknowledge", options: { opensAppToForeground: true, isDestructive: false, isAuthenticationRequired: false } },
      { identifier: "snooze", buttonTitle: "Snooze 5m", options: { opensAppToForeground: false, isDestructive: false, isAuthenticationRequired: false } },
      { identifier: "reply", buttonTitle: "Reply", options: { opensAppToForeground: true, isDestructive: false, isAuthenticationRequired: false }, textInput: { submitButtonTitle: "Send", placeholder: "Type your reply..." } },
    ],
  },
  {
    id: "iotpush_approve_reject_comment",
    actions: [
      { identifier: "approve", buttonTitle: "Approve", options: { opensAppToForeground: true, isDestructive: false, isAuthenticationRequired: false } },
      { identifier: "reject", buttonTitle: "Reject", options: { opensAppToForeground: true, isDestructive: true, isAuthenticationRequired: false } },
      { identifier: "comment", buttonTitle: "Comment", options: { opensAppToForeground: true, isDestructive: false, isAuthenticationRequired: false }, textInput: { submitButtonTitle: "Send", placeholder: "Add a comment..." } },
    ],
  },
  {
    id: "iotpush_ack_escalate_reply",
    actions: [
      { identifier: "ack", buttonTitle: "Acknowledge", options: { opensAppToForeground: true, isDestructive: false, isAuthenticationRequired: false } },
      { identifier: "escalate", buttonTitle: "Escalate", options: { opensAppToForeground: true, isDestructive: true, isAuthenticationRequired: false } },
      { identifier: "reply", buttonTitle: "Reply", options: { opensAppToForeground: true, isDestructive: false, isAuthenticationRequired: false }, textInput: { submitButtonTitle: "Send", placeholder: "Type your reply..." } },
    ],
  },
];

for (const cat of STATIC_CATEGORIES) {
  Notifications.setNotificationCategoryAsync(cat.id, cat.actions as Notifications.NotificationAction[]).catch((e) =>
    console.log(`Failed to register category ${cat.id}:`, e)
  );
}

// ─── Navigation callback — set by App.tsx to navigate on notification tap ───
export interface NotificationTapData {
  topic?: string;
  messageId?: string;
  message_id?: string;
  title?: string;
  body?: string;
  receivedAt?: string;
}

let _onNotificationTap: ((data: NotificationTapData) => void) | null = null;
// If a tap arrives before App.tsx registers the callback (cold start),
// buffer it here and replay when the callback is set.
let _pendingTapData: NotificationTapData | null = null;
// Dedup guard so a response isn't handled twice (listener + getLastNotificationResponseAsync)
let _lastHandledResponseKey: string | null = null;

export function setOnNotificationTap(
  callback: (data: NotificationTapData) => void
) {
  _onNotificationTap = callback;
  if (_pendingTapData) {
    const pending = _pendingTapData;
    _pendingTapData = null;
    callback(pending);
  }
}

function dispatchTap(data: NotificationTapData) {
  if (_onNotificationTap) {
    _onNotificationTap(data);
  } else {
    _pendingTapData = data;
  }
}

// ─── Get auth token for API calls ───
async function getAccessToken(): Promise<string | null> {
  try {
    // First try to refresh the session to get a valid token
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) return null;
    
    // Check if token is close to expiry (within 60 seconds)
    const expiresAt = session.expires_at || 0;
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt - now < 60) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      return refreshed.session?.access_token || session.access_token;
    }
    
    return session.access_token;
  } catch {
    return null;
  }
}

// ─── Register device with IOTPush API ───
async function registerDeviceWithAPI(pushToken: string): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const deviceName = Device.modelName || Device.deviceName || `${Platform.OS} device`;
  const appVersion = Constants.expoConfig?.version || "unknown";

  try {
    const response = await fetch(`${API_BASE}/devices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        push_token: pushToken,
        platform: Platform.OS as "ios" | "android",
        device_name: deviceName,
        app_version: appVersion,
      }),
    });

    if (!response.ok) {
      console.log("Device registration API failed:", response.status);
      return null;
    }

    const device = await response.json();
    if (AsyncStorage && device.id) {
      await AsyncStorage.setItem("iotpush_device_id", device.id);
    }
    console.log("[iotpush] Device registered:", device.id);
    return device.id;
  } catch (err) {
    console.log("Device registration network error:", err);
    return null;
  }
}

// ─── Register for push notifications ───
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    if (!Device.isDevice) {
      console.log("Push notifications require a physical device");
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Push notification permission not granted");
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.log("No Expo project ID found");
      return null;
    }
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });

    // Register device with IOTPush API (non-blocking)
    registerDeviceWithAPI(tokenData.data).catch((err) => {
      console.log("Background device registration failed:", err);
    });

    return tokenData.data;
  } catch (error) {
    console.log("Push notification registration failed:", error);
    return null;
  }
}

// ─── Subscribe/unsubscribe push token (direct DB, existing topics) ───
export async function subscribePushToken(topicId: string, pushToken: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("iot_subscribers").upsert(
      {
        topic_id: topicId,
        endpoint: pushToken,
        type: "expo_push",
        active: true,
        user_id: user?.id || null,
      },
      { onConflict: "topic_id,endpoint" }
    );
    if (error) {
      console.log("Subscribe push token error:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.log("Subscribe push token failed:", e);
    return false;
  }
}

export async function unsubscribePushToken(topicId: string, pushToken: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("iot_subscribers")
      .delete()
      .eq("topic_id", topicId)
      .eq("endpoint", pushToken);
    if (error) {
      console.log("Unsubscribe push token error:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.log("Unsubscribe push token failed:", e);
    return false;
  }
}

// ─── Create a topic via the API ───
// The screen used to insert into iot_topics directly, which bypassed plan
// limits, skipped private-topic gating, and never generated an api_key — every
// app-created topic was public, and anyone who guessed the name could push to
// it and read its history. POST /api/topics enforces all of that server-side.
export async function createTopicViaAPI(
  name: string,
  description?: string | null,
  isPrivate: boolean = false
): Promise<{ topic: { id: string; name: string } | null; error: string | null }> {
  const token = await getAccessToken();
  if (!token) return { topic: null, error: "Not signed in." };

  try {
    const res = await fetch(`${API_BASE}/topics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, description: description || null, is_private: isPrivate }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // The server's errors are user-facing by design (plan limit with upgrade
      // path, duplicate name, private-topics gating) — surface them verbatim.
      return { topic: null, error: data.error || `Failed to create topic (HTTP ${res.status}).` };
    }
    return { topic: data.topic, error: null };
  } catch (e) {
    return { topic: null, error: "Network error creating topic." };
  }
}

// ─── Cross-device subscribe via API ───
export async function subscribeToTopicByName(
  topicName: string,
  apiKey?: string
): Promise<{ topic_id: string; topic_name: string; subscribed: boolean } | null> {
  const token = await getAccessToken();
  if (!token) return null;

  let deviceId: string | null = null;
  if (AsyncStorage) {
    deviceId = await AsyncStorage.getItem("iotpush_device_id");
  }

  try {
    const response = await fetch(`${API_BASE}/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        topic_name: topicName,
        api_key: apiKey || undefined,
        device_id: deviceId || undefined,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Subscribe failed");
    }
    return data;
  } catch (err) {
    console.log("Subscribe API error:", err);
    throw err;
  }
}

// ─── Report action to server ───
export type ActionResult = {
  ok: boolean;
  /** True when the answer was recorded. False when someone or something else got there first. */
  recorded: boolean;
  /** Human-readable, already suitable to show the user. */
  reason?: string;
  /** True when retrying could plausibly help. A closed question is not retryable. */
  retryable: boolean;
};

export async function reportAction(
  messageId: string,
  actionId: string,
  replyText?: string
): Promise<ActionResult> {
  const token = await getAccessToken();
  if (!token) {
    return { ok: false, recorded: false, reason: "You are signed out.", retryable: false };
  }

  let deviceId: string | null = null;
  if (AsyncStorage) {
    deviceId = await AsyncStorage.getItem("iotpush_device_id");
  }

  try {
    const response = await fetch(`${API_BASE}/action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message_id: messageId,
        action_id: actionId,
        reply_text: replyText || undefined,
        device_id: deviceId || undefined,
      }),
    });

    if (response.status === 409) {
      // The question closed before this tap arrived — already answered, expired,
      // or cancelled. Retrying cannot help, and telling the user to "try again"
      // would be actively wrong.
      let detail = "This request was already closed.";
      try {
        const body = await response.json();
        if (body?.reason) detail = body.reason;
      } catch {}
      console.log("[iotpush] Action not recorded:", detail);
      return { ok: true, recorded: false, reason: detail, retryable: false };
    }

    if (!response.ok) {
      console.log("Action report failed:", response.status);
      return {
        ok: false,
        recorded: false,
        reason: `The server rejected it (HTTP ${response.status}).`,
        retryable: response.status >= 500,
      };
    }

    console.log("[iotpush] Action reported:", actionId);
    return { ok: true, recorded: true, retryable: false };
  } catch (err) {
    console.log("Action report error:", err);
    return {
      ok: false,
      recorded: false,
      reason: "Could not reach iotpush.",
      retryable: true,
    };
  }
}

/**
 * Tell the user their tap did not take effect.
 *
 * Deliberately only on failure. A confirmation that a tap worked is a
 * notification about a notification -- you just pressed the button, you know --
 * and every extra push erodes the attention the important ones depend on.
 *
 * A tap that silently did nothing is the opposite case: you believe you decided,
 * the sender believes you did not, and nothing anywhere says so. That is worth
 * interrupting for.
 */
async function warnActionNotDelivered(actionId: string, result: ActionResult) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: result.recorded === false && result.ok ? "Too late to respond" : "Response not sent",
        body:
          `Your "${actionId}" response was not recorded. ` +
          (result.reason || "") +
          (result.retryable ? " Open the app to try again." : ""),
        sound: false,
      },
      trigger: null,
    });
  } catch (err) {
    console.log("Failed to warn about undelivered action:", err);
  }
}

// ─── Handle notification tap (action response) ───
async function handleNotificationResponse(
  response: Notifications.NotificationResponse
): Promise<void> {
  const { notification, actionIdentifier, userText } = response;

  // Dedup: the same response can arrive via the response listener AND
  // getLastNotificationResponseAsync() on cold start. Handle it once.
  const responseKey = `${notification.request.identifier}:${actionIdentifier}`;
  if (responseKey === _lastHandledResponseKey) return;
  _lastHandledResponseKey = responseKey;

  const content = notification.request.content;
  const data = content.data as {
    message_id?: string;
    messageId?: string;
    topic?: string;
    actions?: NotificationAction[];
    click_url?: string;
  } | undefined;

  const messageId = data?.message_id || data?.messageId;

  // Carry the visible notification content along so the app can display
  // the tapped message immediately, without a fetch (works even for
  // messages from subscribed topics the user doesn't own).
  const tapData: NotificationTapData = {
    ...(data || {}),
    title: content.title || undefined,
    body: content.body || undefined,
    receivedAt: new Date(notification.date).toISOString(),
  };

  // Default tap — open the message in the app, or open click_url
  if (actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    if (data?.click_url) {
      Linking.openURL(data.click_url).catch(console.error);
    } else {
      dispatchTap(tapData);
    }
    return;
  }

  // Action button tapped — navigate to the app
  dispatchTap(tapData);

  if (!messageId) return;

  const matchedAction = data?.actions?.find((a) => a.id === actionIdentifier);
  if (matchedAction?.type === "url" && matchedAction.url) {
    Linking.openURL(matchedAction.url).catch(console.error);
  }

  // The result used to be discarded here, so a tap from the lock screen that
  // never landed produced no feedback at all: the user believed they had
  // answered while the sender was still waiting or had already given up.
  const result = await reportAction(messageId, actionIdentifier, userText || undefined);
  if (!result.recorded) {
    await warnActionNotDelivered(actionIdentifier, result);
  }
}

// ─── Register dynamic notification categories for actions ───
function registerActionCategories(messageId: string, actions: NotificationAction[]) {
  if (!actions || actions.length === 0) return;

  const categoryId = `actions_${messageId}`;
  const notifActions: Notifications.NotificationAction[] = actions.map((action) => {
    const base: Notifications.NotificationAction = {
      identifier: action.id,
      buttonTitle: action.label,
      options: {
        opensAppToForeground: action.type !== "dismiss",
        isDestructive: action.destructive || false,
        isAuthenticationRequired: false,
      },
    };

    if (action.type === "reply") {
      return {
        ...base,
        textInput: {
          submitButtonTitle: "Send",
          placeholder: "Type your reply...",
        },
      };
    }
    return base;
  });

  Notifications.setNotificationCategoryAsync(categoryId, notifActions).catch((err) => {
    console.log("Failed to register notification category:", err);
  });
}

// ─── Notification listeners ───
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data as {
      message_id?: string;
      actions?: NotificationAction[];
    } | undefined;
    if (data?.actions && data.message_id) {
      registerActionCategories(data.message_id, data.actions);
    }
    callback(notification);
  });
}

export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    handleNotificationResponse(response).catch(console.error);
    callback(response);
  });
}

// ─── Cold-start handling ───
// When the app is launched (from a killed state) by tapping a notification,
// the response listener above is registered too late to receive the event.
// Call this once at startup to pick up and process that initial tap.
export async function processInitialNotificationResponse(): Promise<void> {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    if (response) {
      await handleNotificationResponse(response);
    }
  } catch (e) {
    console.log("Failed to process initial notification response:", e);
  }
}
