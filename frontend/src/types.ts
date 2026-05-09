// ---- Pipeline status (backend processing state) ----
export type CallStatus = "pending" | "transcribing" | "analyzing" | "done" | "failed";

export const STATUS_STEP_MAP: Record<CallStatus, string> = {
  pending: "Decoding",
  transcribing: "Transcribing",
  analyzing: "Analyzing",
  done: "Done",
  failed: "Failed",
};

// ---- Deal/pipeline status (CRM stage) ----
export type DealStatus = "open" | "at-risk" | "lost" | "won";

// ---- Taxonomy ----
export type InsightKind =
  | "pain-point"
  | "objection"
  | "buying-signal"
  | "feature-req"
  | "competitor"
  | "pricing"
  | "next-step"
  | "quote"
  | "risk"
  | "highlight";

export interface Emotion {
  label: string;
  color: string;
  dot: string;
}
export type EmotionsMap = Record<string, Emotion>;

export interface HighlightType {
  label: string;
  color: string;
}
export type HighlightTypesMap = Record<InsightKind, HighlightType>;

// ---- Participants ----
export interface Participant {
  speaker_label: string;  // original label from diarization — stable key for matching
  name: string;
  role: string | null;
  initials: string;
  side: "rep" | "client";
  color: string;
}

// ---- Transcript ----
export interface TranscriptSegment {
  id: string;
  idx: number;
  start_seconds: number;
  end_seconds: number;
  speaker_label: string;
  speaker_role: string | null;
  text: string;
  mood: string | null;
}

// ---- Tags ----
export interface Tag {
  id: string;
  name: string;
  color: string;
  is_system: boolean;
  source?: "llm" | "user";
}

// ---- Insights ----
export interface Insight {
  id: string;
  kind: InsightKind;
  text: string;
  segment_idx: number | null;
  weight: number;
}

// ---- Action items ----
export interface ActionItem {
  id: string;
  text: string;
  owner: string | null;
  due_date: string | null;
  done: boolean;
}

// ---- Analysis ----
export interface TalkRatio {
  rep: number;
  client: number;
}

export interface Analysis {
  summary: string;
  headline: string;
  overall_sentiment: string;
  talk_ratio: TalkRatio;
  llm_model_used: string;
  prompt_version?: string;
  cost_usd_total: number;
  cost_usd_breakdown: Record<string, number>;
}

// ---- Calls ----
export interface CallSummary {
  id: string;
  title: string;
  client_id: string | null;
  client_name: string | null;
  status: CallStatus;
  deal_status: DealStatus | null;
  duration_seconds: number | null;
  created_at: string;
  tags: Tag[];
  overall_sentiment: string | null;
  sentiment_score: number | null;
  owner: string | null;
}

export interface CallDetail extends CallSummary {
  filename: string;
  size_bytes: number;
  language: string | null;
  segments: TranscriptSegment[];
  insights: Insight[];
  action_items: ActionItem[];
  analysis: Analysis | null;
  participants: Participant[];
  pain_points: Insight[];
  objections: Insight[];
  buying_signals: Insight[];
  next_steps: Insight[];
  emotion_distribution: Record<string, number>;
  emotion_timeline: string[];
}

export interface CallStatusResponse {
  status: CallStatus;
  progress_step: string | null;
  error_message: string | null;
}

// ---- Clients ----
export interface Client {
  id: string;
  name: string;
  industry: string | null;
  owner: string | null;
  calls: number;
  last_call: string | null;
  sentiment: string | null;
  sentiment_score: number | null;
  health: string | null;
  arr: number | null;
}

export interface ClientDetail extends Client {
  recent_calls: CallSummary[];
}

// ---- Dashboard ----
export interface Kpi {
  label: string;
  value: string | number;
  delta: number | null;
  delta_label: string | null;
  positive: boolean;
  spark: number[];
  compare_label: string;
}

export interface PipelineStage {
  label: string;
  count: number;
  pct: number;
}

export interface TopPainPoint {
  text: string;
  count: number;
  weight: number;
}

export interface TopPerformer {
  name: string;
  calls: number;
  sentiment: number;
}

export interface DashboardOut {
  kpis: Kpi[];
  sentiment_trend: Array<{ week: string; score: number }>;
  calls_per_day: Array<{ date: string; count: number }>;
  pipeline: PipelineStage[];
  top_pain_points: TopPainPoint[];
  top_performers: TopPerformer[];
  recent_calls: CallSummary[];
}

// ---- Filters ----
export interface CallFilters {
  search?: string;
  tag?: string;
  assigned?: "all" | "assigned" | "unassigned";
  client_id?: string;
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}
