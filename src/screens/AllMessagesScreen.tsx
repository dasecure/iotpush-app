import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from "react-native";
import { supabase } from "../lib/supabase";
import { Topic, Message, NotificationAction } from "../lib/types";
import { reportAction, NotificationTapData } from "../lib/notifications";

interface AllMessagesScreenProps {
  onSelectTopic: (topic: Topic) => void;
  tappedNotification?: NotificationTapData | null;
  onDismissTapped?: () => void;
}

export default function AllMessagesScreen({ onSelectTopic, tappedNotification, onDismissTapped }: AllMessagesScreenProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [topics, setTopics] = useState<Record<string, Topic>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actedMessages, setActedMessages] = useState<Record<string, string>>({});
  const topicsRef = useRef<Record<string, Topic>>({});
  const listRef = useRef<FlatList<Message>>(null);

  const tappedMessageId = tappedNotification?.message_id || tappedNotification?.messageId || null;

  // Scroll to the tapped message once messages are loaded
  useEffect(() => {
    if (!tappedMessageId || loading) return;
    const index = messages.findIndex((m) => m.id === tappedMessageId);
    if (index >= 0) {
      // Slight delay so the FlatList has rendered
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index, viewPosition: 0.2, animated: true });
      }, 300);
    }
  }, [tappedMessageId, loading, messages]);

  const fetchData = useCallback(async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch user's topics first
      const { data: topicsData } = await supabase
        .from("iot_topics")
        .select("*")
        .eq("user_id", user.id);

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
      topicsRef.current = topicsMap;

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
          // Only add if it's from one of our topics (use ref — the `topics`
          // state captured in this closure is stale/empty at subscribe time,
          // which previously let messages from ANY topic leak into the list)
          setMessages((prev) => {
            if (topicsRef.current[newMsg.topic_id] && !prev.some((m) => m.id === newMsg.id)) {
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

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => Alert.alert("Could not open link", url));
  };

  // Display-only host extraction. Avoid new URL(): its host parsing is
  // unreliable on some React Native runtimes without a polyfill.
  const linkHost = (url: string) => url.replace(/^[a-z]+:\/\//i, "").split("/")[0];

  const handleAction = async (item: Message, action: NotificationAction) => {
    // For reply actions, navigate into the topic so the user can use the full reply UI
    if (action.type === "reply") {
      const topic = topics[item.topic_id];
      if (topic) onSelectTopic(topic);
      return;
    }
    if (action.type === "url" && action.url) {
      openLink(action.url);
    }
    const success = await reportAction(item.id, action.id);
    if (success) {
      setActedMessages((prev) => ({ ...prev, [item.id]: action.label }));
      Alert.alert("Action sent", `"${action.label}" reported successfully`);
    } else {
      Alert.alert("Error", "Failed to send action. Please try again.");
    }
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

      {/* Tapped notification banner — shows the message the user tapped,
          from the notification payload itself, so it works even when the
          message isn't in the list (e.g. subscribed topics) */}
      {tappedNotification && (tappedNotification.title || tappedNotification.body) && (
        <View style={styles.tappedBanner}>
          <View style={styles.tappedHeader}>
            {tappedNotification.topic && (
              <View style={styles.topicBadge}>
                <Text style={styles.topicBadgeText}>{tappedNotification.topic}</Text>
              </View>
            )}
            <TouchableOpacity onPress={onDismissTapped} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.tappedClose}>✕</Text>
            </TouchableOpacity>
          </View>
          {tappedNotification.title && (
            <Text style={styles.messageTitle}>{tappedNotification.title}</Text>
          )}
          {tappedNotification.body && (
            <Text style={styles.messageBody}>{tappedNotification.body}</Text>
          )}
          {(tappedNotification as { click_url?: string }).click_url && (
            <TouchableOpacity
              style={styles.linkChip}
              onPress={() => openLink((tappedNotification as { click_url?: string }).click_url!)}
            >
              <Text style={styles.linkChipText} numberOfLines={1}>
                🔗 {linkHost((tappedNotification as { click_url?: string }).click_url!)} — tap to open
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index, viewPosition: 0.2, animated: true });
          }, 500);
        }}
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
              style={[styles.messageCard, item.id === tappedMessageId && styles.messageCardHighlighted]}
              onPress={() => {
                // A message with a click_url promises "tap to view" — honor it.
                // Topic navigation stays available via the topic badge.
                if (item.click_url) openLink(item.click_url);
                else if (topic) onSelectTopic(topic);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.messageTop}>
                {topic && (
                  <TouchableOpacity
                    style={styles.topicBadge}
                    onPress={() => onSelectTopic(topic)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.topicBadgeText}>{topic.name}</Text>
                  </TouchableOpacity>
                )}
                <Text style={styles.messageTime}>{formatTime(item.created_at)}</Text>
              </View>
              {item.title && (
                <Text style={styles.messageTitle}>{item.title}</Text>
              )}
              <Text style={styles.messageBody} numberOfLines={3}>{item.message}</Text>

              {/* Link chip — tapping the card opens click_url */}
              {item.click_url && (
                <View style={styles.linkChip}>
                  <Text style={styles.linkChipText} numberOfLines={1}>
                    🔗 {linkHost(item.click_url)} — tap to open
                  </Text>
                </View>
              )}
              {item.priority !== "normal" && (
                <View style={styles.messageFooter}>
                  <View style={[styles.priorityBadge, { backgroundColor: priorityColor(item.priority) + "20" }]}>
                    <Text style={[styles.priorityText, { color: priorityColor(item.priority) }]}>
                      {item.priority}
                    </Text>
                  </View>
                </View>
              )}

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
                      onPress={(e) => {
                        e.stopPropagation?.();
                        handleAction(item, action);
                      }}
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

              {/* Acted confirmation */}
              {actedMessages[item.id] && (
                <View style={styles.actedBadge}>
                  <Text style={styles.actedText}>✓ {actedMessages[item.id]}</Text>
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
  messageCardHighlighted: {
    borderColor: "#f97316",
    backgroundColor: "#f9731610",
  },
  tappedBanner: {
    backgroundColor: "#1c1207",
    borderWidth: 1,
    borderColor: "#f97316",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
  },
  tappedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  tappedClose: {
    color: "#6b7280",
    fontSize: 16,
    fontWeight: "600",
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
  linkChip: {
    marginTop: 8,
    backgroundColor: "#f9731612",
    borderWidth: 1,
    borderColor: "#f9731640",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  linkChipText: {
    color: "#f97316",
    fontSize: 12,
    fontWeight: "500",
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
