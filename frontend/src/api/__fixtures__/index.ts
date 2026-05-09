// Phase 6 deletes this entire file when real API hooks are wired up.
import type {
  Tag, CallSummary, Participant, TranscriptSegment, Insight, ActionItem,
  Analysis, CallDetail, Client, DashboardOut, EmotionsMap,
} from "../../types";

export const MOCK_TAGS: Tag[] = [
  { id: "tag-1", name: "Discovery", color: "#22d3ee", is_system: false, source: "user" },
  { id: "tag-2", name: "Enterprise", color: "#6366f1", is_system: false, source: "user" },
  { id: "tag-3", name: "LATAM", color: "#ec4899", is_system: false, source: "llm" },
  { id: "tag-4", name: "Demo", color: "#10b981", is_system: false, source: "user" },
  { id: "tag-5", name: "Pricing", color: "#f59e0b", is_system: false, source: "user" },
  { id: "tag-6", name: "Renewal", color: "#a78bfa", is_system: false, source: "user" },
  { id: "tag-7", name: "Closing", color: "#a3e635", is_system: false, source: "user" },
  { id: "tag-8", name: "Follow-up", color: "#64748b", is_system: false, source: "user" },
  { id: "tag-9", name: "Mid-Market", color: "#14b8a6", is_system: false, source: "user" },
  { id: "tag-10", name: "Healthcare", color: "#0ea5e9", is_system: false, source: "user" },
  { id: "tag-11", name: "Finance", color: "#eab308", is_system: false, source: "user" },
  { id: "tag-12", name: "SMB", color: "#94a3b8", is_system: false, source: "user" },
];

export const MOCK_CALLS: CallSummary[] = [
  { id: "call-001", title: "Discovery — Northwind × Altur", client_id: "c1", client_name: "Northwind Logistics", status: "done", deal_status: "open", duration_seconds: 334, created_at: "2026-03-15T11:30:00Z", tags: [MOCK_TAGS[0], MOCK_TAGS[1], MOCK_TAGS[2]], overall_sentiment: "0.62", owner: "Maya Chen" },
  { id: "call-002", title: "Demo — Helix Robotics", client_id: "c2", client_name: "Helix Robotics", status: "done", deal_status: "open", duration_seconds: 1938, created_at: "2026-03-14T14:00:00Z", tags: [MOCK_TAGS[3], MOCK_TAGS[8]], overall_sentiment: "0.78", owner: "Jordan Reyes" },
  { id: "call-003", title: "Pricing — Cobalt Industries", client_id: "c3", client_name: "Cobalt Industries", status: "done", deal_status: "at-risk", duration_seconds: 1442, created_at: "2026-03-14T10:00:00Z", tags: [MOCK_TAGS[4], MOCK_TAGS[1]], overall_sentiment: "0.31", owner: "Maya Chen" },
  { id: "call-004", title: "Renewal — Sundial CRM", client_id: "c4", client_name: "Sundial CRM", status: "done", deal_status: "open", duration_seconds: 1125, created_at: "2026-03-13T09:00:00Z", tags: [MOCK_TAGS[5]], overall_sentiment: "0.55", owner: "Eli Kane" },
  { id: "call-005", title: "Discovery — Atlas Freight", client_id: "c5", client_name: "Atlas Freight", status: "done", deal_status: "lost", duration_seconds: 731, created_at: "2026-03-13T15:00:00Z", tags: [MOCK_TAGS[0], MOCK_TAGS[11]], overall_sentiment: "-0.15", owner: "Jordan Reyes" },
  { id: "call-006", title: "Technical Q&A — Polaris Health", client_id: "c6", client_name: "Polaris Health", status: "done", deal_status: "open", duration_seconds: 2483, created_at: "2026-03-12T13:00:00Z", tags: [MOCK_TAGS[3], MOCK_TAGS[9]], overall_sentiment: "0.41", owner: "Maya Chen" },
  { id: "call-007", title: "Closing — Veridian Capital", client_id: "c7", client_name: "Veridian Capital", status: "done", deal_status: "won", duration_seconds: 848, created_at: "2026-03-12T11:00:00Z", tags: [MOCK_TAGS[6], MOCK_TAGS[10]], overall_sentiment: "0.84", owner: "Eli Kane" },
  { id: "call-008", title: "Discovery — Meridian SaaS", client_id: "c8", client_name: "Meridian SaaS", status: "done", deal_status: "open", duration_seconds: 1350, created_at: "2026-03-11T10:00:00Z", tags: [MOCK_TAGS[0], MOCK_TAGS[8]], overall_sentiment: "0.49", owner: "Jordan Reyes" },
  { id: "call-009", title: "Follow-up — Northwind Logistics", client_id: "c1", client_name: "Northwind Logistics", status: "done", deal_status: "open", duration_seconds: 594, created_at: "2026-03-10T14:00:00Z", tags: [MOCK_TAGS[7], MOCK_TAGS[1]], overall_sentiment: "0.58", owner: "Maya Chen" },
  { id: "call-010", title: "Demo — Lumen Analytics", client_id: "c9", client_name: "Lumen Analytics", status: "done", deal_status: "open", duration_seconds: 1721, created_at: "2026-03-10T11:00:00Z", tags: [MOCK_TAGS[3], MOCK_TAGS[2]], overall_sentiment: "0.66", owner: "Jordan Reyes" },
  { id: "call-011", title: "Pricing — Cobalt Industries (2)", client_id: "c3", client_name: "Cobalt Industries", status: "done", deal_status: "at-risk", duration_seconds: 1173, created_at: "2026-03-09T09:00:00Z", tags: [MOCK_TAGS[4]], overall_sentiment: "0.22", owner: "Maya Chen" },
  { id: "call-012", title: "Discovery — Brightline Tools", client_id: "c10", client_name: "Brightline Tools", status: "done", deal_status: "open", duration_seconds: 707, created_at: "2026-03-08T10:00:00Z", tags: [MOCK_TAGS[0], MOCK_TAGS[11]], overall_sentiment: "0.71", owner: "Eli Kane" },
];

