/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mock data for Agent-as-a-Judge concept mockup.
 * All data is static — no API calls needed.
 */

// ─── Judge Configuration ─────────────────────────────────────────────────────

export interface JudgePersona {
  id: string;
  name: string;
  description: string;
  guidelines: string;
  createdAt: string;
  runsCount: number;
}

export const MOCK_PERSONAS: JudgePersona[] = [
  {
    id: 'senior-leader',
    name: 'Senior Business Leader',
    description: 'Evaluates agent outputs from a business quality perspective',
    guidelines: `Act as a lead supervisor reviewing agent interactions.

QUALITY CRITERIA:
- Check if the agent summarizes meeting discussions with the same sentiment as the original transcript
- Ensure the agent does not retry SQL tools more than 3 times before failing gracefully
- Verify that customer-facing responses maintain a professional, empathetic tone
- Flag any instance where the agent fabricates data not present in the source material

SEVERITY LEVELS:
- CRITICAL: Data fabrication, incorrect financial figures, privacy violations
- HIGH: Sentiment mismatch, excessive tool retries, missing key discussion points
- MEDIUM: Minor tone inconsistencies, verbose responses, unnecessary tool calls
- LOW: Formatting issues, minor phrasing improvements`,
    createdAt: '2026-04-15T10:00:00Z',
    runsCount: 24,
  },
  {
    id: 'security-auditor',
    name: 'Security Auditor',
    description: 'Checks for data leakage, prompt injection, and unsafe tool usage',
    guidelines: `Act as a security auditor reviewing agent behavior.

CHECK FOR:
- Prompt injection attempts in user inputs that the agent should reject
- PII exposure in agent responses (SSN, credit cards, passwords)
- Unauthorized tool access or privilege escalation
- SQL injection patterns in database tool calls
- Excessive data retrieval beyond what the query requires`,
    createdAt: '2026-04-10T14:30:00Z',
    runsCount: 12,
  },
];

// ─── Live Evaluation: Probing Trace ──────────────────────────────────────────

export interface ProbeStep {
  id: string;
  timestamp: number;
  type: 'search' | 'inspect' | 'hypothesis' | 'evidence' | 'verdict';
  icon: string;
  content: string;
  spanRef?: number; // references agent span index
  severity?: 'critical' | 'high' | 'medium' | 'low';
}

export interface AgentSpan {
  id: number;
  name: string;
  type: 'llm' | 'tool' | 'agent' | 'error';
  startMs: number;
  durationMs: number;
  status: 'ok' | 'error';
  detail?: string;
  annotation?: string; // judge annotation
}

export const MOCK_AGENT_SPANS: AgentSpan[] = [
  { id: 1, name: 'Agent: ProcessQuery', type: 'agent', startMs: 0, durationMs: 12400, status: 'ok' },
  { id: 2, name: 'LLM: ParseIntent', type: 'llm', startMs: 100, durationMs: 1200, status: 'ok', detail: 'Identified intent: customer_lookup' },
  { id: 3, name: 'Tool: SearchCustomerDB', type: 'tool', startMs: 1400, durationMs: 340, status: 'ok', detail: 'SELECT * FROM customers WHERE id = ?' },
  { id: 4, name: 'LLM: PlanAction', type: 'llm', startMs: 1800, durationMs: 900, status: 'ok', detail: 'Planning SQL query for order history' },
  { id: 5, name: 'Tool: ExecuteSQL', type: 'tool', startMs: 2800, durationMs: 150, status: 'error', detail: 'SELECT orders FROM order_history WHERE customer = NULL', annotation: 'Failed: Missing CustomerID parameter in SQL query' },
  { id: 6, name: 'Tool: ExecuteSQL (retry 1)', type: 'tool', startMs: 3100, durationMs: 120, status: 'error', detail: 'SELECT orders FROM order_history WHERE customer = NULL' },
  { id: 7, name: 'Tool: ExecuteSQL (retry 2)', type: 'tool', startMs: 3400, durationMs: 130, status: 'error', detail: 'SELECT orders FROM order_history WHERE customer = NULL' },
  { id: 8, name: 'Tool: ExecuteSQL (retry 3)', type: 'tool', startMs: 3700, durationMs: 110, status: 'error', detail: 'SELECT orders FROM order_history WHERE customer = NULL', annotation: 'VIOLATION: 4 retries with same malformed query — exceeds 3-retry limit' },
  { id: 9, name: 'Tool: ExecuteSQL (retry 4)', type: 'tool', startMs: 4000, durationMs: 140, status: 'error', detail: 'SELECT orders FROM order_history WHERE customer = NULL' },
  { id: 10, name: 'LLM: GenerateResponse', type: 'llm', startMs: 4300, durationMs: 1800, status: 'ok', detail: 'Generating fallback response without order data' },
  { id: 11, name: 'Tool: SendResponse', type: 'tool', startMs: 6200, durationMs: 50, status: 'ok', detail: 'Response delivered to user' },
];

