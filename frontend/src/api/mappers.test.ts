import { describe, it, expect } from "vitest";
import {
  mapCallSummary,
  mapCallDetail,
  mapCallStatus,
  mapDashboard,
  mapEmotions,
} from "./mappers";
import type {
  BackendCallSummary,
  BackendCallDetail,
  BackendCallStatus,
  BackendDashboardOut,
  BackendEmotion,
  BackendTranscriptSegment,
  BackendAnalysisOut,
} from "./mappers";

// ---- Fixtures ----

const baseTag = { id: 1, name: "Discovery", color: "#22d3ee", is_system: false };

const baseSummary: BackendCallSummary = {
  id: 42,
  title: "Test Call",
  status: "done",
  client_id: 7,
  client_name: "Acme",
  created_at: "2026-01-01T00:00:00Z",
  duration_seconds: 120,
  tags: [baseTag],
  cost_usd_total: 0.01,
  overall_sentiment: null,
  sentiment_score: null,
};

const segA: BackendTranscriptSegment = {
  idx: 0,
  start_seconds: 0,
  end_seconds: 10,
  speaker_label: "SPEAKER_00",
  speaker_role: "AE",
  text: "Hello",
  mood: "positive",
};

const segB: BackendTranscriptSegment = {
  idx: 1,
  start_seconds: 11,
  end_seconds: 20,
  speaker_label: "SPEAKER_01",
  speaker_role: "VP",
  text: "Hi",
  mood: "neutral",
};

const segC: BackendTranscriptSegment = {
  idx: 2,
  start_seconds: 21,
  end_seconds: 30,
  speaker_label: "SPEAKER_00",
  speaker_role: "AE",
  text: "Great",
  mood: "positive",
};

const baseDetail: BackendCallDetail = {
  id: 5,
  title: "Detail Call",
  status: "done",
  client_id: null,
  client_name: null,
  created_at: "2026-01-02T00:00:00Z",
  updated_at: "2026-01-02T01:00:00Z",
  duration_seconds: 300,
  language: "en",
  original_filename: "call.mp3",
  size_bytes: 1024,
  tags: [],
  segments: [segA, segB, segC],
  insights: [
    { id: 10, kind: "pain-point", text: "Pain A", segment_idx: 0, weight: 0.9 },
    { id: 11, kind: "objection", text: "Obj B", segment_idx: 1, weight: 0.8 },
    { id: 12, kind: "buying-signal", text: "Signal C", segment_idx: null, weight: 0.7 },
    { id: 13, kind: "next-step", text: "Step D", segment_idx: 2, weight: 1.0 },
  ],
  action_items: [],
  analysis: null,
  error_message: null,
  sentiment_score: null,
  participants: [],
};

const baseDashboard: BackendDashboardOut = {
  calls_this_week: { value: 10, delta: 2 },
  avg_sentiment: { value: 0.55, delta: null },
  total_cost_usd: { value: 0.123, delta: 0.045 },
  talk_listen_ratio: { value: 46, delta: -1 },
  sentiment_trend: [
    { week: "W1", positive: 5, neutral: 3, negative: 2 },  // total 10, score = 0.5
    { week: "W2", positive: 0, neutral: 0, negative: 0 },  // total 0 → divide-by-zero guard
  ],
  calls_per_day: [{ date: "2026-01-01", count: 3 }],
  pipeline: [
    { stage: "open", count: 4 },
    { stage: "closed", count: 1 },
  ],
  top_pain_points: [{ text: "Coaching velocity", count: 8, weight: 0.9 }],
};

// ---- Test cases ----

describe("mapCallSummary", () => {
  it("stringifies IDs and sets missing fields to null", () => {
    const result = mapCallSummary(baseSummary);
    expect(result.id).toBe("42");
    expect(result.client_id).toBe("7");
    expect(result.overall_sentiment).toBeNull();
    expect(result.deal_status).toBeNull();
    expect(result.owner).toBeNull();
    expect(result.tags[0].id).toBe("1");
  });
});

