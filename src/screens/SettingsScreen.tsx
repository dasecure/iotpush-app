import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { supabase } from "../lib/supabase";

interface SettingsScreenProps {
  userEmail: string | null;
  emailVerified: boolean;
  pushToken: string | null;
  onLogout: () => void;
}

export default function SettingsScreen({ userEmail, emailVerified, pushToken, onLogout }: SettingsScreenProps) {
  const apiBaseUrl = "https://www.iotpush.com/api/push/";

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        onPress: async () => {
          await supabase.auth.signOut();
          onLogout();
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all associated data including topics, subscriptions, and messages. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => confirmDeleteAccount(),
        },
      ]
    );
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      "Are you absolutely sure?",
      "Type DELETE to confirm account deletion.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete My Account",
          style: "destructive",
          onPress: async () => {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) {
                Alert.alert("Error", "Not authenticated");
                return;
              }

              const response = await fetch("https://www.iotpush.com/api/account/delete", {
                method: "DELETE",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${session.access_token}`,
                },
              });

              const result = await response.json();

              if (response.ok && result.success) {
                await supabase.auth.signOut();
                Alert.alert("Account Deleted", "Your account has been permanently deleted.");
                onLogout();
              } else {
                Alert.alert("Error", result.error || "Failed to delete account. Please try again.");
              }
            } catch (error) {
              Alert.alert("Error", "Failed to delete account. Please try again.");
            }
          },
        },
      ]
    );
  };

  const copyToClipboard = (text: string, label: string) => {
    Clipboard.setStringAsync(text);
    Alert.alert("Copied!", `${label} copied to clipboard`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {/* Account Section */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{userEmail || "Not available"}</Text>
          </View>
          {userEmail && !emailVerified && (
            <View style={styles.verificationBanner}>
              <Text style={styles.verificationText}>
                Email not verified — check your inbox
              </Text>
              <TouchableOpacity
                onPress={async () => {
                  try {
                    const { error } = await supabase.auth.resend({
                      type: "signup",
                      email: userEmail,
                    });
                    if (error) {
                      Alert.alert("Error", error.message);
                    } else {
                      Alert.alert("Sent!", "Verification email resent. Check your inbox.");
                    }
                  } catch {
                    Alert.alert("Error", "Failed to resend verification email.");
                  }
                }}
              >
                <Text style={styles.resendText}>Resend verification email</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* API Section */}
        <Text style={styles.sectionTitle}>API</Text>
        <TouchableOpacity
          style={styles.card}
          onPress={() => copyToClipboard(apiBaseUrl, "API base URL")}
        >
          <View style={styles.row}>
            <Text style={styles.label}>Base URL</Text>
            <Text style={styles.valueMono} numberOfLines={1}>{apiBaseUrl}</Text>
          </View>
          <Text style={styles.hint}>Tap to copy</Text>
        </TouchableOpacity>

        {/* Push Notifications */}
        <Text style={styles.sectionTitle}>Push Notifications</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Status</Text>
            <View style={[styles.statusBadge, pushToken ? styles.statusActive : styles.statusInactive]}>
              <Text style={[styles.statusText, pushToken ? styles.statusTextActive : styles.statusTextInactive]}>
                {pushToken ? "Active" : "Unavailable"}
              </Text>
            </View>
          </View>
          {pushToken ? (
            <TouchableOpacity onPress={() => copyToClipboard(pushToken, "Push token")}>
              <Text style={styles.tokenText} numberOfLines={2}>{pushToken}</Text>
              <Text style={styles.hint}>Tap to copy token</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.hintText}>
              Push notifications require a dev build.{"\n"}Not available in Expo Go.
            </Text>
          )}
        </View>

        {/* About */}
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>App Version</Text>
            <Text style={styles.value}>{Constants.expoConfig?.version || "1.0.0"}</Text>
          </View>
          <View style={[styles.row, { marginTop: 12 }]}>
            <Text style={styles.label}>Build</Text>
            <Text style={styles.value}>{Constants.nativeBuildVersion || Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode || "-"}</Text>
          </View>
          <View style={[styles.row, { marginTop: 12 }]}>
            <Text style={styles.label}>Platform</Text>
            <Text style={styles.value}>{Platform.OS} ({Platform.Version})</Text>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        {/* Delete Account */}
        <Text style={styles.sectionTitle}>Danger Zone</Text>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
          <Text style={styles.deleteText}>Delete Account</Text>
        </TouchableOpacity>
        <Text style={styles.deleteHint}>
          Permanently delete your account and all data
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712" },
  header: {
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
  },
  title: { fontSize: 28, fontWeight: "bold", color: "#fff" },
  content: { flex: 1 },
  contentInner: { padding: 16 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 12,
    padding: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: { fontSize: 15, color: "#9ca3af" },
  value: { fontSize: 15, color: "#fff", fontWeight: "500" },
  valueMono: {
    fontSize: 13,
    color: "#f97316",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    flex: 1,
    textAlign: "right",
    marginLeft: 12,
  },
  hint: { color: "#6b7280", fontSize: 12, marginTop: 8 },
  hintText: { color: "#6b7280", fontSize: 13, marginTop: 8, lineHeight: 18 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusActive: { backgroundColor: "#16a34a20" },
  statusInactive: { backgroundColor: "#6b728020" },
  statusText: { fontSize: 13, fontWeight: "600" },
  statusTextActive: { color: "#22c55e" },
  statusTextInactive: { color: "#6b7280" },
  tokenText: {
    fontSize: 11,
    color: "#d1d5db",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginTop: 10,
    lineHeight: 16,
  },
  logoutButton: {
    marginTop: 32,
    backgroundColor: "#dc262620",
    borderWidth: 1,
    borderColor: "#dc262640",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  logoutText: { color: "#ef4444", fontSize: 16, fontWeight: "600" },
  deleteButton: {
    marginTop: 8,
    backgroundColor: "#7f1d1d",
    borderWidth: 1,
    borderColor: "#dc2626",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  deleteText: { color: "#fca5a5", fontSize: 16, fontWeight: "600" },
  deleteHint: {
    color: "#6b7280",
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },
  verificationBanner: {
    marginTop: 12,
    backgroundColor: "#f9731610",
    borderWidth: 1,
    borderColor: "#f9731630",
    borderRadius: 8,
    padding: 12,
  },
  verificationText: {
    color: "#fb923c",
    fontSize: 13,
    fontWeight: "500",
  },
  resendText: {
    color: "#f97316",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 6,
    textDecorationLine: "underline",
  },
});