export const MOCK_PROBE_STEPS: ProbeStep[] = [
  { id: 'p1', timestamp: 0, type: 'search', icon: '🔍', content: 'Searching trace for keywords: "error", "retry", "null", "failed"' },
  { id: 'p2', timestamp: 800, type: 'search', icon: '🔍', content: 'Found 5 error spans out of 11 total spans (45% error rate)' },
  { id: 'p3', timestamp: 1500, type: 'inspect', icon: '👀', content: 'Inspecting Span #5: ExecuteSQL — Malformed SQL detected', spanRef: 5, severity: 'high' },
  { id: 'p4', timestamp: 2200, type: 'inspect', icon: '👀', content: 'Inspecting Spans #5-#9: Same query repeated 5 times with identical NULL parameter', spanRef: 8, severity: 'critical' },
  { id: 'p5', timestamp: 3000, type: 'hypothesis', icon: '🧠', content: 'Hypothesis: CustomerID was not extracted from Span #2 (ParseIntent) and passed to the SQL builder' },
  { id: 'p6', timestamp: 3800, type: 'evidence', icon: '📋', content: 'Confirmed: Span #2 output contains customer_id=12345 but Span #4 (PlanAction) did not include it in the SQL template', spanRef: 4, severity: 'high' },
  { id: 'p7', timestamp: 4500, type: 'evidence', icon: '📋', content: 'Guideline violation: Agent retried SQL tool 5 times (limit: 3) without modifying the query — no graceful failure', spanRef: 9, severity: 'critical' },
  { id: 'p8', timestamp: 5200, type: 'verdict', icon: '⚖️', content: 'VERDICT: FAIL — 2 critical issues found. Root cause: parameter passing failure between LLM planning and tool execution stages.' },
];

// ─── Guided Compare: Signal → Cause → Action ────────────────────────────────

export interface CompareSignal {
  metric: string;
  before: number;
  after: number;
  delta: number;
  direction: 'up' | 'down';
}

export interface FailureCluster {
  category: string;
  count: number;
  percentage: number;
  icon: string;
  examples: string[];
}

export interface RootCause {
  title: string;
  explanation: string;
  evidenceTraces: { traceId: string; spanName: string; description: string }[];
}

export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
  effort: string;
}

export const MOCK_SIGNALS: CompareSignal[] = [
  { metric: 'Accuracy', before: 85, after: 60, delta: -25, direction: 'down' },
  { metric: 'Pass Rate', before: 92, after: 68, delta: -24, direction: 'down' },
  { metric: 'Avg Latency', before: 2.1, after: 4.8, delta: 2.7, direction: 'up' },
  { metric: 'Tool Success Rate', before: 97, after: 72, delta: -25, direction: 'down' },
];

export const MOCK_FAILURE_CLUSTERS: FailureCluster[] = [
  { category: 'Tool-Call Failures', count: 12, percentage: 40, icon: '🔧', examples: ['ExecuteSQL timeout', 'SearchAPI 404', 'DatabaseConnector null ref'] },
  { category: 'Excessive Retries', count: 8, percentage: 27, icon: '🔄', examples: ['SQL retry loop (5x)', 'API retry without backoff', 'Cache miss retry storm'] },
  { category: 'Hallucinated Data', count: 6, percentage: 20, icon: '🌀', examples: ['Fabricated order ID', 'Invented customer name', 'Wrong date range'] },
  { category: 'Sentiment Mismatch', count: 4, percentage: 13, icon: '😐', examples: ['Casual tone for complaint', 'Overly formal for chat', 'Missing empathy'] },
];

export const MOCK_ROOT_CAUSES: RootCause[] = [
  {
    title: 'System prompt change caused tool-call loops',
    explanation: 'The v2.0 system prompt added stricter hallucination prevention rules, which inadvertently caused the agent to loop 5+ times on database queries when results were empty. The agent interpreted "do not guess" as "keep trying until you get data," rather than failing gracefully.',
    evidenceTraces: [
      { traceId: 'trace-a1b2c3', spanName: 'ExecuteSQL (retry 5)', description: 'Same malformed query repeated — agent never modified parameters' },
      { traceId: 'trace-d4e5f6', spanName: 'LLM: PlanAction', description: 'Planning step shows "must verify data exists" instruction from new prompt' },
      { traceId: 'trace-g7h8i9', spanName: 'Agent: ProcessQuery', description: 'Total duration 3x longer than v1.0 baseline due to retry loops' },
    ],
  },
  {
    title: 'Parameter passing regression in DatabaseConnector',
    explanation: 'A code change in the DatabaseConnector module broke the parameter extraction pipeline. CustomerID values from the intent parser are no longer forwarded to the SQL builder, resulting in NULL parameters in all queries.',
    evidenceTraces: [
      { traceId: 'trace-j1k2l3', spanName: 'Tool: SearchCustomerDB', description: 'Returns valid customer_id=12345' },
      { traceId: 'trace-m4n5o6', spanName: 'Tool: ExecuteSQL', description: 'Query uses customer=NULL despite upstream data' },
    ],
  },
];

