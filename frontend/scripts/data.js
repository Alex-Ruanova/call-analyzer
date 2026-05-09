// Sample data for Altur — sales call intelligence

const EMOTIONS = {
  positive:   { label: 'Positive',   color: '#10b981', dot: '#10b981' },
  excited:    { label: 'Excited',    color: '#22d3ee', dot: '#22d3ee' },
  neutral:    { label: 'Neutral',    color: '#6b7280', dot: '#9ca3af' },
  hesitant:   { label: 'Hesitant',   color: '#f59e0b', dot: '#f59e0b' },
  confused:   { label: 'Confused',   color: '#a78bfa', dot: '#a78bfa' },
  frustrated: { label: 'Frustrated', color: '#f43f5e', dot: '#f43f5e' },
  negative:   { label: 'Negative',   color: '#ef4444', dot: '#ef4444' },
};

// highlight tags attach to specific transcript turns; clicking jumps to that line.
const HIGHLIGHT_TYPES = {
  'pain-point':    { label: 'Pain point',    color: '#f59e0b' },
  'objection':     { label: 'Objection',     color: '#f43f5e' },
  'buying-signal': { label: 'Buying signal', color: '#10b981' },
  'feature-req':   { label: 'Feature req',   color: '#22d3ee' },
  'competitor':    { label: 'Competitor',    color: '#a78bfa' },
  'pricing':       { label: 'Pricing',       color: '#eab308' },
  'next-step':     { label: 'Next step',     color: '#60a5fa' },
  'quote':         { label: 'Quote',         color: '#ec4899' },
};

const SAMPLE_TRANSCRIPT = [
  { t: '00:04', s: 'rep',    name: 'Maya Chen',     role: 'AE · Altur',          emo: 'positive',   text: "Hey Daniel, thanks for making time today. I know you've been evaluating a few tools — I'd love to start by hearing where things stand on your end." },
  { t: '00:18', s: 'client', name: 'Daniel Park',   role: 'VP Sales · Northwind', emo: 'neutral',    text: "Sure. So we've grown from 12 to 38 reps in the last year. Our current setup — Gong plus a homegrown spreadsheet — is buckling. Coaching is the biggest gap.", tags: ['competitor', 'pain-point'] },
  { t: '00:39', s: 'client', name: 'Daniel Park',   role: 'VP Sales · Northwind', emo: 'frustrated', text: "Honestly, my managers spend four hours a week scrubbing through call recordings. By the time they surface anything actionable, the deal is already cold.", tags: ['pain-point', 'quote'] },
  { t: '01:02', s: 'rep',    name: 'Maya Chen',     role: 'AE · Altur',          emo: 'positive',   text: "That's exactly the pattern we hear. Altur surfaces coachable moments automatically — objection handling, talk ratios, sentiment dips — so managers spend minutes, not hours." },
  { t: '01:24', s: 'client', name: 'Daniel Park',   role: 'VP Sales · Northwind', emo: 'hesitant',   text: "Okay, but what about Spanish-language calls? Roughly a third of our pipeline is LATAM. Gong's transcription quality there has been… rough.", tags: ['objection', 'competitor'] },
  { t: '01:41', s: 'rep',    name: 'Maya Chen',     role: 'AE · Altur',          emo: 'positive',   text: "We support Spanish, Portuguese and English natively with the same accuracy. I'll send a benchmark deck after this call — it's one of our differentiators." },
  { t: '02:03', s: 'client', name: 'Priya Shah',    role: 'RevOps · Northwind',   emo: 'excited',    text: "That alone would save us a big headache. Does it integrate with HubSpot? We log every call there.", tags: ['feature-req', 'buying-signal'] },
  { t: '02:18', s: 'rep',    name: 'Maya Chen',     role: 'AE · Altur',          emo: 'positive',   text: "Native HubSpot two-way sync — calls, summaries, action items, and deal-stage signals all flow back automatically. Salesforce too if you need it down the line." },
  { t: '02:40', s: 'client', name: 'Daniel Park',   role: 'VP Sales · Northwind', emo: 'confused',   text: "Wait — when you say 'deal-stage signals,' what does that actually mean? Are you predicting deal health?" },
  { t: '02:55', s: 'rep',    name: 'Maya Chen',     role: 'AE · Altur',          emo: 'neutral',    text: "Good question. We score every call on momentum — stalls, objections, buying signals. Deals trending negative get flagged so your managers can intervene before close-of-quarter surprises." },
  { t: '03:22', s: 'client', name: 'Priya Shah',    role: 'RevOps · Northwind',   emo: 'excited',    text: "That's the dream. Our forecast accuracy has been all over the place. If this is real, that's a huge unlock.", tags: ['quote', 'buying-signal'] },
  { t: '03:38', s: 'client', name: 'Daniel Park',   role: 'VP Sales · Northwind', emo: 'hesitant',   text: "What's pricing look like? We're at 38 seats, growing to maybe 60 by end of year.", tags: ['pricing', 'buying-signal'] },
  { t: '03:52', s: 'rep',    name: 'Maya Chen',     role: 'AE · Altur',          emo: 'positive',   text: "For your size we'd start at the Growth tier — $79 per seat per month, billed annually. I can put together a custom proposal that locks pricing as you scale through 60.", tags: ['pricing'] },
  { t: '04:14', s: 'client', name: 'Daniel Park',   role: 'VP Sales · Northwind', emo: 'neutral',    text: "Send the proposal. I want to loop in our CTO on security — we're SOC 2 audited and need to confirm data residency before I can sign anything.", tags: ['objection', 'next-step'] },
  { t: '04:31', s: 'rep',    name: 'Maya Chen',     role: 'AE · Altur',          emo: 'positive',   text: "Absolutely. We're SOC 2 Type II, GDPR, and we offer EU and US data residency. I'll include our security packet with the proposal." },
  { t: '04:48', s: 'client', name: 'Priya Shah',    role: 'RevOps · Northwind',   emo: 'positive',   text: "Perfect. Can we get a sandbox to test with three reps before we commit?", tags: ['feature-req', 'buying-signal'] },
  { t: '05:02', s: 'rep',    name: 'Maya Chen',     role: 'AE · Altur',          emo: 'positive',   text: "Yes — 14-day pilot, white-glove setup, no credit card. I'll spin one up today and send credentials by EOD." },
  { t: '05:18', s: 'client', name: 'Daniel Park',   role: 'VP Sales · Northwind', emo: 'positive',   text: "Great. Let's reconvene next Tuesday with the proposal and pilot results. Thanks Maya.", tags: ['next-step'] },
];

