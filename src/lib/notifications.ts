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

const API_BASE = "https://iotpush.com/api";

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

// ─── Get auth token for API calls ───
async function getAccessToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
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

    // Android notification channels
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#f97316",
      });
      await Notifications.setNotificationChannelAsync("high-priority", {
        name: "High Priority",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: "#ef4444",
        sound: "default",
      });
    }

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
    const { error } = await supabase.from("iot_subscribers").upsert(
      { topic_id: topicId, endpoint: pushToken, type: "expo_push", active: true },
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
      .update({ active: false })
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
export async function reportAction(
  messageId: string,
  actionId: string,
  replyText?: string
): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;

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

    if (!response.ok) {
      console.log("Action report failed:", response.status);
      return false;
    }

    console.log("[iotpush] Action reported:", actionId);
    return true;
  } catch (err) {
    console.log("Action report error:", err);
    return false;
  }
}

// ─── Handle notification tap (action response) ───
async function handleNotificationResponse(
  response: Notifications.NotificationResponse
): Promise<void> {
  const { notification, actionIdentifier, userText } = response;
  const data = notification.request.content.data as {
    message_id?: string;
    messageId?: string;
    actions?: NotificationAction[];
    click_url?: string;
  } | undefined;

  const messageId = data?.message_id || data?.messageId;

  if (actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    if (data?.click_url) {
      Linking.openURL(data.click_url).catch(console.error);
    }
    return;
  }

  if (!messageId) return;

  const matchedAction = data?.actions?.find((a) => a.id === actionIdentifier);
  if (matchedAction?.type === "url" && matchedAction.url) {
    Linking.openURL(matchedAction.url).catch(console.error);
  }

  await reportAction(messageId, actionIdentifier, userText || undefined);
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
