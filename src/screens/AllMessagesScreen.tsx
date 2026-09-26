import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
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
  TextInput,
  ScrollView,
  Modal,
  Keyboard,
} from "react-native";
import { supabase } from "../lib/supabase";
import { Topic, Message, NotificationAction } from "../lib/types";
import { reportAction, NotificationTapData } from "../lib/notifications";
import { fetchTopicsOverview, formatRelative } from "../lib/topics";
import {
  InboxFilters,
  EMPTY_FILTERS,
  Priority,
  Since,
  Source,
  activeFilterCount,
  fetchInboxPage,
  matchesFilters,
  normalizeQuery,
} from "../lib/inbox";

interface AllMessagesScreenProps {
  onSelectTopic: (topic: Topic) => void;
  tappedNotification?: NotificationTapData | null;
  onDismissTapped?: () => void;
}

const PRIORITIES: Priority[] = ["urgent", "high", "normal", "low"];
const SINCE_OPTIONS: { key: Since; label: string }[] = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
];
const SOURCE_OPTIONS: { key: Source; label: string }[] = [
  { key: "mine", label: "My topics" },
  { key: "subscribed", label: "Subscribed" },
];
// Above this many topics, an explicit topic_id IN (...) list stops being
// worth its URL length; RLS already scopes an unfiltered query correctly.
const MAX_IN_LIST = 150;

/** Render text with case-insensitive matches of `q` highlighted. */
function Highlighted({ text, q, style, numberOfLines }: {
  text: string; q: string; style: any; numberOfLines?: number;
}) {
  const needle = q.toLowerCase();
  if (!needle) return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const j = lower.indexOf(needle, i);
    if (j < 0) { parts.push(text.slice(i)); break; }
    if (j > i) parts.push(text.slice(i, j));
    parts.push(<Text key={k++} style={styles.hl}>{text.slice(j, j + needle.length)}</Text>);
    i = j + needle.length;
  }
  return <Text style={style} numberOfLines={numberOfLines}>{parts}</Text>;
}