export const MOCK_CLIENTS: Client[] = [
  { id: "c1", name: "Northwind Logistics", industry: "Logistics", owner: "Maya Chen", calls: 4, last_call: "2026-03-15T11:30:00Z", sentiment: "0.62", health: "on-track", arr: 56640 },
  { id: "c2", name: "Helix Robotics", industry: "Robotics", owner: "Jordan Reyes", calls: 3, last_call: "2026-03-14T14:00:00Z", sentiment: "0.78", health: "on-track", arr: 28400 },
  { id: "c3", name: "Cobalt Industries", industry: "Manufacturing", owner: "Maya Chen", calls: 6, last_call: "2026-03-14T10:00:00Z", sentiment: "0.27", health: "at-risk", arr: 112000 },
  { id: "c4", name: "Sundial CRM", industry: "Software", owner: "Eli Kane", calls: 2, last_call: "2026-03-13T09:00:00Z", sentiment: "0.55", health: "on-track", arr: 24000 },
  { id: "c5", name: "Atlas Freight", industry: "Logistics", owner: "Jordan Reyes", calls: 1, last_call: "2026-03-13T15:00:00Z", sentiment: "-0.15", health: "lost", arr: 0 },
  { id: "c6", name: "Polaris Health", industry: "Healthcare", owner: "Maya Chen", calls: 5, last_call: "2026-03-12T13:00:00Z", sentiment: "0.41", health: "on-track", arr: 74500 },
  { id: "c7", name: "Veridian Capital", industry: "Finance", owner: "Eli Kane", calls: 4, last_call: "2026-03-12T11:00:00Z", sentiment: "0.84", health: "won", arr: 42000 },
  { id: "c8", name: "Meridian SaaS", industry: "Software", owner: "Jordan Reyes", calls: 2, last_call: "2026-03-11T10:00:00Z", sentiment: "0.49", health: "on-track", arr: 36000 },
  { id: "c9", name: "Lumen Analytics", industry: "Analytics", owner: "Jordan Reyes", calls: 3, last_call: "2026-03-10T11:00:00Z", sentiment: "0.66", health: "on-track", arr: 18200 },
  { id: "c10", name: "Brightline Tools", industry: "Tools", owner: "Eli Kane", calls: 1, last_call: "2026-03-08T10:00:00Z", sentiment: "0.71", health: "on-track", arr: 6800 },
];

const MOCK_PARTICIPANTS: Participant[] = [
  { name: "Maya Chen", role: "AE · Altur", initials: "MC", side: "rep", color: "#10b981" },
  { name: "Daniel Park", role: "VP Sales · Northwind", initials: "DP", side: "client", color: "#22d3ee" },
  { name: "Priya Shah", role: "RevOps · Northwind", initials: "PS", side: "client", color: "#a78bfa" },
];

