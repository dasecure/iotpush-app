import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { subscribeToTopicByName } from "../lib/notifications";

interface SubscribeScreenProps {
  onSubscribed?: () => void;
  onBack: () => void;
  /** Pre-filled from a deep link (iotpush://subscribe?topic=...&key=...). */
  initialTopic?: string;
  initialApiKey?: string;
}

export default function SubscribeScreen({ onSubscribed, onBack, initialTopic, initialApiKey }: SubscribeScreenProps) {
  const [topicName, setTopicName] = useState(initialTopic || "");
  const [apiKey, setApiKey] = useState(initialApiKey || "");
  const [showApiKey, setShowApiKey] = useState(!!initialApiKey);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoSubmitted = useRef(false);

  const handleSubscribe = useCallback(async (opts?: { name?: string; key?: string }) => {
    const trimmed = (opts?.name ?? topicName).trim().toLowerCase();
    if (!trimmed) {
      Alert.alert("Error", "Please enter a topic name");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await subscribeToTopicByName(trimmed, (opts?.key ?? apiKey).trim() || undefined);
      if (result) {
        Alert.alert("Subscribed!", `You are now subscribed to "${result.topic_name}"`, [
          { text: "OK", onPress: () => onSubscribed?.() },
        ]);
      }
    } catch (err: any) {
      setError(err.message || "Subscription failed");
    } finally {
      setLoading(false);
    }
  }, [topicName, apiKey, onSubscribed]);

  // Arrived via a deep link — subscribe automatically, once, so the common
  // case (scan a QR, tap a claim-page link) needs zero typing. If it fails
  // (e.g. a private topic whose key didn't come through the link), the form
  // below is already prefilled and the person can just hit Subscribe again.
  useEffect(() => {
    if (initialTopic && !autoSubmitted.current) {
      autoSubmitted.current = true;
      handleSubscribe({ name: initialTopic, key: initialApiKey });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Subscribe to Topic</Text>
        <View style={{ width: 50 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Text style={styles.description}>
          {loading && initialTopic
            ? `Subscribing this device to "${initialTopic}"...`
            : "Enter a topic name to receive notifications from it on this device. If the topic is private, you'll need the API key from the topic owner."}
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>TOPIC NAME</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. server-alerts"
            placeholderTextColor="#6b7280"
            value={topicName}
            onChangeText={setTopicName}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />
        </View>

        <TouchableOpacity
          style={styles.toggleApiKey}
          onPress={() => setShowApiKey(!showApiKey)}
        >
          <Text style={styles.toggleApiKeyText}>
            {showApiKey ? "▼ Hide API Key" : "▶ Private topic? Enter API key"}
          </Text>
        </TouchableOpacity>

        {showApiKey && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>API KEY</Text>
            <TextInput
              style={styles.input}
              placeholder="Paste the topic API key"
              placeholderTextColor="#6b7280"
              value={apiKey}
              onChangeText={setApiKey}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </View>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.subscribeButton, loading && styles.buttonDisabled]}
          onPress={() => handleSubscribe()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={styles.subscribeButtonText}>Subscribe</Text>
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712" },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 20, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: "#1f2937",
  },
  backButton: { color: "#f97316", fontSize: 16, fontWeight: "500" },
  headerTitle: { fontSize: 18, fontWeight: "600", color: "#fff" },
  content: { flex: 1, padding: 20 },
  description: { color: "#9ca3af", fontSize: 14, lineHeight: 20, marginBottom: 24 },
  inputGroup: { marginBottom: 16 },
  label: {
    fontSize: 12, fontWeight: "600", color: "#6b7280",
    letterSpacing: 0.5, marginBottom: 6,
  },
  input: {
    backgroundColor: "#111827", borderWidth: 1, borderColor: "#374151",
    borderRadius: 12, padding: 16, fontSize: 16, color: "#fff",
  },
  toggleApiKey: { marginBottom: 16, paddingVertical: 4 },
  toggleApiKeyText: { fontSize: 14, color: "#f97316" },
  errorBox: {
    backgroundColor: "#7f1d1d22", borderRadius: 8, padding: 12,
    marginBottom: 16, borderLeftWidth: 3, borderLeftColor: "#ef4444",
  },
  errorText: { color: "#fca5a5", fontSize: 14 },
  subscribeButton: {
    backgroundColor: "#f97316", padding: 16, borderRadius: 12,
    alignItems: "center", marginTop: 8,
  },
  subscribeButtonText: { color: "#000", fontSize: 16, fontWeight: "600" },
  buttonDisabled: { opacity: 0.6 },
});