const SAMPLE_CALL = {
  id: 'call-001',
  title: 'Discovery — Northwind × Altur',
  client: 'Northwind Logistics',
  tags: ['Discovery', 'Enterprise', 'LATAM'],
  date: 'Mar 15, 2026',
  time: '11:30 AM',
  duration: '5:34',
  filename: 'northwind-discovery-mar15.mp3',
  size: '8.4 MB',
  format: 'MP3 · 128 kbps',
  language: 'English',
  participants: [
    { name: 'Maya Chen',   role: 'AE · Altur',           initials: 'MC', side: 'rep',    color: '#10b981' },
    { name: 'Daniel Park', role: 'VP Sales · Northwind', initials: 'DP', side: 'client', color: '#22d3ee' },
    { name: 'Priya Shah',  role: 'RevOps · Northwind',   initials: 'PS', side: 'client', color: '#a78bfa' },
  ],
  talkRatio: { rep: 42, client: 58 },
  overallSentiment: 0.62, // -1..1
  summary: "Discovery call with Northwind Logistics (38 → 60 reps). Daniel and Priya are evaluating Altur to replace Gong + spreadsheets. Their primary pain is manager coaching velocity and weak Spanish transcription. They were excited about HubSpot sync and deal-health scoring. Main blockers before purchase: security review with their CTO and a 14-day pilot.",
  actionItems: [
    { text: 'Send custom proposal locking $79/seat through 60 seats',  owner: 'Maya',  due: 'Mar 16',  done: false },
    { text: 'Include SOC 2 Type II + EU data residency packet',         owner: 'Maya',  due: 'Mar 16',  done: false },
    { text: 'Spin up 14-day pilot for 3 Northwind reps',                owner: 'Maya',  due: 'Mar 15',  done: true  },
    { text: 'Loop in Northwind CTO for security review',                owner: 'Daniel', due: 'Mar 18', done: false },
    { text: 'Reconvene with proposal & pilot results',                  owner: 'Both',   due: 'Mar 22', done: false },
  ],
  painPoints: [
    'Managers spending 4 hrs/week scrubbing call recordings',
    'Forecast accuracy is inconsistent quarter-over-quarter',
    'Existing transcription quality on Spanish calls is poor',
    'Coaching is reactive — actionable feedback arrives after deals cool',
  ],
  needs: [
    'Automated coachable-moment detection',
    'Native multilingual transcription (Spanish, Portuguese)',
    'Deal-momentum scoring for pipeline confidence',
    'Two-way HubSpot integration with deal-stage signals',
  ],
  featureRequests: [
    'HubSpot two-way sync (must-have)',
    'Salesforce roadmap (nice-to-have, future)',
    'Sandbox / pilot environment for 3 seats',
  ],
  opportunities: [
    'Expand from 38 → 60 seats by year-end',
    'LATAM pipeline coverage — Spanish accuracy is a wedge',
    'Forecasting use-case opens conversation with their CFO',
  ],
  insights: [
    { kind: 'buying-signal', text: 'Asked about pricing within 4 minutes — strong intent signal.', jumpTo: 11 },
    { kind: 'objection',     text: 'Security/data residency is the gating concern. Pre-empt with packet.', jumpTo: 13 },
    { kind: 'risk',          text: 'CTO not on call — second meeting required before close.', jumpTo: 13 },
    { kind: 'highlight',     text: '"That\u2019s the dream" — Priya, on deal-health forecasting.', jumpTo: 10 },
  ],
  emotionDistribution: {
    positive: 38, excited: 14, neutral: 22, hesitant: 16, confused: 5, frustrated: 5, negative: 0,
  },
  emotionTimeline: [
    // 36 segments across the call duration, one per ~10s
    'positive','positive','neutral','neutral','frustrated','frustrated','frustrated','positive','positive',
    'positive','hesitant','hesitant','positive','positive','excited','excited','positive','positive',
    'confused','confused','neutral','neutral','excited','excited','excited','hesitant','hesitant',
    'positive','positive','neutral','neutral','positive','positive','positive','positive','positive',
  ],
  comments: [
    { when: 'Yesterday, 4:12 pm', text: 'Nice handle on the Spanish objection. Worth turning into an enablement clip.' },
    { when: 'Yesterday, 3:48 pm', text: 'Daniel\u2019s "managers spend 4 hours" line is gold for the case study.' },
  ],
};

