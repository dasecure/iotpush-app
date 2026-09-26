import { supabase } from "./supabase";
import { Message } from "./types";

// Inbox search & filter — server-side, RLS-enforced.
//
// Search runs against iot_messages.search_text (title + body, STORED
// generated column with a gin_trgm_ops index — migration 012), so a
// substring match stays an index scan as the table grows. Priority filters use
// priority_norm, which absorbs historical junk values ("u=3, i", "default").

export type Priority = "urgent" | "high" | "normal" | "low";
export type Since = "all" | "24h" | "7d" | "30d";
export type Source = "all" | "mine" | "subscribed";

export interface InboxFilters {
  q: string;
  topicIds: string[]; // empty = every topic in scope
  priorities: Priority[]; // empty = any
  needsAnswer: boolean;
  hasLink: boolean;
  since: Since;
  source: Source;
}

export const EMPTY_FILTERS: InboxFilters = {
  q: "",
  topicIds: [],
  priorities: [],
  needsAnswer: false,
  hasLink: false,
  since: "all",
  source: "all",
};

export const PAGE_SIZE = 50;

// Explicit column list: never pull callback_headers (may hold secrets) or the
// search_text blob down to the phone.
const COLUMNS =
  "id, topic_id, title, message, priority, priority_norm, tags, click_url, metadata, created_at, " +
  "actions, status, expects_response, response_status";

export function activeFilterCount(f: InboxFilters): number {
  return (
    (f.topicIds.length ? 1 : 0) +
    (f.priorities.length ? 1 : 0) +
    (f.needsAnswer ? 1 : 0) +
    (f.hasLink ? 1 : 0) +
    (f.since !== "all" ? 1 : 0) +
    (f.source !== "all" ? 1 : 0)
  );
}

export function sinceToIso(since: Since): string | null {
  const h = since === "24h" ? 24 : since === "7d" ? 24 * 7 : since === "30d" ? 24 * 30 : 0;
  return h ? new Date(Date.now() - h * 3600_000).toISOString() : null;
}

/** Escape LIKE metacharacters so user input is matched literally. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

export function normalizeQuery(q: string): string {
  return q.trim().replace(/\s+/g, " ").slice(0, 200);
}

/**
 * Fetch one page. `scopeIds` narrows to specific topics (source / topic
 * filters); null means "everything RLS lets me read" (owned + subscribed),
 * which keeps the URL short no matter how many topics exist. `before` is the
 * created_at of the last row already shown (keyset pagination).
 */
export async function fetchInboxPage(
  scopeIds: string[] | null,
  f: InboxFilters,
  before?: string | null
): Promise<{ rows: Message[]; hasMore: boolean; error?: string }> {
  if (scopeIds && scopeIds.length === 0) return { rows: [], hasMore: false };

  let query = supabase
    .from("iot_messages")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (scopeIds) query = query.in("topic_id", scopeIds);
  const q = normalizeQuery(f.q);
  if (q) query = query.ilike("search_text", `%${escapeLike(q)}%`);
  if (f.priorities.length) query = query.in("priority_norm", f.priorities);
  if (f.needsAnswer) query = query.eq("expects_response", true).eq("response_status", "pending");
  if (f.hasLink) query = query.not("click_url", "is", null);
  const sinceIso = sinceToIso(f.since);
  if (sinceIso) query = query.gte("created_at", sinceIso);
  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;
  if (error) return { rows: [], hasMore: false, error: error.message };
  const rows = (data || []) as unknown as Message[];
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}

/** Client-side mirror of the server filters, for realtime inserts. */
export function matchesFilters(m: Message, scope: Set<string>, f: InboxFilters): boolean {
  if (!scope.has(m.topic_id)) return false;
  const q = normalizeQuery(f.q).toLowerCase();
  if (q) {
    const hay = `${m.title || ""} ${m.message || ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (f.priorities.length) {
    const p = (m.priority_norm || m.priority || "normal").toLowerCase();
    if (!f.priorities.includes(p as Priority)) return false;
  }
  if (f.needsAnswer && !(m.expects_response && m.response_status === "pending")) return false;
  if (f.hasLink && !m.click_url) return false;
  return true; // a just-inserted row always satisfies "since"
}
