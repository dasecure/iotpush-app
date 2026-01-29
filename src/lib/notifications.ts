import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "./supabase";

// Configure notification behavior
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

export async function registerForPushNotifications(): Promise<string | null> {
  try {
    if (!Device.isDevice) {
      console.log("Push notifications require a physical device");
      return null;
    }

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request if not granted
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Push notification permission not granted");
      return null;
    }

    // Get Expo push token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.log("No Expo project ID found - run 'eas init' first");
      return null;
    }
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    // Android notification channel
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

    return tokenData.data;
  } catch (error) {
    console.log("Push notification registration failed (expected in Expo Go):", error);
    return null;
  }
}

export async function subscribePushToken(topicId: string, pushToken: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("iot_subscribers").upsert(
      {
        topic_id: topicId,
        endpoint: pushToken,
        type: "expo_push",
        active: true,
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

export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}

export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}