const CALLS = [
  { id: 'call-001', title: 'Discovery — Northwind × Altur',       client: 'Northwind Logistics', date: 'Mar 15', duration: '5:34', sentiment: 0.62, stage: 'Discovery',     tags: ['Discovery','Enterprise','LATAM'], owner: 'Maya Chen',    deal: '$56,640', status: 'open' },
  { id: 'call-002', title: 'Demo — Helix Robotics',                client: 'Helix Robotics',      date: 'Mar 14', duration: '32:18', sentiment: 0.78, stage: 'Demo',         tags: ['Demo','Mid-Market'],              owner: 'Jordan Reyes', deal: '$28,400', status: 'open' },
  { id: 'call-003', title: 'Pricing — Cobalt Industries',          client: 'Cobalt Industries',   date: 'Mar 14', duration: '24:02', sentiment: 0.31, stage: 'Negotiation',  tags: ['Pricing','Enterprise'],           owner: 'Maya Chen',    deal: '$112,000',status: 'at-risk' },
  { id: 'call-004', title: 'Renewal — Sundial CRM',                client: 'Sundial CRM',         date: 'Mar 13', duration: '18:45', sentiment: 0.55, stage: 'Renewal',      tags: ['Renewal'],                        owner: 'Eli Kane',     deal: '$24,000', status: 'open' },
  { id: 'call-005', title: 'Discovery — Atlas Freight',            client: 'Atlas Freight',       date: 'Mar 13', duration: '12:11', sentiment: -0.15, stage: 'Discovery',    tags: ['Discovery','SMB'],                owner: 'Jordan Reyes', deal: '$8,400',  status: 'lost' },
  { id: 'call-006', title: 'Technical Q&A — Polaris Health',       client: 'Polaris Health',      date: 'Mar 12', duration: '41:23', sentiment: 0.41, stage: 'Demo',         tags: ['Demo','Healthcare'],              owner: 'Maya Chen',    deal: '$74,500', status: 'open' },
  { id: 'call-007', title: 'Closing — Veridian Capital',           client: 'Veridian Capital',    date: 'Mar 12', duration: '14:08', sentiment: 0.84, stage: 'Closed Won',   tags: ['Closing','Finance'],              owner: 'Eli Kane',     deal: '$42,000', status: 'won' },
  { id: 'call-008', title: 'Discovery — Meridian SaaS',            client: 'Meridian SaaS',       date: 'Mar 11', duration: '22:30', sentiment: 0.49, stage: 'Discovery',    tags: ['Discovery','Mid-Market'],         owner: 'Jordan Reyes', deal: '$36,000', status: 'open' },
  { id: 'call-009', title: 'Follow-up — Northwind Logistics',      client: 'Northwind Logistics', date: 'Mar 10', duration: '9:54',  sentiment: 0.58, stage: 'Discovery',    tags: ['Follow-up','Enterprise'],         owner: 'Maya Chen',    deal: '$56,640', status: 'open' },
  { id: 'call-010', title: 'Demo — Lumen Analytics',               client: 'Lumen Analytics',     date: 'Mar 10', duration: '28:41', sentiment: 0.66, stage: 'Demo',         tags: ['Demo','LATAM'],                   owner: 'Jordan Reyes', deal: '$18,200', status: 'open' },
  { id: 'call-011', title: 'Pricing — Cobalt Industries',          client: 'Cobalt Industries',   date: 'Mar 09', duration: '19:33', sentiment: 0.22, stage: 'Negotiation',  tags: ['Pricing'],                        owner: 'Maya Chen',    deal: '$112,000',status: 'at-risk' },
  { id: 'call-012', title: 'Discovery — Brightline Tools',         client: 'Brightline Tools',    date: 'Mar 08', duration: '11:47', sentiment: 0.71, stage: 'Discovery',    tags: ['Discovery','SMB'],                owner: 'Eli Kane',     deal: '$6,800',  status: 'open' },
];

