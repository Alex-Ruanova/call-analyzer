/**
 * Pure mapping functions that convert raw backend JSON shapes into frontend types.
 * Backend types are defined here (prefixed Backend*) — never imported from types.ts.
 */

import type {
  CallSummary,
  CallDetail,
  CallStatusResponse,
  Client,
  ClientDetail,
  DashboardOut,
  Tag,
  EmotionsMap,
  Insight,
  InsightKind,
  Participant,
  TranscriptSegment,
  CallStatus,
} from "../types";

// ---- Raw backend types ----

export interface BackendTagOut {
  id: number;
  name: string;
  color: string;
  is_system: boolean;
  source?: string | null;
}

export interface BackendTranscriptSegment {
  idx: number;
  start_seconds: number;
  end_seconds: number;
  speaker_label: string;
  speaker_role: string | null;
  text: string;
  mood: string | null;
}

export interface BackendInsightOut {
  id: number;
  kind: string;
  text: string;
  segment_idx: number | null;
  weight: number;
}

export interface BackendActionItemOut {
  id: number;
  text: string;
  owner: string | null;
  due_date: string | null;
  done: boolean;
}

export interface BackendAnalysisOut {
  summary: string;
  headline: string;
  overall_sentiment: string;
  talk_ratio_rep: number;
  talk_ratio_client: number;
  llm_model_used: string;
  cost_usd_breakdown: Record<string, number>;
  cost_usd_total: number;
}

export interface BackendCallSummary {
  id: number;
  title: string;
  status: string;
  client_id: number | null;
  client_name: string | null;
  created_at: string;
  duration_seconds: number | null;
  tags: BackendTagOut[];
  cost_usd_total: number | null;
  overall_sentiment: string | null;
  sentiment_score: number | null;
}

export interface BackendCallDetail {
  id: number;
  title: string;
  status: string;
  client_id: number | null;
  client_name: string | null;
  created_at: string;
  updated_at: string;
  duration_seconds: number | null;
  language: string | null;
  original_filename: string;
  size_bytes: number;
  tags: BackendTagOut[];
  segments: BackendTranscriptSegment[];
  insights: BackendInsightOut[];
  action_items: BackendActionItemOut[];
  analysis: BackendAnalysisOut | null;
  error_message: string | null;
  sentiment_score: number | null;
  participants: BackendParticipantOut[];
}

export interface BackendParticipantOut {
  speaker_label: string;
  display_name: string | null;
  role: string | null;
  side: string | null;
}

export interface BackendCallStatus {
  status: string;
  progress_step: number;
  error_message: string | null;
}

export interface BackendClientOut {
  id: number;
  name: string;
  industry: string | null;
  owner: string | null;
  created_at: string;
  calls: number;
  last_call: string | null;
  sentiment: string | null;
  sentiment_score: number | null;
}

export interface BackendClientDetail extends BackendClientOut {
  recent_calls: BackendCallSummary[];
}

export interface BackendKPIItem {
  value: number;
  delta: number | null;
}

export interface BackendSentimentPoint {
  week: string;
  positive: number;
  neutral: number;
  negative: number;
}

export interface BackendDailyCallsPoint {
  date: string;
  count: number;
}

export interface BackendPipelineStage {
  stage: string;
  count: number;
}

export interface BackendTopPainPoint {
  text: string;
  count: number;
  weight: number;
}

export interface BackendDashboardOut {
  calls_this_week: BackendKPIItem;
  avg_sentiment: BackendKPIItem;
  total_cost_usd: BackendKPIItem;
  talk_listen_ratio: BackendKPIItem;
  sentiment_trend: BackendSentimentPoint[];
  calls_per_day: BackendDailyCallsPoint[];
  pipeline: BackendPipelineStage[];
  top_pain_points: BackendTopPainPoint[];
}

export interface BackendEmotion {
  name: string;
  color: string;
}

// ---- Progress step mapping ----
// Backend _PROGRESS_MAP: {pending:0, transcribing:1, analyzing:3, done:5, failed:-1}
// The status endpoint returns the numeric step; we map the status string directly.

const PROGRESS_STEP_LABELS: Record<number, string> = {
  0: "Decoding",
  1: "Transcribing",
  2: "Transcribing",
  3: "Analyzing",
  4: "Analyzing",
  5: "Done",
  [-1]: "Failed",
};

// ---- Speaker palette ----

const SPEAKER_COLORS = [
  "#10b981",
  "#22d3ee",
  "#a78bfa",
  "#f59e0b",
  "#f43f5e",
  "#6366f1",
  "#ec4899",
];

// ---- Mappers ----