const MOCK_SEGMENTS: TranscriptSegment[] = [
  { id: "seg-0", idx: 0, start_seconds: 4, end_seconds: 17, speaker_label: "Maya Chen", speaker_role: "AE · Altur", text: "Hey Daniel, thanks for making time today. I know you've been evaluating a few tools — I'd love to start by hearing where things stand on your end.", mood: "positive" },
  { id: "seg-1", idx: 1, start_seconds: 18, end_seconds: 38, speaker_label: "Daniel Park", speaker_role: "VP Sales · Northwind", text: "Sure. So we've grown from 12 to 38 reps in the last year. Our current setup — Gong plus a homegrown spreadsheet — is buckling. Coaching is the biggest gap.", mood: "neutral" },
  { id: "seg-2", idx: 2, start_seconds: 39, end_seconds: 61, speaker_label: "Daniel Park", speaker_role: "VP Sales · Northwind", text: "Honestly, my managers spend four hours a week scrubbing through call recordings. By the time they surface anything actionable, the deal is already cold.", mood: "frustrated" },
  { id: "seg-3", idx: 3, start_seconds: 62, end_seconds: 83, speaker_label: "Maya Chen", speaker_role: "AE · Altur", text: "That's exactly the pattern we hear. Altur surfaces coachable moments automatically — objection handling, talk ratios, sentiment dips — so managers spend minutes, not hours.", mood: "positive" },
  { id: "seg-4", idx: 4, start_seconds: 84, end_seconds: 100, speaker_label: "Daniel Park", speaker_role: "VP Sales · Northwind", text: "Okay, but what about Spanish-language calls? Roughly a third of our pipeline is LATAM. Gong's transcription quality there has been… rough.", mood: "hesitant" },
  { id: "seg-5", idx: 5, start_seconds: 101, end_seconds: 122, speaker_label: "Maya Chen", speaker_role: "AE · Altur", text: "We support Spanish, Portuguese and English natively with the same accuracy. I'll send a benchmark deck after this call — it's one of our differentiators.", mood: "positive" },
  { id: "seg-6", idx: 6, start_seconds: 123, end_seconds: 137, speaker_label: "Priya Shah", speaker_role: "RevOps · Northwind", text: "That alone would save us a big headache. Does it integrate with HubSpot? We log every call there.", mood: "excited" },
  { id: "seg-7", idx: 7, start_seconds: 138, end_seconds: 159, speaker_label: "Maya Chen", speaker_role: "AE · Altur", text: "Native HubSpot two-way sync — calls, summaries, action items, and deal-stage signals all flow back automatically. Salesforce too if you need it down the line.", mood: "positive" },
  { id: "seg-8", idx: 8, start_seconds: 160, end_seconds: 174, speaker_label: "Daniel Park", speaker_role: "VP Sales · Northwind", text: "Wait — when you say 'deal-stage signals,' what does that actually mean? Are you predicting deal health?", mood: "confused" },
  { id: "seg-9", idx: 9, start_seconds: 175, end_seconds: 201, speaker_label: "Maya Chen", speaker_role: "AE · Altur", text: "Good question. We score every call on momentum — stalls, objections, buying signals. Deals trending negative get flagged so your managers can intervene before close-of-quarter surprises.", mood: "neutral" },
];

const MOCK_INSIGHTS: Insight[] = [
  { id: "ins-1", kind: "buying-signal", text: "Asked about pricing within 4 minutes — strong intent signal.", segment_idx: 11, weight: 0.9 },
  { id: "ins-2", kind: "objection", text: "Security/data residency is the gating concern. Pre-empt with packet.", segment_idx: 8, weight: 0.85 },
  { id: "ins-3", kind: "risk", text: "CTO not on call — second meeting required before close.", segment_idx: 8, weight: 0.8 },
];

const MOCK_PAIN_POINTS: Insight[] = [
  { id: "pp-1", kind: "pain-point", text: "Managers spending 4 hrs/week scrubbing call recordings", segment_idx: 2, weight: 0.9 },
  { id: "pp-2", kind: "pain-point", text: "Multilingual transcription quality on Spanish calls is poor", segment_idx: 4, weight: 0.85 },
];

const MOCK_ACTION_ITEMS: ActionItem[] = [
  { id: "ai-1", text: "Send custom proposal locking $79/seat through 60 seats", owner: "Maya", due_date: "2026-03-16", done: false },
  { id: "ai-2", text: "Spin up 14-day pilot for 3 Northwind reps", owner: "Maya", due_date: "2026-03-15", done: true },
  { id: "ai-3", text: "Reconvene with proposal & pilot results", owner: "Both", due_date: "2026-03-22", done: false },
];

const MOCK_ANALYSIS: Analysis = {
  summary: "Discovery call with Northwind Logistics (38 → 60 reps). Daniel and Priya are evaluating Altur to replace Gong. Primary pain is manager coaching velocity and weak Spanish transcription. Main blocker before purchase: security review with their CTO.",
  headline: "Strong discovery — CTO security review is the only gate",
  overall_sentiment: "0.62",
  talk_ratio: { rep: 42, client: 58 },
  llm_model_used: "gpt-4o-mini",
  prompt_version: "v1",
  cost_usd_total: 0.012,
  cost_usd_breakdown: { stt: 0.005, mood: 0.001, tags: 0.001, insights: 0.003, synthesis: 0.002 },
};

