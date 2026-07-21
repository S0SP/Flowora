export type ContactStatus = "active" | "inactive" | "blocked";
export type MessageDirection = "inbound" | "outbound";
export type MessageStatus = "sent" | "delivered" | "read" | "failed";
export type CampaignStatus = "draft" | "scheduled" | "running" | "completed" | "failed";

export interface Contact {
  id: string;
  phone: string;
  name: string | null;
  full_name?: string;
  email: string | null;
  status: ContactStatus;
  tags: string[];
  custom_fields?: Record<string, any>;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  contact_id: string;
  campaign_id: string | null;
  wamid: string | null;
  direction: MessageDirection;
  content: string;
  media_url: string | null;
  status: MessageStatus;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
  contact?: Contact;
}

export interface Campaign {
  id: string;
  name: string;
  template_name: string;
  template_language: string;
  status: CampaignStatus;
  total_contacts: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  scheduled_at: string | null;
  contacts_json: ParsedContact[] | null;
}

export interface CampaignLog {
  id: string;
  campaign_id: string;
  contact_id: string;
  wamid: string | null;
  status: MessageStatus;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
  contact?: Contact;
}

export interface Analytics {
  total_messages: number;
  total_sent: number;
  total_delivered: number;
  total_read: number;
  total_failed: number;
  delivered_rate: number;
  read_rate: number;
  failed_rate: number;
  total_campaigns: number;
  total_contacts: number;
  messages_by_day: { date: string; count: number }[];
  campaigns_performance: { name: string; sent: number; delivered: number; read: number; failed: number }[];
}

export interface ParsedContact {
  phone: string;
  name?: string;
  email?: string;
}

export interface WhatsAppTemplate {
  name: string;
  language: string;
  display_name: string;
  components?: any[];
  body_text?: string;
}

export interface SendCampaignPayload {
  campaign_name: string;
  template_name: string;
  template_language: string;
  contacts: ParsedContact[];
  scheduled_at?: string | null;
}

export interface SendReplyPayload {
  contact_id: string;
  phone: string;
  message: string;
}

export interface WebhookDeliveryUpdate {
  wamid: string;
  status: MessageStatus;
  timestamp: string;
}

export interface IncomingMessage {
  phone: string;
  name: string;
  message: string;
  wamid: string;
  timestamp: string;
}

export type MessageTemplateStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAUSED'
  | 'DISABLED'
  | 'IN_APPEAL'
  | 'PENDING_DELETION';

export type TemplateButton =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'URL'; text: string; url: string; example?: string }
  | { type: 'PHONE_NUMBER'; text: string; phone_number: string }
  | { type: 'COPY_CODE'; text: string; example: string };

export interface TemplateSampleValues {
  body?: string[];
  header?: string[];
}

export interface MessageTemplate {
  id: string;
  workspace_id: string;
  user_id?: string | null;
  name: string;
  category: 'Marketing' | 'Utility' | 'Authentication';
  language?: string;
  header_type?: 'text' | 'image' | 'video' | 'document';
  header_content?: string;
  header_handle?: string;
  header_media_url?: string;
  body_text: string;
  footer_text?: string;
  buttons?: TemplateButton[];
  sample_values?: TemplateSampleValues;
  status?: MessageTemplateStatus;
  meta_template_id?: string;
  rejection_reason?: string;
  quality_score?: 'GREEN' | 'YELLOW' | 'RED';
  submission_error?: string;
  last_submitted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ChannelConnection {
  id: string;
  workspace_id: string;
  name: string;
  type: string;
  config: any;
  secrets_enc: string | null;
  is_active: boolean;
  registered_at?: string | null;
  subscribed_apps_at?: string | null;
  last_registration_error?: string | null;
  created_at: string;
  updated_at: string;
}