const TAG_COLORS = {
  'Discovery': '#22d3ee',
  'Demo': '#10b981',
  'Pricing': '#f59e0b',
  'Renewal': '#a78bfa',
  'Closing': '#a3e635',
  'Follow-up': '#64748b',
  'Enterprise': '#6366f1',
  'Mid-Market': '#14b8a6',
  'SMB': '#94a3b8',
  'LATAM': '#ec4899',
  'Healthcare': '#0ea5e9',
  'Finance': '#eab308',
};
function tagColor(tag) {
  if (TAG_COLORS[tag]) return TAG_COLORS[tag];
  // stable hash → hue
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 65% 60%)`;
}
const ALL_TAGS = ['Discovery','Demo','Pricing','Renewal','Closing','Follow-up','Enterprise','Mid-Market','SMB','LATAM','Healthcare','Finance'];

const CLIENTS = [
  { id: 'c1', name: 'Northwind Logistics', industry: 'Logistics',     calls: 4, lastCall: 'Mar 15', sentiment: 0.62, stage: 'Discovery',    arr: '$56,640', owner: 'Maya Chen',    health: 'on-track' },
  { id: 'c2', name: 'Helix Robotics',      industry: 'Robotics',      calls: 3, lastCall: 'Mar 14', sentiment: 0.78, stage: 'Demo',         arr: '$28,400', owner: 'Jordan Reyes', health: 'on-track' },
  { id: 'c3', name: 'Cobalt Industries',   industry: 'Manufacturing', calls: 6, lastCall: 'Mar 14', sentiment: 0.27, stage: 'Negotiation',  arr: '$112,000',owner: 'Maya Chen',    health: 'at-risk'  },
  { id: 'c4', name: 'Sundial CRM',         industry: 'Software',      calls: 2, lastCall: 'Mar 13', sentiment: 0.55, stage: 'Renewal',      arr: '$24,000', owner: 'Eli Kane',     health: 'on-track' },
  { id: 'c5', name: 'Atlas Freight',       industry: 'Logistics',     calls: 1, lastCall: 'Mar 13', sentiment: -0.15,stage: 'Closed Lost',  arr: '$0',      owner: 'Jordan Reyes', health: 'lost'     },
  { id: 'c6', name: 'Polaris Health',      industry: 'Healthcare',    calls: 5, lastCall: 'Mar 12', sentiment: 0.41, stage: 'Demo',         arr: '$74,500', owner: 'Maya Chen',    health: 'on-track' },
  { id: 'c7', name: 'Veridian Capital',    industry: 'Finance',       calls: 4, lastCall: 'Mar 12', sentiment: 0.84, stage: 'Closed Won',   arr: '$42,000', owner: 'Eli Kane',     health: 'won'      },
  { id: 'c8', name: 'Meridian SaaS',       industry: 'Software',      calls: 2, lastCall: 'Mar 11', sentiment: 0.49, stage: 'Discovery',    arr: '$36,000', owner: 'Jordan Reyes', health: 'on-track' },
  { id: 'c9', name: 'Lumen Analytics',     industry: 'Analytics',     calls: 3, lastCall: 'Mar 10', sentiment: 0.66, stage: 'Demo',         arr: '$18,200', owner: 'Jordan Reyes', health: 'on-track' },
  { id: 'c10',name: 'Brightline Tools',    industry: 'Tools',         calls: 1, lastCall: 'Mar 08', sentiment: 0.71, stage: 'Discovery',    arr: '$6,800',  owner: 'Eli Kane',     health: 'on-track' },
];

const DASHBOARD = {
  kpis: [
    { label: 'Calls this week',   value: '47',     delta: '+12',  positive: true,  spark: [12,14,11,18,16,21,19] },
    { label: 'Avg sentiment',     value: '+0.54',  delta: '+0.08',positive: true,  spark: [0.41,0.43,0.49,0.46,0.52,0.55,0.54] },
    { label: 'Conversion rate',   value: '32.4%',  delta: '+2.1%', positive: true,  spark: [27,28,30,29,31,33,32] },
    { label: 'Talk : Listen',     value: '46 / 54',delta: '\u22122', positive: true,  spark: [52,51,50,49,48,47,46] },
  ],
  // 12 weeks of sentiment trend
  sentimentTrend: [0.31, 0.34, 0.39, 0.36, 0.42, 0.45, 0.48, 0.46, 0.51, 0.49, 0.53, 0.54],
  // calls per day, last 14
  callsPerDay: [3, 5, 4, 7, 6, 8, 5, 9, 7, 11, 8, 12, 10, 14],
  pipeline: [
    { stage: 'Prospecting',   count: 32, value: 184000, color: '#64748b' },
    { stage: 'Qualified',     count: 28, value: 412000, color: '#22d3ee' },
    { stage: 'Proposal Sent', count: 19, value: 612000, color: '#10b981' },
    { stage: 'In Negotiation',count:  9, value: 384000, color: '#f59e0b' },
    { stage: 'Closed — Won',  count: 14, value: 287000, color: '#a3e635' },
    { stage: 'Closed — Lost', count:  6, value: 0,      color: '#6b7280' },
  ],
  topPainPoints: [
    { text: 'Manager coaching velocity',           weight: 18 },
    { text: 'Forecast accuracy',                   weight: 14 },
    { text: 'Multilingual transcription quality',  weight: 11 },
    { text: 'CRM data hygiene',                    weight:  9 },
    { text: 'Onboarding ramp time',                weight:  7 },
    { text: 'Pricing transparency',                weight:  6 },
    { text: 'Reporting flexibility',               weight:  5 },
  ],
  topPerformers: [
    { name: 'Maya Chen',    initials: 'MC', calls: 18, won: '$248k', sentiment: 0.71 },
    { name: 'Jordan Reyes', initials: 'JR', calls: 14, won: '$162k', sentiment: 0.59 },
    { name: 'Eli Kane',     initials: 'EK', calls: 11, won: '$140k', sentiment: 0.66 },
    { name: 'Sara Vega',    initials: 'SV', calls:  9, won: '$92k',  sentiment: 0.52 },
  ],
};

window.ALTUR = { EMOTIONS, HIGHLIGHT_TYPES, SAMPLE_TRANSCRIPT, SAMPLE_CALL, CALLS, CLIENTS, DASHBOARD, ALL_TAGS, TAG_COLORS, tagColor };