describe("mapCallDetail — pain_points derived from insights", () => {
  it("filters insights by kind correctly", () => {
    const result = mapCallDetail(baseDetail);
    expect(result.pain_points).toHaveLength(1);
    expect(result.pain_points[0].text).toBe("Pain A");
    expect(result.objections).toHaveLength(1);
    expect(result.objections[0].text).toBe("Obj B");
    expect(result.buying_signals).toHaveLength(1);
    expect(result.next_steps).toHaveLength(1);
  });
});

describe("mapCallDetail — participants from segments", () => {
  it("derives 2 participants with correct sides from 2 unique speakers", () => {
    const result = mapCallDetail(baseDetail);
    expect(result.participants).toHaveLength(2);
    const [p0, p1] = result.participants;
    expect(p0.name).toBe("SPEAKER_00");
    expect(p0.side).toBe("rep");
    expect(p0.initials).toBe("SP");
    expect(p1.name).toBe("SPEAKER_01");
    expect(p1.side).toBe("client");
  });
});

describe("mapCallDetail — emotion_distribution", () => {
  it("counts moods across all segments correctly", () => {
    const result = mapCallDetail(baseDetail);
    // segA=positive, segB=neutral, segC=positive → positive:2, neutral:1
    expect(result.emotion_distribution["positive"]).toBe(2);
    expect(result.emotion_distribution["neutral"]).toBe(1);
    expect(result.emotion_timeline).toEqual(["positive", "neutral", "positive"]);
  });
});

describe("mapDashboard — divide-by-zero guard on sentiment_trend", () => {
  it("returns score=0 for a week with zero total calls", () => {
    const [recent] = [baseSummary].map(mapCallSummary);
    const result = mapDashboard(baseDashboard, [recent]);
    expect(result.sentiment_trend[0].score).toBeCloseTo(0.5);
    expect(result.sentiment_trend[1].score).toBe(0);  // zero-total week
  });
});

describe("mapCallStatus", () => {
  it("maps progress_step 3 to 'Analyzing'", () => {
    const raw: BackendCallStatus = { status: "analyzing", progress_step: 3, error_message: null };
    const result = mapCallStatus(raw);
    expect(result.progress_step).toBe("Analyzing");
    expect(result.status).toBe("analyzing");
  });
});

describe("mapCallDetail — analysis reshape", () => {
  it("maps talk_ratio_rep/client to nested talk_ratio and propagates overall_sentiment", () => {
    const analysis: BackendAnalysisOut = {
      summary: "Good call",
      headline: "Positive outcome",
      overall_sentiment: "positive",
      talk_ratio_rep: 0.6,
      talk_ratio_client: 0.4,
      llm_model_used: "claude-3",
      cost_usd_breakdown: {},
      cost_usd_total: 0.05,
    };
    const detailWithAnalysis: BackendCallDetail = { ...baseDetail, analysis };
    const result = mapCallDetail(detailWithAnalysis);
    expect(result.analysis).not.toBeNull();
    expect(result.analysis!.talk_ratio).toEqual({ rep: 0.6, client: 0.4 });
    expect(result.overall_sentiment).toBe("positive");
  });
});

describe("mapCallStatus — failed state", () => {
  it("maps progress_step -1 to 'Failed'", () => {
    const raw: BackendCallStatus = { status: "failed", progress_step: -1, error_message: "timeout" };
    const result = mapCallStatus(raw);
    expect(result.progress_step).toBe("Failed");
    expect(result.status).toBe("failed");
    expect(result.error_message).toBe("timeout");
  });
});

describe("mapEmotions", () => {
  it("converts list to Record keyed by name with label and dot fields", () => {
    const raw: BackendEmotion[] = [
      { name: "positive", color: "#10b981" },
      { name: "neutral", color: "#6b7280" },
    ];
    const result = mapEmotions(raw);
    expect(result["positive"]).toEqual({ label: "positive", color: "#10b981", dot: "#10b981" });
    expect(result["neutral"].dot).toBe("#6b7280");
    expect(Object.keys(result)).toHaveLength(2);
  });
});
