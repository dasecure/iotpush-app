import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from "react-native";
import { supabase } from "../lib/supabase";
import { Topic, Message } from "../lib/types";

interface AllMessagesScreenProps {
  onSelectTopic: (topic: Topic) => void;
}

export default function AllMessagesScreen({ onSelectTopic }: AllMessagesScreenProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [topics, setTopics] = useState<Record<string, Topic>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // Fetch user's topics first
      const { data: topicsData } = await supabase
        .from("iot_topics")
        .select("*");
      
      if (!topicsData || topicsData.length === 0) {
        setTopics({});
        setMessages([]);
        setLoading(false);
        return;
      }

      const topicsMap: Record<string, Topic> = {};
      const topicIds: string[] = [];
      for (const t of topicsData) {
        topicsMap[t.id] = t;
        topicIds.push(t.id);
      }
      setTopics(topicsMap);

      // Fetch messages from all topics
      const { data: messagesData } = await supabase
        .from("iot_messages")
        .select("*")
        .in("topic_id", topicIds)
        .order("created_at", { ascending: false })
        .limit(100);

      if (messagesData) setMessages(messagesData);
    } catch (e) {
      console.log("Failed to fetch messages:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Real-time subscription for all messages
    const channel = supabase
      .channel("all-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "iot_messages",
        },
        (payload) => {
          const newMsg = payload.new as Message;
          // Only add if it's from one of our topics
          setMessages((prev) => {
            if (Object.keys(topics).length === 0 || topics[newMsg.topic_id]) {
              return [newMsg, ...prev];
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
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

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inbox</Text>
        <Text style={styles.subtitle}>{messages.length} messages</Text>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}
        contentContainerStyle={[styles.list, messages.length === 0 && { flex: 1 }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📬</Text>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyText}>
              Messages from all your topics will appear here
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const topic = topics[item.topic_id];
          return (
            <TouchableOpacity
              style={styles.messageCard}
              onPress={() => topic && onSelectTopic(topic)}
              activeOpacity={0.7}
            >
              <View style={styles.messageTop}>
                {topic && (
                  <View style={styles.topicBadge}>
                    <Text style={styles.topicBadgeText}>{topic.name}</Text>
                  </View>
                )}
                <Text style={styles.messageTime}>{formatTime(item.created_at)}</Text>
              </View>
              {item.title && (
                <Text style={styles.messageTitle}>{item.title}</Text>
              )}
              <Text style={styles.messageBody} numberOfLines={3}>{item.message}</Text>
              {item.priority !== "normal" && (
                <View style={styles.messageFooter}>
                  <View style={[styles.priorityBadge, { backgroundColor: priorityColor(item.priority) + "20" }]}>
                    <Text style={[styles.priorityText, { color: priorityColor(item.priority) }]}>
                      {item.priority}
                    </Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712" },
  center: { justifyContent: "center", alignItems: "center" },
  header: {
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
  },
  title: { fontSize: 28, fontWeight: "bold", color: "#fff" },
  subtitle: { fontSize: 14, color: "#6b7280", marginTop: 2 },
  list: { padding: 16 },
  messageCard: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  messageTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  topicBadge: {
    backgroundColor: "#f9731620",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  topicBadgeText: {
    color: "#f97316",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  messageTime: { color: "#6b7280", fontSize: 12 },
  messageTitle: { fontSize: 16, fontWeight: "600", color: "#fff", marginBottom: 4 },
  messageBody: { color: "#d1d5db", fontSize: 14, lineHeight: 20 },
  messageFooter: { flexDirection: "row", marginTop: 8 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginRight: 6 },
  priorityText: { fontSize: 12, fontWeight: "500" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "600", color: "#fff", marginBottom: 8 },
  emptyText: { fontSize: 14, color: "#6b7280", textAlign: "center" },
});
