export interface Topic {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_private: boolean;
  api_key: string;
  created_at: string;
}

export interface Message {
  id: string;
  topic_id: string;
  title: string | null;
  message: string;
  priority: string;
  tags: string[] | null;
  click_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  // Joined
  topic?: Topic;
}

export interface Subscriber {
  id: string;
  topic_id: string;
  endpoint: string;
  type: string;
  active: boolean;
  created_at: string;
}
