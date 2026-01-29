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
  Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { supabase } from "../lib/supabase";
import { Topic, Message } from "../lib/types";

interface MessagesScreenProps {
  topic: Topic;
  onBack: () => void;
}

export default function MessagesScreen({ topic, onBack }: MessagesScreenProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from("iot_messages")
      .select("*")
      .eq("topic_id", topic.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setMessages(data);
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

  const copyEndpoint = () => {
    const url = `https://iotpush.com/api/push/${topic.name}`;
    Clipboard.setStringAsync(url);
    Alert.alert("Copied!", `Endpoint URL copied to clipboard`);
  };

  const copyCurl = () => {
    const cmd = `curl -d "Your message" https://iotpush.com/api/push/${topic.name}`;
    Clipboard.setStringAsync(cmd);
    Alert.alert("Copied!", "curl command copied to clipboard");
  };

  const shareEndpoint = () => {
    Share.share({
      message: `Send push notifications to my "${topic.name}" topic:\n\ncurl -d "Your message" https://iotpush.com/api/push/${topic.name}`,
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

  return (
    <View style={styles.container}>
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

      {/* Messages */}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}
        contentContainerStyle={styles.list}
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
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712" },
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
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  topicName: { fontSize: 20, fontWeight: "bold", color: "#fff" },
  privateBadge: { fontSize: 14 },
  shareButton: { color: "#f97316", fontSize: 16 },
  actions: {
    flexDirection: "row",
    gap: 8,
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
  },
  apiKeyLabel: { color: "#f97316", fontSize: 13, fontWeight: "600" },
  apiKeyValue: { color: "#d1d5db", fontSize: 13, fontFamily: "monospace", flex: 1 },
  apiKeyCopy: { color: "#6b7280", fontSize: 12 },
  list: { padding: 16, gap: 8 },
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
  messageFooter: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  priorityText: { fontSize: 12, fontWeight: "500" },
  tagBadge: { backgroundColor: "#1f2937", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  tagText: { color: "#9ca3af", fontSize: 12 },
  empty: { alignItems: "center", paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "600", color: "#fff", marginBottom: 8 },
  emptyText: { fontSize: 14, color: "#6b7280", textAlign: "center", lineHeight: 22, paddingHorizontal: 20 },
  code: { fontFamily: "monospace", color: "#f97316", fontSize: 13 },
});