function Chip({ label, active, onPress, onClear }: {
  label: string; active: boolean; onPress: () => void; onClear?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      {active && onClear && (
        <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}>
          <Text style={styles.chipClear}> ✕</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export default function AllMessagesScreen({ onSelectTopic, tappedNotification, onDismissTapped }: AllMessagesScreenProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [topicList, setTopicList] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [topicsLoaded, setTopicsLoaded] = useState(false);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actedMessages, setActedMessages] = useState<Record<string, string>>({});

  // Filters. `queryText` is what's in the box; `filters.q` is the debounced value.
  const [queryText, setQueryText] = useState("");
  const [filters, setFilters] = useState<InboxFilters>(EMPTY_FILTERS);
  const [showTopicPicker, setShowTopicPicker] = useState(false);
  const [topicPickerFilter, setTopicPickerFilter] = useState("");

  const topics = useMemo(() => {
    const map: Record<string, Topic> = {};
    for (const t of topicList) map[t.id] = t;
    return map;
  }, [topicList]);

  const listRef = useRef<FlatList<Message>>(null);
  const requestSeq = useRef(0);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const scopeRef = useRef<Set<string>>(new Set());

  const tappedMessageId = tappedNotification?.message_id || tappedNotification?.messageId || null;
  const q = normalizeQuery(filters.q);
  const filterCount = activeFilterCount(filters);
  const isFiltered = !!q || filterCount > 0;

  // Topic ids the current source + topic filters allow.
  const scope = useMemo(() => {
    let ts = topicList;
    if (filters.source === "mine") ts = ts.filter((t) => t.is_owner !== false);
    if (filters.source === "subscribed") ts = ts.filter((t) => t.is_owner === false);
    if (filters.topicIds.length) {
      const pick = new Set(filters.topicIds);
      ts = ts.filter((t) => pick.has(t.id));
    }
    return new Set(ts.map((t) => t.id));
  }, [topicList, filters.source, filters.topicIds]);
  scopeRef.current = scope;

  // Debounce the search box.
  useEffect(() => {
    const h = setTimeout(() => {
      setFilters((f) => (f.q === queryText ? f : { ...f, q: queryText }));
    }, 300);
    return () => clearTimeout(h);
  }, [queryText]);

  // Scroll to the tapped message once messages are loaded
  useEffect(() => {
    if (!tappedMessageId || loading) return;
    const index = messages.findIndex((m) => m.id === tappedMessageId);
    if (index >= 0) {
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index, viewPosition: 0.2, animated: true });
      }, 300);
    }
  }, [tappedMessageId, loading, messages]);

  const loadTopics = useCallback(async () => {
    try {
      setTopicList(await fetchTopicsOverview());
    } catch (e) {
      console.log("Failed to fetch topics:", e);
    } finally {
      setTopicsLoaded(true);
    }
  }, []);

  const scopeIdsFor = (s: Set<string>, f: InboxFilters): string[] | null => {
    const narrowed = f.source !== "all" || f.topicIds.length > 0;
    if (!narrowed && s.size > MAX_IN_LIST) return null;
    return Array.from(s);
  };

  // First page for the current filters. Stale responses are dropped, so fast
  // typing never paints an older query's results over a newer one.
  const loadFirstPage = useCallback(async () => {
    const seq = ++requestSeq.current;
    setSearching(true);
    const res = await fetchInboxPage(scopeIdsFor(scope, filters), filters, null);
    if (seq !== requestSeq.current) return;
    setMessages(res.rows);
    setHasMore(res.hasMore);
    setError(res.error || null);
    setSearching(false);
    setLoading(false);
  }, [scope, filters]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    const seq = requestSeq.current;
    setLoadingMore(true);
    const last = messages[messages.length - 1];
    const res = await fetchInboxPage(scopeIdsFor(scope, filters), filters, last.created_at);
    if (seq === requestSeq.current && !res.error) {
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...res.rows.filter((m) => !seen.has(m.id))];
      });
      setHasMore(res.hasMore);
    }
    setLoadingMore(false);
  }, [loadingMore, hasMore, messages, scope, filters]);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  // Re-query whenever the topic scope or any filter changes.
  useEffect(() => {
    if (!topicsLoaded) return;
    if (topicList.length === 0) {
      setMessages([]);
      setHasMore(false);
      setLoading(false);
      return;
    }
    loadFirstPage();
  }, [topicsLoaded, topicList.length, loadFirstPage]);

  // Real-time inserts. RLS on the realtime channel only delivers rows this user
  // can read; the scope + filter check keeps the list consistent with the
  // active search (refs, because this closure outlives every re-render).
  useEffect(() => {
    const channel = supabase
      .channel("all-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "iot_messages" },
        (payload) => {
          const newMsg = payload.new as Message;
          if (!matchesFilters(newMsg, scopeRef.current, filtersRef.current)) return;
          setMessages((prev) => (prev.some((m) => m.id === newMsg.id) ? prev : [newMsg, ...prev]));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTopics();
    await loadFirstPage();
    setRefreshing(false);
  };

  const clearAll = () => {
    Keyboard.dismiss();
    setQueryText("");
    setFilters(EMPTY_FILTERS);
  };

  const togglePriority = (p: Priority) =>
    setFilters((f) => ({
      ...f,
      priorities: f.priorities.includes(p) ? f.priorities.filter((x) => x !== p) : [...f.priorities, p],
    }));

  const toggleTopic = (id: string) =>
    setFilters((f) => ({
      ...f,
      topicIds: f.topicIds.includes(id) ? f.topicIds.filter((x) => x !== id) : [...f.topicIds, id],
    }));

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
    const result = await reportAction(item.id, action.id);
    if (result.recorded) {
      setActedMessages((prev) => ({ ...prev, [item.id]: action.label }));
      Alert.alert("Action sent", `"${action.label}" reported successfully`);
    } else if (result.ok) {
      // Closed before the tap arrived. Retrying cannot help.
      setActedMessages((prev) => ({ ...prev, [item.id]: "No longer open" }));
      Alert.alert("Too late", result.reason || "This request was already closed.");
    } else {
      Alert.alert(
        "Not sent",
        `${result.reason || "Something went wrong."}${result.retryable ? " Please try again." : ""}`
      );
    }
  };

  const priorityColor = (p: string) => {
    switch (p) {
      case "high": return "#ef4444";
      case "urgent": return "#dc2626";
      case "low": return "#6b7280";
      default: return "#9ca3af";
    }
  };

  const hasSubscribed = topicList.some((t) => t.is_owner === false);
  const topicChipLabel =
    filters.topicIds.length === 0
      ? "Topics"
      : filters.topicIds.length === 1
        ? topics[filters.topicIds[0]]?.name || "1 topic"
        : `${filters.topicIds.length} topics`;

  const pickerTopics = useMemo(() => {
    const f = topicPickerFilter.trim().toLowerCase();
    return f ? topicList.filter((t) => t.name.toLowerCase().includes(f)) : topicList;
  }, [topicList, topicPickerFilter]);

  const subtitle = isFiltered
    ? `${messages.length}${hasMore ? "+" : ""} match${messages.length === 1 && !hasMore ? "" : "es"}`
    : `${messages.length}${hasMore ? "+" : ""} messages`;

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
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Inbox</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          {isFiltered && (
            <TouchableOpacity onPress={clearAll} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.clearAll}>Clear all</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Search */}
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search title and message"
            placeholderTextColor="#6b7280"
            value={queryText}
            onChangeText={setQueryText}
            onSubmitEditing={() => setFilters((f) => ({ ...f, q: queryText }))}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search messages"
          />
          {searching && !refreshing ? (
            <ActivityIndicator size="small" color="#f97316" />
          ) : queryText ? (
            <TouchableOpacity onPress={() => setQueryText("")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          keyboardShouldPersistTaps="handled"
        >
          <Chip
            label={`${topicChipLabel} ▾`}
            active={filters.topicIds.length > 0}
            onPress={() => setShowTopicPicker(true)}
            onClear={() => setFilters((f) => ({ ...f, topicIds: [] }))}
          />
          <Chip
            label="Needs answer"
            active={filters.needsAnswer}
            onPress={() => setFilters((f) => ({ ...f, needsAnswer: !f.needsAnswer }))}
          />
          {PRIORITIES.map((p) => (
            <Chip
              key={p}
              label={p[0].toUpperCase() + p.slice(1)}
              active={filters.priorities.includes(p)}
              onPress={() => togglePriority(p)}
            />
          ))}
          {SINCE_OPTIONS.map((s) => (
            <Chip
              key={s.key}
              label={s.label}
              active={filters.since === s.key}
              onPress={() => setFilters((f) => ({ ...f, since: f.since === s.key ? "all" : s.key }))}
            />
          ))}
          <Chip
            label="Has link"
            active={filters.hasLink}
            onPress={() => setFilters((f) => ({ ...f, hasLink: !f.hasLink }))}
          />
          {hasSubscribed &&
            SOURCE_OPTIONS.map((s) => (
              <Chip
                key={s.key}
                label={s.label}
                active={filters.source === s.key}
                onPress={() => setFilters((f) => ({ ...f, source: f.source === s.key ? "all" : s.key }))}
              />
            ))}
        </ScrollView>
      </View>

      {/* Tapped notification banner — shows the message the user tapped,
          from the notification payload itself, so it works even when the
          message isn't in the list (e.g. filtered out) */}
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

      {error && (
        <TouchableOpacity style={styles.errorBanner} onPress={loadFirstPage}>
          <Text style={styles.errorText}>Couldn't load messages. Tap to retry.</Text>
        </TouchableOpacity>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={10}
        windowSize={9}
        removeClippedSubviews={Platform.OS === "android"}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color="#f97316" />
          ) : null
        }
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index, viewPosition: 0.2, animated: true });
          }, 500);
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}
        contentContainerStyle={[styles.list, messages.length === 0 && { flex: 1 }]}
        ListEmptyComponent={
          isFiltered ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>No matches</Text>
              <Text style={styles.emptyText}>
                {q ? `Nothing matches "${q}"` : "No messages match these filters"}
                {filterCount > 0 ? ` with ${filterCount} filter${filterCount > 1 ? "s" : ""} on.` : "."}
              </Text>
              <TouchableOpacity style={styles.emptyButton} onPress={clearAll}>
                <Text style={styles.emptyButtonText}>Clear search & filters</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📬</Text>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptyText}>
                Messages from all your topics will appear here
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const topic = topics[item.topic_id];
          const prio = (item.priority_norm || item.priority || "normal").toLowerCase();
          const pending = item.expects_response && item.response_status === "pending";
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
                    onLongPress={() => setFilters((f) => ({ ...f, topicIds: [topic.id] }))}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.topicBadgeText}>{topic.name}</Text>
                  </TouchableOpacity>
                )}
                <Text style={styles.messageTime}>{formatRelative(item.created_at)}</Text>
              </View>
              {item.title && (
                <Highlighted text={item.title} q={q} style={styles.messageTitle} />
              )}
              <Highlighted text={item.message} q={q} style={styles.messageBody} numberOfLines={3} />

              {/* Link chip — tapping the card opens click_url */}
              {item.click_url && (
                <View style={styles.linkChip}>
                  <Text style={styles.linkChipText} numberOfLines={1}>
                    🔗 {linkHost(item.click_url)} — tap to open
                  </Text>
                </View>
              )}
              {(prio !== "normal" || pending) && (
                <View style={styles.messageFooter}>
                  {prio !== "normal" && (
                    <View style={[styles.priorityBadge, { backgroundColor: priorityColor(prio) + "20" }]}>
                      <Text style={[styles.priorityText, { color: priorityColor(prio) }]}>{prio}</Text>
                    </View>
                  )}
                  {pending && (
                    <View style={[styles.priorityBadge, { backgroundColor: "#f9731620" }]}>
                      <Text style={[styles.priorityText, { color: "#f97316" }]}>awaiting answer</Text>
                    </View>
                  )}
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

      {/* Topic picker */}
      <Modal visible={showTopicPicker} animationType="slide" transparent onRequestClose={() => setShowTopicPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter by topic</Text>
              <TouchableOpacity onPress={() => setShowTopicPicker(false)}>
                <Text style={styles.modalDone}>Done</Text>
              </TouchableOpacity>
            </View>
            {topicList.length > 8 && (
              <TextInput
                style={styles.pickerSearch}
                placeholder="Find a topic"
                placeholderTextColor="#6b7280"
                value={topicPickerFilter}
                onChangeText={setTopicPickerFilter}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
            <FlatList
              data={pickerTopics}
              keyExtractor={(t) => t.id}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 420 }}
              renderItem={({ item: t }) => {
                const on = filters.topicIds.includes(t.id);
                return (
                  <TouchableOpacity style={styles.pickerRow} onPress={() => toggleTopic(t.id)}>
                    <Text style={[styles.pickerCheck, on && styles.pickerCheckOn]}>{on ? "☑" : "☐"}</Text>
                    <Text style={styles.pickerName} numberOfLines={1}>{t.name}</Text>
                    {t.is_owner === false && <Text style={styles.pickerTag}>subscribed</Text>}
                    <Text style={styles.pickerCount}>{t.message_count ?? ""}</Text>
                  </TouchableOpacity>
                );
              }}
            />
            {filters.topicIds.length > 0 && (
              <TouchableOpacity
                style={styles.pickerClear}
                onPress={() => setFilters((f) => ({ ...f, topicIds: [] }))}
              >
                <Text style={styles.clearAll}>Show all topics</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  hl: { backgroundColor: "#f9731640", color: "#fff" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  clearAll: { color: "#f97316", fontWeight: "600", fontSize: 14 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 10,
    paddingHorizontal: 12,
    marginTop: 14,
    height: 42,
  },
  searchIcon: { color: "#6b7280", fontSize: 18, marginRight: 8 },
  searchInput: { flex: 1, color: "#fff", fontSize: 15, paddingVertical: 0 },
  searchClear: { color: "#6b7280", fontSize: 14, fontWeight: "600", paddingLeft: 8 },
  chipRow: { paddingTop: 10, gap: 8, paddingRight: 20 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: "#f9731620", borderColor: "#f97316" },
  chipText: { color: "#9ca3af", fontSize: 13, fontWeight: "500" },
  chipTextActive: { color: "#f97316" },
  chipClear: { color: "#f97316", fontSize: 12, fontWeight: "700" },
  errorBanner: { backgroundColor: "#7f1d1d40", borderColor: "#ef4444", borderWidth: 1, borderRadius: 8, margin: 16, marginBottom: 0, padding: 10 },
  errorText: { color: "#fca5a5", fontSize: 13, textAlign: "center" },
  emptyButton: { backgroundColor: "#f97316", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 16 },
  emptyButtonText: { color: "#000", fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "#00000099", justifyContent: "flex-end" },
  modal: { backgroundColor: "#111827", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#fff" },
  modalDone: { color: "#f97316", fontWeight: "600", fontSize: 16 },
  pickerSearch: { backgroundColor: "#030712", borderWidth: 1, borderColor: "#374151", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 15, marginBottom: 8 },
  pickerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#1f2937" },
  pickerCheck: { color: "#6b7280", fontSize: 18, width: 28 },
  pickerCheckOn: { color: "#f97316" },
  pickerName: { color: "#fff", fontSize: 15, flex: 1, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  pickerTag: { color: "#60a5fa", fontSize: 10, fontWeight: "600", marginHorizontal: 8 },
  pickerCount: { color: "#6b7280", fontSize: 12, minWidth: 36, textAlign: "right" },
  pickerClear: { alignItems: "center", paddingTop: 14 },
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
