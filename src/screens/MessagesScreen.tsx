import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Share,
  Alert,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { supabase } from "../lib/supabase";
import { Topic, Message, NotificationAction } from "../lib/types";
import { reportAction } from "../lib/notifications";

interface MessagesScreenProps {
  topic: Topic;
  onBack: () => void;
}

export default function MessagesScreen({ topic, onBack }: MessagesScreenProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [actedMessages, setActedMessages] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const fetchMessages = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("iot_messages")
        .select("*")
        .eq("topic_id", topic.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setMessages(data);
    } catch (e) {
      console.log("Failed to fetch messages:", e);
    } finally {
      setLoading(false);
    }
  }, [topic.id]);

  useEffect(() => {
    fetchMessages();

    // Real-time subscription
    const channel = supabase
      .channel(`messages-${topic.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "iot_messages",
          filter: `topic_id=eq.${topic.id}`,
        },
        (payload) => {
          setMessages((prev) => [payload.new as Message, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [topic.id, fetchMessages]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMessages();
    setRefreshing(false);
  };

  const sendTestMessage = async () => {
    const msg = testMessage.trim();
    if (!msg) return;
    setSending(true);

    try {
      const url = `https://www.iotpush.com/api/push/${topic.name}`;
      const headers: Record<string, string> = {
        "Content-Type": "text/plain",
      };
      if (topic.is_private) {
        headers["Authorization"] = `Bearer ${topic.api_key}`;
      }

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: msg,
      });

      if (res.ok) {
        setTestMessage("");
      } else {
        const text = await res.text();
        Alert.alert("Send Failed", text || `HTTP ${res.status}`);
      }
    } catch (e: any) {
      Alert.alert("Send Failed", e.message || "Network error");
    } finally {
      setSending(false);
    }
  };

  const copyEndpoint = () => {
    const url = `https://www.iotpush.com/api/push/${topic.name}`;
    Clipboard.setStringAsync(url);
    Alert.alert("Copied!", `Endpoint URL copied to clipboard`);
  };

  const copyCurl = () => {
    const cmd = `curl -d "Your message" https://www.iotpush.com/api/push/${topic.name}`;
    Clipboard.setStringAsync(cmd);
    Alert.alert("Copied!", "curl command copied to clipboard");
  };

  const shareEndpoint = () => {
    Share.share({
      message: `Send push notifications to my "${topic.name}" topic:\n\ncurl -d "Your message" https://www.iotpush.com/api/push/${topic.name}`,
    });
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const priorityColor = (p: string) => {
    switch (p) {
      case "high": return "#ef4444";
      case "urgent": return "#dc2626";
      case "low": return "#6b7280";
      default: return "#9ca3af";
    }
  };

  const handleAction = async (messageId: string, action: NotificationAction) => {
    if (action.type === "reply") {
      setReplyingTo(messageId);
      return;
    }
    if (action.type === "url" && action.url) {
      const { Linking } = require("react-native");
      Linking.openURL(action.url).catch(console.error);
    }
    const success = await reportAction(messageId, action.id);
    if (success) {
      setActedMessages((prev) => ({ ...prev, [messageId]: action.label }));
      Alert.alert("Action sent", `"${action.label}" reported successfully`);
    } else {
      Alert.alert("Error", "Failed to send action. Please try again.");
    }
  };

  const handleReplySubmit = async (messageId: string) => {
    if (!replyText.trim()) return;
    const success = await reportAction(messageId, "reply", replyText.trim());
    if (success) {
      setActedMessages((prev) => ({ ...prev, [messageId]: "Reply sent" }));
      setReplyingTo(null);
      setReplyText("");
      Alert.alert("Reply sent", "Your reply has been delivered");
    } else {
      Alert.alert("Error", "Failed to send reply. Please try again.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.topicName}>{topic.name}</Text>
          {topic.is_private && <Text style={styles.privateBadge}>🔒</Text>}
        </View>
        <TouchableOpacity onPress={shareEndpoint}>
          <Text style={styles.shareButton}>Share</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={copyEndpoint}>
          <Text style={styles.actionText}>📋 Copy URL</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={copyCurl}>
          <Text style={styles.actionText}>💻 Copy curl</Text>
        </TouchableOpacity>
      </View>

      {/* API Key for private topics */}
      {topic.is_private && (
        <TouchableOpacity
          style={styles.apiKeyBar}
          onPress={() => {
            Clipboard.setStringAsync(topic.api_key);
            Alert.alert("Copied!", "API key copied");
          }}
        >
          <Text style={styles.apiKeyLabel}>API Key: </Text>
          <Text style={styles.apiKeyValue}>{topic.api_key.substring(0, 12)}...</Text>
          <Text style={styles.apiKeyCopy}>Tap to copy</Text>
        </TouchableOpacity>
      )}

      {/* Send Test Message */}
      <View style={styles.sendBar}>
        <TextInput
          style={styles.sendInput}
          placeholder="Send test message..."
          placeholderTextColor="#6b7280"
          value={testMessage}
          onChangeText={setTestMessage}
          returnKeyType="send"
          onSubmitEditing={sendTestMessage}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!testMessage.trim() || sending) && styles.sendButtonDisabled]}
          onPress={sendTestMessage}
          disabled={!testMessage.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.sendButtonText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}
          contentContainerStyle={[styles.list, messages.length === 0 && { flex: 1 }]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptyText}>
                Send your first notification:{"\n\n"}
                <Text style={styles.code}>
                  curl -d "Hello!" {"\n"}iotpush.com/api/push/{topic.name}
                </Text>
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.messageCard}>
              <View style={styles.messageHeader}>
                {item.title ? (
                  <Text style={styles.messageTitle}>{item.title}</Text>
                ) : null}
                <Text style={styles.messageTime}>{formatTime(item.created_at)}</Text>
              </View>
              <Text style={styles.messageBody}>{item.message}</Text>
              <View style={styles.messageFooter}>
                {item.priority !== "normal" && (
                  <View style={[styles.priorityBadge, { backgroundColor: priorityColor(item.priority) + "20" }]}>
                    <Text style={[styles.priorityText, { color: priorityColor(item.priority) }]}>
                      {item.priority}
                    </Text>
                  </View>
                )}
                {item.tags?.map((tag, i) => (
                  <View key={i} style={styles.tagBadge}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>

              {/* Action buttons */}
              {item.actions && item.actions.length > 0 && !actedMessages[item.id] && (
                <View style={styles.actionRow}>
                  {(item.actions as NotificationAction[]).map((action) => (
                    <TouchableOpacity
                      key={action.id}
                      style={[
                        styles.actionBtn,
                        action.destructive && styles.actionBtnDestructive,
                      ]}
                      onPress={() => handleAction(item.id, action)}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.actionBtnText,
                        action.destructive && styles.actionBtnTextDestructive,
                      ]}>
                        {action.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Reply input */}
              {replyingTo === item.id && (
                <View style={styles.replyRow}>
                  <TextInput
                    style={styles.replyInput}
                    placeholder="Type your reply..."
                    placeholderTextColor="#6b7280"
                    value={replyText}
                    onChangeText={setReplyText}
                    returnKeyType="send"
                    onSubmitEditing={() => handleReplySubmit(item.id)}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={styles.replySendBtn}
                    onPress={() => handleReplySubmit(item.id)}
                  >
                    <Text style={styles.replySendText}>Send</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Acted confirmation */}
              {actedMessages[item.id] && (
                <View style={styles.actedBadge}>
                  <Text style={styles.actedText}>✓ {actedMessages[item.id]}</Text>
                </View>
              )}
            </View>
          )}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
  },
  backButton: { color: "#f97316", fontSize: 16 },
  headerCenter: { flexDirection: "row", alignItems: "center" },
  topicName: { fontSize: 20, fontWeight: "bold", color: "#fff" },
  privateBadge: { fontSize: 14, marginLeft: 8 },
  shareButton: { color: "#f97316", fontSize: 16 },
  actions: {
    flexDirection: "row",
    padding: 16,
    paddingBottom: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    marginRight: 8,
  },
  actionText: { color: "#d1d5db", fontSize: 14 },
  apiKeyBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9731610",
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#f9731630",
    marginBottom: 4,
  },
  apiKeyLabel: { color: "#f97316", fontSize: 13, fontWeight: "600" },
  apiKeyValue: { color: "#d1d5db", fontSize: 13, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", flex: 1 },
  apiKeyCopy: { color: "#6b7280", fontSize: 12 },
  sendBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
  },
  sendInput: {
    flex: 1,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: "#fff",
  },
  sendButton: {
    backgroundColor: "#f97316",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 60,
    alignItems: "center",
    marginLeft: 8,
  },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonText: { color: "#000", fontWeight: "600", fontSize: 14 },
  list: { padding: 16 },
  messageCard: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  messageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  messageTitle: { fontSize: 16, fontWeight: "600", color: "#fff", flex: 1 },
  messageTime: { color: "#6b7280", fontSize: 12 },
  messageBody: { color: "#d1d5db", fontSize: 14, lineHeight: 20 },
  messageFooter: { flexDirection: "row", marginTop: 8, flexWrap: "wrap" },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginRight: 6 },
  priorityText: { fontSize: 12, fontWeight: "500" },
  tagBadge: { backgroundColor: "#1f2937", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginRight: 6 },
  tagText: { color: "#9ca3af", fontSize: 12 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "600", color: "#fff", marginBottom: 8 },
  emptyText: { fontSize: 14, color: "#6b7280", textAlign: "center", lineHeight: 22, paddingHorizontal: 20 },
  code: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", color: "#f97316", fontSize: 13 },
  actionRow: {
    flexDirection: "row",
    marginTop: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#1f2937",
    paddingTop: 12,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: "#f9731615",
    borderWidth: 1,
    borderColor: "#f97316",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  actionBtnDestructive: {
    backgroundColor: "#ef444415",
    borderColor: "#ef4444",
  },
  actionBtnText: {
    color: "#f97316",
    fontSize: 13,
    fontWeight: "600",
  },
  actionBtnTextDestructive: {
    color: "#ef4444",
  },
  replyRow: {
    flexDirection: "row",
    marginTop: 10,
    gap: 8,
  },
  replyInput: {
    flex: 1,
    backgroundColor: "#030712",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: "#fff",
  },
  replySendBtn: {
    backgroundColor: "#f97316",
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  replySendText: {
    color: "#000",
    fontWeight: "600",
    fontSize: 13,
  },
  actedBadge: {
    marginTop: 10,
    backgroundColor: "#10b98120",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  actedText: {
    color: "#10b981",
    fontSize: 12,
    fontWeight: "500",
  },
});