export const MOCK_CALL_DETAIL: CallDetail = {
  id: "call-001",
  title: "Discovery — Northwind × Altur",
  client_id: "c1",
  client_name: "Northwind Logistics",
  status: "done",
  deal_status: "open",
  duration_seconds: 334,
  created_at: "2026-03-15T11:30:00Z",
  tags: [MOCK_TAGS[0], MOCK_TAGS[1], MOCK_TAGS[2]],
  overall_sentiment: "0.62",
  owner: "Maya Chen",
  filename: "northwind-discovery-mar15.mp3",
  size_bytes: 8808038,
  language: "English",
  segments: MOCK_SEGMENTS,
  insights: MOCK_INSIGHTS,
  action_items: MOCK_ACTION_ITEMS,
  analysis: MOCK_ANALYSIS,
  participants: MOCK_PARTICIPANTS,
  pain_points: MOCK_PAIN_POINTS,
  objections: [{ id: "obj-1", kind: "objection", text: "Security review required with CTO before signing", segment_idx: 8, weight: 0.85 }],
  buying_signals: [{ id: "bs-1", kind: "buying-signal", text: "Requested sandbox/pilot environment", segment_idx: 6, weight: 0.75 }],
  next_steps: [{ id: "ns-1", kind: "next-step", text: "Reconvene Tuesday with proposal and pilot results", segment_idx: 9, weight: 1.0 }],
  emotion_distribution: { positive: 38, excited: 14, neutral: 22, hesitant: 16, confused: 5, frustrated: 5, negative: 0 },
  emotion_timeline: ["positive", "neutral", "frustrated", "positive", "hesitant", "positive", "excited", "positive", "confused", "neutral"],
};

export const MOCK_DASHBOARD: DashboardOut = {
  kpis: [
    { label: "Calls this week", value: "47", delta: 12, positive: true, spark: [12, 14, 11, 18, 16, 21, 19] },
    { label: "Avg sentiment", value: "+0.54", delta: 8, positive: true, spark: [41, 43, 49, 46, 52, 55, 54] },
    { label: "Conversion rate", value: "32.4%", delta: 2, positive: true, spark: [27, 28, 30, 29, 31, 33, 32] },
    { label: "Talk : Listen", value: "46 / 54", delta: -2, positive: true, spark: [52, 51, 50, 49, 48, 47, 46] },
  ],
  sentiment_trend: [
    { week: "W1", score: 0.31 }, { week: "W2", score: 0.34 }, { week: "W3", score: 0.39 },
    { week: "W4", score: 0.36 }, { week: "W5", score: 0.42 }, { week: "W6", score: 0.45 },
    { week: "W7", score: 0.48 }, { week: "W8", score: 0.46 }, { week: "W9", score: 0.51 },
    { week: "W10", score: 0.49 }, { week: "W11", score: 0.53 }, { week: "W12", score: 0.54 },
  ],
  calls_per_day: [
    { date: "Mar 1", count: 3 }, { date: "Mar 4", count: 7 }, { date: "Mar 7", count: 5 },
    { date: "Mar 10", count: 11 }, { date: "Mar 11", count: 8 }, { date: "Mar 12", count: 12 },
    { date: "Mar 13", count: 10 }, { date: "Mar 14", count: 14 },
  ],
  pipeline: [
    { label: "Prospecting", count: 32, pct: 18 },
    { label: "Qualified", count: 28, pct: 23 },
    { label: "Proposal Sent", count: 19, pct: 34 },
    { label: "In Negotiation", count: 9, pct: 21 },
    { label: "Closed — Won", count: 14, pct: 16 },
  ],
  top_pain_points: [
    { text: "Manager coaching velocity", count: 18, weight: 18 },
    { text: "Forecast accuracy", count: 14, weight: 14 },
    { text: "Multilingual transcription quality", count: 11, weight: 11 },
    { text: "CRM data hygiene", count: 9, weight: 9 },
  ],
  top_performers: [
    { name: "Maya Chen", calls: 18, sentiment: 0.71 },
    { name: "Jordan Reyes", calls: 14, sentiment: 0.59 },
    { name: "Eli Kane", calls: 11, sentiment: 0.66 },
  ],
  recent_calls: MOCK_CALLS.slice(0, 5),
};

export const MOCK_EMOTIONS: EmotionsMap = {
  positive: { label: "Positive", color: "#10b981", dot: "#10b981" },
  excited: { label: "Excited", color: "#22d3ee", dot: "#22d3ee" },
  neutral: { label: "Neutral", color: "#6b7280", dot: "#9ca3af" },
  hesitant: { label: "Hesitant", color: "#f59e0b", dot: "#f59e0b" },
  confused: { label: "Confused", color: "#a78bfa", dot: "#a78bfa" },
  frustrated: { label: "Frustrated", color: "#f43f5e", dot: "#f43f5e" },
  negative: { label: "Negative", color: "#ef4444", dot: "#ef4444" },
};
