import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { supabase } from "../lib/supabase";
import { subscribePushToken, unsubscribePushToken } from "../lib/notifications";
import { Topic } from "../lib/types";

interface TopicsScreenProps {
  onSelectTopic: (topic: Topic) => void;
  onSubscribe?: () => void;
  pushToken?: string | null;
}

export default function TopicsScreen({ onSelectTopic, onSubscribe, pushToken }: TopicsScreenProps) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [messageCounts, setMessageCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  // Subscription state
  const [subscribed, setSubscribed] = useState<Record<string, boolean>>({});
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [ownedTopicIds, setOwnedTopicIds] = useState<Set<string>>(new Set());

  const fetchTopics = useCallback(async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch topics owned by the user
      const { data: ownedTopics } = await supabase
        .from("iot_topics")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      // Fetch topic IDs the user is subscribed to
      const { data: subs } = await supabase
        .from("iot_subscribers")
        .select("topic_id")
        .eq("user_id", user.id);

      // Get subscribed topic IDs that aren't already owned
      const ownedIds = new Set((ownedTopics || []).map((t) => t.id));
      setOwnedTopicIds(ownedIds);
      const subscribedIds = (subs || [])
        .map((s) => s.topic_id)
        .filter((id) => !ownedIds.has(id));

      // Fetch subscribed topics
      let subscribedTopics: Topic[] = [];
      if (subscribedIds.length > 0) {
        const { data: subTopics } = await supabase
          .from("iot_topics")
          .select("*")
          .in("id", subscribedIds)
          .order("created_at", { ascending: false });
        subscribedTopics = subTopics || [];
      }

      // Merge: owned first, then subscribed
      const allTopics = [...(ownedTopics || []), ...subscribedTopics];
      setTopics(allTopics);

      // Fetch message counts for all topics
      const counts: Record<string, number> = {};
      for (const topic of allTopics) {
        const { count } = await supabase
          .from("iot_messages")
          .select("*", { count: "exact", head: true })
          .eq("topic_id", topic.id);
        counts[topic.id] = count || 0;
      }
      setMessageCounts(counts);
    } catch (e) {
      console.log("Failed to fetch topics:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Check subscription status for all topics
  const fetchSubscriptions = useCallback(async () => {
    if (!pushToken) return;
    try {
      const { data } = await supabase
        .from("iot_subscribers")
        .select("topic_id, active")
        .eq("endpoint", pushToken)
        .eq("type", "expo_push");
      if (data) {
        const subs: Record<string, boolean> = {};
        for (const row of data) {
          subs[row.topic_id] = row.active;
        }
        setSubscribed(subs);
      }
    } catch (e) {
      console.log("Failed to fetch subscriptions:", e);
    }
  }, [pushToken]);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  useEffect(() => {
    if (pushToken && topics.length > 0) {
      fetchSubscriptions();
    }
  }, [pushToken, topics, fetchSubscriptions]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTopics();
    await fetchSubscriptions();
    setRefreshing(false);
  };

  const toggleSubscription = async (topicId: string) => {
    if (!pushToken) {
      Alert.alert("Push Not Available", "Push notifications are not available on this device.");
      return;
    }

    setToggling((prev) => ({ ...prev, [topicId]: true }));

    const isCurrentlySubscribed = subscribed[topicId];
    let success: boolean;

    if (isCurrentlySubscribed) {
      success = await unsubscribePushToken(topicId, pushToken);
    } else {
      success = await subscribePushToken(topicId, pushToken);
    }

    if (success) {
      setSubscribed((prev) => ({ ...prev, [topicId]: !isCurrentlySubscribed }));
    } else {
      Alert.alert("Error", `Failed to ${isCurrentlySubscribed ? "unsubscribe from" : "subscribe to"} topic.`);
    }

    setToggling((prev) => ({ ...prev, [topicId]: false }));
  };

  const createTopic = async () => {
    if (!newName.trim()) return;
    setCreating(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: created, error } = await supabase
        .from("iot_topics")
        .insert({
          user_id: user.id,
          name: newName.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"),
          description: newDesc.trim() || null,
        })
        .select("id")
        .single();

      if (error) {
        if (error.code === "23505") {
          Alert.alert("Topic Exists", `A topic named "${newName.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-")}" already exists. Choose a different name.`);
        } else {
          Alert.alert("Error", error.message);
        }
      } else {
        // Subscribe the creator to their own topic.
        //
        // Creating a topic used to insert the row and stop, so the only way to
        // receive your own messages was to notice a dim 🔕 at 50% opacity --
        // which reads as a *disabled* control -- and tap it. Nothing in the app
        // said so, and the result was a new user sending a message and having
        // nothing arrive, ever.
        //
        // This matters more now that server-side questions default to an
        // audience of "owner": an unsubscribed creator makes their own topic
        // unanswerable, and POST /api/v1/questions returns 409
        // no_reachable_device rather than hanging until timeout.
        if (created?.id && pushToken) {
          const subscribed = await subscribePushToken(created.id, pushToken);
          if (subscribed) {
            setSubscribed((prev) => ({ ...prev, [created.id]: true }));
          } else {
            Alert.alert(
              "Topic created",
              "The topic was created, but this device could not be subscribed to it. " +
                "Tap the bell on the topic to try again -- until then, messages sent " +
                "to it will not arrive here."
            );
          }
        } else if (created?.id && !pushToken) {
          // No push token means notifications were denied or unavailable. Say so
          // plainly rather than letting the user discover it by silence.
          Alert.alert(
            "Topic created — notifications are off",
            "This device has no push token, so nothing sent to this topic can " +
              "reach you. Enable notifications for iotpush in Settings, then tap " +
              "the bell on the topic to subscribe."
          );
        }

        setNewName("");
        setNewDesc("");
        setShowCreate(false);
        fetchTopics();
      }
    } catch (e) {
      Alert.alert("Error", "Failed to create topic");
    } finally {
      setCreating(false);
    }
  };

  const deleteTopic = (topic: Topic) => {
    Alert.alert("Delete Topic", `Delete "${topic.name}"? All messages will be lost.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await supabase.from("iot_topics").delete().eq("id", topic.id);
          fetchTopics();
        },
      },
    ]);
  };

  const unsubscribeFromTopic = (topic: Topic) => {
    Alert.alert("Unsubscribe", `Unsubscribe from "${topic.name}"? You will stop receiving notifications.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unsubscribe",
        style: "destructive",
        onPress: async () => {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          await supabase
            .from("iot_subscribers")
            .delete()
            .eq("topic_id", topic.id)
            .eq("user_id", user.id);
          // Remove from local state immediately
          setTopics((prev) => prev.filter((t) => t.id !== topic.id));
          setSubscribed((prev) => {
            const next = { ...prev };
            delete next[topic.id];
            return next;
          });
        },
      },
    ]);
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
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>
            iot<Text style={styles.logoAccent}>push</Text>
          </Text>
          <Text style={styles.subtitle}>{topics.length} topic{topics.length !== 1 ? "s" : ""}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {onSubscribe && (
            <TouchableOpacity style={styles.subscribeHeaderBtn} onPress={onSubscribe}>
              <Text style={styles.subscribeHeaderBtnText}>Subscribe</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.addButton} onPress={() => setShowCreate(true)}>
            <Text style={styles.addButtonText}>+ New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Topics List */}
      <FlatList
        data={topics}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}
        contentContainerStyle={[styles.list, topics.length === 0 && { flex: 1 }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyTitle}>No topics yet</Text>
            <Text style={styles.emptyText}>Create a topic to start receiving push notifications</Text>
            <TouchableOpacity style={styles.emptyButton} onPress={() => setShowCreate(true)}>
              <Text style={styles.emptyButtonText}>Create Topic</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.topicCard}
            onPress={() => onSelectTopic(item)}
            onLongPress={() => ownedTopicIds.has(item.id) ? deleteTopic(item) : unsubscribeFromTopic(item)}
            activeOpacity={0.7}
          >
            <View style={styles.topicHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                <Text style={styles.topicName}>{item.name}</Text>
                {!ownedTopicIds.has(item.id) && (
                  <View style={styles.subscribedBadge}>
                    <Text style={styles.subscribedBadgeText}>subscribed</Text>
                  </View>
                )}
              </View>
              <View style={styles.topicMeta}>
                {item.is_private && (
                  <View style={styles.privateBadge}>
                    <Text style={styles.privateBadgeText}>🔒</Text>
                  </View>
                )}
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>
                    {messageCounts[item.id] ?? "—"} msg{(messageCounts[item.id] ?? 0) !== 1 ? "s" : ""}
                  </Text>
                </View>
                {/* Subscribe Bell Button */}
                {pushToken && (
                  <TouchableOpacity
                    style={styles.bellButton}
                    onPress={() => toggleSubscription(item.id)}
                    disabled={toggling[item.id]}
                    activeOpacity={0.6}
                  >
                    {toggling[item.id] ? (
                      <ActivityIndicator size="small" color="#f97316" />
                    ) : (
                      <Text style={[
                        styles.bellIcon,
                        subscribed[item.id] ? styles.bellSubscribed : styles.bellUnsubscribed,
                      ]}>
                        {subscribed[item.id] ? "🔔" : "🔕"}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
            {item.description && (
              <Text style={styles.topicDesc}>{item.description}</Text>
            )}
            {ownedTopicIds.has(item.id) && (
              <Text style={styles.topicEndpoint}>
                POST iotpush.com/api/push/{item.name}
              </Text>
            )}
          </TouchableOpacity>
        )}
      />

      {/* Create Modal */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>New Topic</Text>

            <TextInput
              style={styles.input}
              placeholder="Topic name (e.g. home-sensors)"
              placeholderTextColor="#6b7280"
              value={newName}
              onChangeText={setNewName}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Description (optional)"
              placeholderTextColor="#6b7280"
              value={newDesc}
              onChangeText={setNewDesc}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowCreate(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createButton, creating && { opacity: 0.5 }]}
                onPress={createTopic}
                disabled={creating}
              >
                <Text style={styles.createButtonText}>
                  {creating ? "Creating..." : "Create"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712" },
  center: { justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
  },
  logo: { fontSize: 28, fontWeight: "bold", color: "#fff" },
  logoAccent: { color: "#f97316" },
  subtitle: { fontSize: 14, color: "#6b7280", marginTop: 2 },
  addButton: { backgroundColor: "#f97316", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: "#000", fontWeight: "600", fontSize: 14 },
  subscribeHeaderBtn: { borderWidth: 1, borderColor: "#f97316", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  subscribeHeaderBtnText: { color: "#f97316", fontWeight: "600", fontSize: 14 },
  list: { padding: 16 },
  topicCard: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  topicHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  topicName: { fontSize: 18, fontWeight: "600", color: "#fff", flex: 1 },
  topicMeta: { flexDirection: "row", alignItems: "center" },
  subscribedBadge: {
    backgroundColor: "#1e3a5f",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  subscribedBadgeText: { color: "#60a5fa", fontSize: 10, fontWeight: "600" },
  privateBadge: { marginRight: 4 },
  privateBadgeText: { fontSize: 14 },
  countBadge: {
    backgroundColor: "#1f2937",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    marginRight: 8,
  },
  countText: { color: "#9ca3af", fontSize: 12, fontWeight: "500" },
  bellButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1f2937",
    justifyContent: "center",
    alignItems: "center",
  },
  bellIcon: {
    fontSize: 18,
  },
  bellSubscribed: {
    opacity: 1,
  },
  bellUnsubscribed: {
    opacity: 0.5,
  },
  topicDesc: { color: "#9ca3af", fontSize: 14, marginTop: 4 },
  topicEndpoint: { color: "#6b7280", fontSize: 12, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", marginTop: 8 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "600", color: "#fff", marginBottom: 8 },
  emptyText: { fontSize: 14, color: "#6b7280", textAlign: "center", marginBottom: 24 },
  emptyButton: { backgroundColor: "#f97316", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  emptyButtonText: { color: "#000", fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "#00000099", justifyContent: "flex-end" },
  modal: { backgroundColor: "#111827", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: "#fff", marginBottom: 16 },
  input: { backgroundColor: "#030712", borderWidth: 1, borderColor: "#374151", borderRadius: 12, padding: 16, fontSize: 16, color: "#fff", marginBottom: 12 },
  modalActions: { flexDirection: "row", marginTop: 8 },
  cancelButton: { flex: 1, borderWidth: 1, borderColor: "#374151", borderRadius: 12, padding: 14, alignItems: "center", marginRight: 12 },
  cancelButtonText: { color: "#9ca3af", fontWeight: "600" },
  createButton: { flex: 1, backgroundColor: "#f97316", borderRadius: 12, padding: 14, alignItems: "center" },
  createButtonText: { color: "#000", fontWeight: "600" },
});