export function mapTag(raw: BackendTagOut): Tag {
  return {
    id: String(raw.id),
    name: raw.name,
    color: raw.color,
    is_system: raw.is_system,
    source: raw.source === "llm" || raw.source === "user" ? raw.source : undefined,
  };
}

export function mapCallSummary(raw: BackendCallSummary): CallSummary {
  return {
    id: String(raw.id),
    title: raw.title,
    status: raw.status as CallStatus,
    client_id: raw.client_id !== null ? String(raw.client_id) : null,
    client_name: raw.client_name,
    created_at: raw.created_at,
    duration_seconds: raw.duration_seconds,
    tags: raw.tags.map(mapTag),
    overall_sentiment: raw.overall_sentiment,
    sentiment_score: raw.sentiment_score,
    deal_status: null,
    owner: null,
  };
}

export function mapCallDetail(raw: BackendCallDetail): CallDetail {
  const segments: TranscriptSegment[] = raw.segments.map((seg) => ({
    id: String(seg.idx),
    idx: seg.idx,
    start_seconds: seg.start_seconds,
    end_seconds: seg.end_seconds,
    speaker_label: seg.speaker_label,
    speaker_role: seg.speaker_role,
    text: seg.text,
    mood: seg.mood,
  }));

  // Derive participants from unique speaker labels, then overlay any saved
  // participant config from the backend (display_name, role, side).
  const seen = new Map<string, { role: string | null; index: number }>();
  for (const seg of raw.segments) {
    if (!seen.has(seg.speaker_label)) {
      seen.set(seg.speaker_label, { role: seg.speaker_role, index: seen.size });
    }
  }
  const savedByLabel = new Map<string, BackendParticipantOut>(
    (raw.participants ?? []).map((p) => [p.speaker_label, p])
  );
  const participants: Participant[] = Array.from(seen.entries()).map(
    ([label, { role, index }]) => {
      const saved = savedByLabel.get(label);
      const name = saved?.display_name ?? label;
      const finalRole = saved?.role ?? role ?? null;
      const side: "rep" | "client" =
        saved?.side === "rep" || saved?.side === "client"
          ? saved.side
          : index === 0
          ? "rep"
          : "client";
      return {
        speaker_label: label,
        name,
        role: finalRole,
        initials: name.slice(0, 2).toUpperCase(),
        side,
        color: SPEAKER_COLORS[index % SPEAKER_COLORS.length],
      };
    }
  );

  // Derive emotion_distribution
  const emotion_distribution: Record<string, number> = raw.segments.reduce<Record<string, number>>(
    (acc, seg) => {
      const mood = seg.mood ?? "neutral";
      acc[mood] = (acc[mood] ?? 0) + 1;
      return acc;
    },
    {}
  );

  // Derive emotion_timeline
  const emotion_timeline: string[] = raw.segments.map((seg) => seg.mood ?? "neutral");

  // Derive insight groups
  const insights: Insight[] = raw.insights.map((ins) => ({
    id: String(ins.id),
    kind: ins.kind as InsightKind,
    text: ins.text,
    segment_idx: ins.segment_idx,
    weight: ins.weight,
  }));

  const pain_points = insights.filter((i) => i.kind === "pain-point");
  const objections = insights.filter((i) => i.kind === "objection");
  const buying_signals = insights.filter((i) => i.kind === "buying-signal");
  const next_steps = insights.filter((i) => i.kind === "next-step");

  const analysis = raw.analysis
    ? {
        summary: raw.analysis.summary,
        headline: raw.analysis.headline,
        overall_sentiment: raw.analysis.overall_sentiment,
        talk_ratio: {
          rep: raw.analysis.talk_ratio_rep,
          client: raw.analysis.talk_ratio_client,
        },
        llm_model_used: raw.analysis.llm_model_used,

        cost_usd_total: raw.analysis.cost_usd_total,
        cost_usd_breakdown: raw.analysis.cost_usd_breakdown,
      }
    : null;

  return {
    id: String(raw.id),
    title: raw.title,
    status: raw.status as CallStatus,
    client_id: raw.client_id !== null ? String(raw.client_id) : null,
    client_name: raw.client_name,
    created_at: raw.created_at,
    duration_seconds: raw.duration_seconds,
    tags: raw.tags.map(mapTag),
    overall_sentiment: raw.analysis?.overall_sentiment ?? null,
    sentiment_score: raw.sentiment_score,
    deal_status: null,
    owner: null,
    filename: raw.original_filename,
    size_bytes: raw.size_bytes,
    language: raw.language,
    segments,
    insights,
    action_items: raw.action_items.map((a) => ({
      id: String(a.id),
      text: a.text,
      owner: a.owner,
      due_date: a.due_date,
      done: a.done,
    })),
    analysis,
    participants,
    pain_points,
    objections,
    buying_signals,
    next_steps,
    emotion_distribution,
    emotion_timeline,
  };
}

