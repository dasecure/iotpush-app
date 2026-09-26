import { supabase } from "./supabase";
import { Topic } from "./types";

/**
 * Owned + subscribed topics with message counts, in ONE round trip.
 *
 * Before this, the Topics screen made 3 + N sequential requests per refresh
 * (getUser, owned topics, subscriptions, subscribed topics, then one
 * count(*) per topic awaited one at a time), so refresh time grew linearly
 * with topic count. topics_overview() (migration 013) does it server-side in
 * a few milliseconds, and returns api_key only for topics the caller owns.
 *
 * The fallback keeps older databases working, but runs the per-topic counts
 * in parallel rather than serially.
 */
export async function fetchTopicsOverview(): Promise<Topic[]> {
  const { data, error } = await supabase.rpc("topics_overview");
  if (!error && Array.isArray(data)) {
    return (data as Topic[]).map((t) => ({
      ...t,
      message_count: Number(t.message_count ?? 0),
    }));
  }
  console.log("[iotpush] topics_overview RPC unavailable, falling back:", error?.message);
  return fetchTopicsLegacy();
}

async function fetchTopicsLegacy(): Promise<Topic[]> {
  // getSession() reads the locally cached session — no network round trip.
  // RLS is what actually enforces access; the id here only narrows the query.
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) return [];

  const [ownedRes, subsRes] = await Promise.all([
    supabase.from("iot_topics").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
    supabase.from("iot_subscribers").select("topic_id").eq("user_id", uid),
  ]);
  const owned = (ownedRes.data || []) as Topic[];
  const ownedIds = new Set(owned.map((t) => t.id));
  const subIds = Array.from(new Set((subsRes.data || []).map((s) => s.topic_id))).filter((id) => !ownedIds.has(id));

  let subscribed: Topic[] = [];
  if (subIds.length) {
    const { data } = await supabase.from("iot_topics").select("*").in("id", subIds).order("created_at", { ascending: false });
    subscribed = (data || []) as Topic[];
  }

  const all: Topic[] = [
    ...owned.map((t) => ({ ...t, is_owner: true })),
    ...subscribed.map((t) => ({ ...t, is_owner: false })),
  ];
  const counts = await Promise.all(
    all.map((t) =>
      supabase.from("iot_messages").select("id", { count: "exact", head: true }).eq("topic_id", t.id)
        .then(({ count }) => count || 0)
    )
  );
  return all.map((t, i) => ({ ...t, message_count: counts[i] }));
}

/** "just now", "5m ago", "3h ago", "2d ago", or a date. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