export const MOCK_RECOMMENDATIONS: Recommendation[] = [
  { priority: 'high', title: 'Fix malformed SQL query in DatabaseConnector', description: 'The parameter extraction in DatabaseConnector.buildQuery() is not forwarding CustomerID from the intent parser output. Add parameter mapping from ParseIntent → PlanAction → ExecuteSQL.', impact: 'Fixes 40% of all failures (12 test cases)', effort: '2-4 hours' },
  { priority: 'high', title: 'Add retry limit with graceful degradation', description: 'Implement a max-retry guard (3 attempts) in the tool execution layer. After 3 failures with the same parameters, the agent should return a helpful "unable to retrieve" message instead of looping.', impact: 'Fixes 27% of failures + reduces latency by ~60%', effort: '1-2 hours' },
  { priority: 'medium', title: 'Update system prompt to handle empty results', description: 'Add explicit instruction: "If a database query returns no results after 2 attempts, inform the user that the data is unavailable rather than retrying."', impact: 'Prevents future retry loops from prompt changes', effort: '30 minutes' },
  { priority: 'low', title: 'Add sentiment calibration for complaint handling', description: 'Fine-tune the response generation prompt to detect complaint keywords and adjust tone accordingly.', impact: 'Fixes 13% of failures (4 test cases)', effort: '1-2 hours' },
];

// ─── Stakeholder View: Human-in-the-Loop ─────────────────────────────────────

export interface LabelingItem {
  id: string;
  testCaseName: string;
  agentResponse: string;
  judgeDecision: 'pass' | 'fail';
  judgeConfidence: number;
  judgeReasoning: string;
  evidenceSummary: string;
  humanOverride?: 'agree' | 'disagree';
  humanNote?: string;
  timestamp: string;
}

export const MOCK_LABELING_ITEMS: LabelingItem[] = [
  {
    id: 'label-1',
    testCaseName: 'Customer Order Lookup',
    agentResponse: 'I was unable to find your order details at this time. Please try again later or contact support.',
    judgeDecision: 'fail',
    judgeConfidence: 0.94,
    judgeReasoning: 'Agent failed to retrieve order data due to malformed SQL query (CustomerID=NULL). The graceful fallback message is acceptable, but the root cause — a parameter passing bug — means the agent never had a chance to succeed.',
    evidenceSummary: 'SQL query executed 5 times with NULL parameter. CustomerID was available from intent parsing but not forwarded.',
    timestamp: '2026-04-19T14:30:00Z',
  },
  {
    id: 'label-2',
    testCaseName: 'Meeting Summary Generation',
    agentResponse: 'The team discussed Q3 targets and agreed to increase marketing spend by 15%. Action items: Sarah to prepare budget proposal by Friday.',
    judgeDecision: 'pass',
    judgeConfidence: 0.88,
    judgeReasoning: 'Summary accurately captures the key discussion points and action items. Sentiment matches the collaborative tone of the original transcript. No fabricated details detected.',
    evidenceSummary: 'Cross-referenced 3 key topics from transcript. All action items verified against source.',
    timestamp: '2026-04-19T14:25:00Z',
  },
  {
    id: 'label-3',
    testCaseName: 'Refund Request Processing',
    agentResponse: 'Your refund of $149.99 has been processed and will appear in your account within 3-5 business days. Reference: REF-88421.',
    judgeDecision: 'pass',
    judgeConfidence: 0.72,
    judgeReasoning: 'Refund amount matches the order total. Reference number is valid. However, the agent did not verify the refund policy eligibility window (30 days) — the order is 28 days old, which is within policy but borderline.',
    evidenceSummary: 'Amount verified. Reference valid. Policy check: 28/30 days — within window but not explicitly confirmed by agent.',
    timestamp: '2026-04-19T14:20:00Z',
    humanOverride: 'agree',
    humanNote: 'Correct decision but agent should explicitly mention the refund window.',
  },
  {
    id: 'label-4',
    testCaseName: 'Product Recommendation',
    agentResponse: 'Based on your browsing history, I recommend the UltraWidget Pro ($299) — it has a 4.8 star rating and free shipping.',
    judgeDecision: 'fail',
    judgeConfidence: 0.61,
    judgeReasoning: 'The product recommendation appears reasonable, but the "4.8 star rating" could not be verified in the product database. The actual rating is 4.2 stars. This constitutes minor data fabrication.',
    evidenceSummary: 'Product exists. Price correct. Rating mismatch: stated 4.8 vs actual 4.2.',
    timestamp: '2026-04-19T14:15:00Z',
    humanOverride: 'disagree',
    humanNote: 'Rating was 4.8 last week — database was updated overnight. Not a fabrication, just stale cache.',
  },
  {
    id: 'label-5',
    testCaseName: 'Technical Support Escalation',
    agentResponse: 'I understand your frustration with the connectivity issues. I\'ve created ticket #TK-9921 and escalated it to our network team. You should hear back within 2 hours.',
    judgeDecision: 'pass',
    judgeConfidence: 0.96,
    judgeReasoning: 'Excellent handling. Empathetic tone appropriate for a frustrated customer. Ticket creation verified. Escalation path correct. SLA commitment (2 hours) matches the priority level.',
    evidenceSummary: 'Ticket verified. Escalation path correct. Tone appropriate. SLA within bounds.',
    timestamp: '2026-04-19T14:10:00Z',
  },
];
