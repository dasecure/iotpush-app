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
  // Two-way fields
  actions?: NotificationAction[] | null;
  callback_url?: string | null;
  status?: string;
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

export interface NotificationAction {
  id: string;
  label: string;
  type: "button" | "reply" | "url" | "dismiss";
  url?: string;
  destructive?: boolean;
}

export interface Device {
  id: string;
  user_id: string;
  push_token: string;
  platform: "ios" | "android" | "web";
  device_name: string | null;
  app_version: string | null;
  last_seen_at: string;
  active: boolean;
  created_at: string;
}

export interface Receipt {
  receipt_id: string;
  message_id: string;
  topic_id: string;
  status: "queued" | "delivered" | "read" | "acted" | "expired" | "failed";
  delivered_count: number;
  read_count: number;
  acted_count: number;
  actions_taken: ActionEvent[];
  created_at: string;
  updated_at: string;
}

export interface ActionEvent {
  action_id: string;
  action_label: string;
  reply_text: string | null;
  device_id: string | null;
  device_name: string | null;
  user_id: string;
  acted_at: string;
}