export function mapCallStatus(raw: BackendCallStatus): CallStatusResponse {
  const stepLabel = PROGRESS_STEP_LABELS[raw.progress_step] ?? null;

  return {
    status: raw.status as CallStatus,
    progress_step: stepLabel,
    error_message: raw.error_message,
  };
}

export function mapClient(raw: BackendClientOut): Client {
  return {
    id: String(raw.id),
    name: raw.name,
    industry: raw.industry,
    owner: raw.owner,
    calls: raw.calls,
    last_call: raw.last_call,
    sentiment: raw.sentiment,
    sentiment_score: raw.sentiment_score,
    health: null,
    arr: null,
  };
}

export function mapClientDetail(raw: BackendClientDetail): ClientDetail {
  return {
    ...mapClient(raw),
    recent_calls: raw.recent_calls.map(mapCallSummary),
  };
}

export function mapDashboard(
  raw: BackendDashboardOut,
  recentCalls: CallSummary[]
): DashboardOut {
  const kpis = [
    {
      label: "Calls this week",
      value: raw.calls_this_week.value,
      delta: raw.calls_this_week.delta,
      delta_label: null,
      positive: (raw.calls_this_week.delta ?? 0) >= 0,
      spark: [] as number[],
      compare_label: "vs last week",
    },
    {
      label: "Avg sentiment",
      value: raw.avg_sentiment.value.toFixed(2),
      delta: raw.avg_sentiment.delta,
      delta_label:
        raw.avg_sentiment.delta != null
          ? `${raw.avg_sentiment.delta >= 0 ? "+" : ""}${raw.avg_sentiment.delta.toFixed(2)}`
          : null,
      positive: (raw.avg_sentiment.delta ?? 0) >= 0,
      spark: [] as number[],
      compare_label: "vs prior 30 days",
    },
    {
      label: "Total cost",
      value: `$${raw.total_cost_usd.value.toFixed(3)}`,
      delta: raw.total_cost_usd.delta,
      delta_label:
        raw.total_cost_usd.delta != null
          ? `${raw.total_cost_usd.delta >= 0 ? "+" : "-"}$${Math.abs(raw.total_cost_usd.delta).toFixed(3)}`
          : null,
      // Cost going UP is NOT a positive signal — flip the sign.
      positive: (raw.total_cost_usd.delta ?? 0) <= 0,
      spark: [] as number[],
      compare_label: "vs before 30 days ago",
    },
    {
      // Fraction of total speaking time used by the rep (the dominant
      // speaker by total duration). 0.50 = balanced; >0.60 = rep talks
      // too much; <0.40 = customer dominates the call.
      label: "Talk:Listen ratio",
      value: `${Math.round(raw.talk_listen_ratio.value * 100)}%`,
      delta: raw.talk_listen_ratio.delta,
      delta_label:
        raw.talk_listen_ratio.delta != null
          ? `${raw.talk_listen_ratio.delta >= 0 ? "+" : ""}${(raw.talk_listen_ratio.delta * 100).toFixed(1)}pp`
          : null,
      // Higher rep-talk time is generally NOT good in sales coaching.
      positive: (raw.talk_listen_ratio.delta ?? 0) <= 0,
      spark: [] as number[],
      compare_label: "vs prior 30 days",
    },
  ];

  const sentiment_trend = raw.sentiment_trend.map((pt) => {
    const total = pt.positive + pt.neutral + pt.negative;
    return {
      week: pt.week,
      score: total > 0 ? pt.positive / total : 0,
    };
  });

  const pipelineTotal = raw.pipeline.reduce((acc, s) => acc + s.count, 0);
  const pipeline = raw.pipeline.map((s) => ({
    label: s.stage.charAt(0).toUpperCase() + s.stage.slice(1),
    count: s.count,
    pct: pipelineTotal > 0 ? (s.count / pipelineTotal) * 100 : 0,
  }));

  return {
    kpis,
    sentiment_trend,
    calls_per_day: raw.calls_per_day,
    pipeline,
    top_pain_points: raw.top_pain_points,
    top_performers: [],
    recent_calls: recentCalls,
  };
}

export function mapEmotions(raw: BackendEmotion[]): EmotionsMap {
  return raw.reduce<EmotionsMap>((acc, e) => {
    acc[e.name] = { label: e.name, color: e.color, dot: e.color };
    return acc;
  }, {});
}
