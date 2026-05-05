/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mock data for the Agent Dashboard — the "Interaction Swarm" and
 * "Pathfinder" alert feed.
 *
 * Names reflect what an OpenSearch Root Cause Analysis (RCA) team would
 * actually build and evaluate: log analysts, PPL runners, triage planners,
 * and platform-provided judges that track trajectory, coherence, safety
 * and cost. Concept/mockup only; no backend.
 */

export type AgentKind = 'target' | 'evaluator';

export type TargetRole =
  | 'supervisor'
  | 'log_analyst'
  | 'triage_planner'
  | 'ppl_runner'
  | 'index_navigator'
  | 'hypothesis_reviewer';

export type EvaluatorRole =
  | 'trajectory'
  | 'coherence'
  | 'safety'
  | 'cost';

export interface SwarmAgent {
  id: string;
  label: string;
  kind: AgentKind;
  role: TargetRole | EvaluatorRole;
  /** 0–1 activity level, drives node size & pulse */
  activity: number;
  /** 0–1 health score; used for ring color */
  health: number;
  /** Short descriptor shown on hover / in side panel */
  description: string;
}

export interface SwarmLink {
  id: string;
  source: string;
  target: string;
  /** 0–1 rolling token-volume intensity — drives edge thickness / glow */
  intensity: number;
  /** True when an Evaluator is "watching" a Target — rendered dashed/subtle */
  watch?: boolean;
}

export type AlertSeverity = 'info' | 'warn' | 'critical';

export interface PathfinderAlert {
  id: string;
  ts: number;
  severity: AlertSeverity;
  /** Which Evaluator Agent emitted this */
  source: string;
  /** Which Target Agent it concerns */
  target: string;
  /** Natural language summary */
  summary: string;
}

// --- Target Agents (the Actors an RCA team builds) --------------------------

export const TARGET_AGENTS: SwarmAgent[] = [
  {
    id: 't-supervisor',
    label: 'RCA Supervisor',
    kind: 'target',
    role: 'supervisor',
    activity: 0.9,
    health: 0.82,
    description: 'Top-level incident router; delegates to specialist sub-agents',
  },
  {
    id: 't-log-analyst',
    label: 'Log Analyst',
    kind: 'target',
    role: 'log_analyst',
    activity: 0.78,
    health: 0.55,
    description: 'Summarizes log evidence across indices and service boundaries',
  },
  {
    id: 't-triage-planner',
    label: 'Triage Planner',
    kind: 'target',
    role: 'triage_planner',
    activity: 0.62,
    health: 0.88,
    description: 'Decomposes the incident into ordered diagnostic checks',
  },
  {
    id: 't-ppl-runner',
    label: 'PPL Runner',
    kind: 'target',
    role: 'ppl_runner',
    activity: 0.71,
    health: 0.74,
    description: 'Executes PPL queries and cluster tools (hot threads, node stats)',
  },
  {
    id: 't-index-navigator',
    label: 'Index Navigator',
    kind: 'target',
    role: 'index_navigator',
    activity: 0.55,
    health: 0.91,
    description: 'Vector + keyword retrieval over runbooks and prior incidents',
  },
  {
    id: 't-hypothesis-reviewer',
    label: 'Hypothesis Reviewer',
    kind: 'target',
    role: 'hypothesis_reviewer',
    activity: 0.4,
    health: 0.67,
    description: 'Reviews draft RCAs, flags gaps before the final verdict',
  },
];

// --- Evaluator Agents (Judges provided by the platform) ---------------------

export const EVALUATOR_AGENTS: SwarmAgent[] = [
  {
    id: 'e-trajectory',
    label: 'Trajectory Judge',
    kind: 'evaluator',
    role: 'trajectory',
    activity: 0.85,
    health: 0.95,
    description: 'Detects loops, stalls and deviations from the expected RCA path',
  },
  {
    id: 'e-coherence',
    label: 'Coherence Judge',
    kind: 'evaluator',
    role: 'coherence',
    activity: 0.5,
    health: 0.9,
    description: 'Scores hypothesis consistency and contradiction across turns',
  },
  {
    id: 'e-safety',
    label: 'Safety & Policy Judge',
    kind: 'evaluator',
    role: 'safety',
    activity: 0.3,
    health: 1,
    description: 'Watches for PII leakage, unsafe tool calls and prompt-injection bait',
  },
  {
    id: 'e-cost',
    label: 'Cost & Budget Judge',
    kind: 'evaluator',
    role: 'cost',
    activity: 0.25,
    health: 0.8,
    description: 'Tracks token spend, retry budget and model-escalation anomalies',
  },
];

export const ALL_AGENTS: SwarmAgent[] = [...TARGET_AGENTS, ...EVALUATOR_AGENTS];

// --- Edges -------------------------------------------------------------------

/**
 * Target↔Target communication edges. Intensity is seeded but will be jittered
 * by the page's tick so the swarm feels alive.
 */
export const TARGET_LINKS: SwarmLink[] = [
  { id: 'l1', source: 't-supervisor', target: 't-triage-planner', intensity: 0.9 },
  { id: 'l2', source: 't-supervisor', target: 't-log-analyst', intensity: 0.7 },
  { id: 'l3', source: 't-triage-planner', target: 't-ppl-runner', intensity: 0.8 },
  { id: 'l4', source: 't-log-analyst', target: 't-index-navigator', intensity: 0.85 },
  { id: 'l5', source: 't-ppl-runner', target: 't-index-navigator', intensity: 0.35 },
  { id: 'l6', source: 't-hypothesis-reviewer', target: 't-supervisor', intensity: 0.55 },
  { id: 'l7', source: 't-log-analyst', target: 't-hypothesis-reviewer', intensity: 0.4 },
];

/**
 * Evaluator→Target "watch" edges. Rendered dashed and subtle; these don't
 * carry tokens, they indicate which evaluator monitors which actor.
 */
export const WATCH_LINKS: SwarmLink[] = [
  { id: 'w1', source: 'e-trajectory', target: 't-supervisor', intensity: 0.5, watch: true },
  { id: 'w2', source: 'e-trajectory', target: 't-log-analyst', intensity: 0.6, watch: true },
  { id: 'w3', source: 'e-coherence', target: 't-hypothesis-reviewer', intensity: 0.4, watch: true },
  { id: 'w4', source: 'e-coherence', target: 't-triage-planner', intensity: 0.3, watch: true },
  { id: 'w5', source: 'e-safety', target: 't-ppl-runner', intensity: 0.35, watch: true },
  { id: 'w6', source: 'e-cost', target: 't-supervisor', intensity: 0.25, watch: true },
];

export const ALL_LINKS: SwarmLink[] = [...TARGET_LINKS, ...WATCH_LINKS];

// --- Alert feed --------------------------------------------------------------

const now = Date.now();

export const SEED_ALERTS: PathfinderAlert[] = [
  {
    id: 'a1',
    ts: now - 12_000,
    severity: 'critical',
    source: 'Trajectory Judge',
    target: 'Log Analyst',
    summary:
      'Log Analyst appears stuck in a logic loop — 4 consecutive PPL queries with identical source and filter.',
  },
  {
    id: 'a2',
    ts: now - 42_000,
    severity: 'warn',
    source: 'Coherence Judge',
    target: 'Triage Planner',
    summary:
      'Triage Planner revised the hypothesis mid-run; step 3 now contradicts the original incident scope.',
  },
  {
    id: 'a3',
    ts: now - 95_000,
    severity: 'warn',
    source: 'Cost & Budget Judge',
    target: 'RCA Supervisor',
    summary:
      'Token burn on the current trajectory is 2.4× the trailing 24h median for P2 incidents.',
  },
  {
    id: 'a4',
    ts: now - 160_000,
    severity: 'info',
    source: 'Safety & Policy Judge',
    target: 'PPL Runner',
    summary:
      'PPL Runner invoked `cluster.hot_threads` against a production node — auto-approved under read-only policy.',
  },
  {
    id: 'a5',
    ts: now - 220_000,
    severity: 'info',
    source: 'Trajectory Judge',
    target: 'Hypothesis Reviewer',
    summary:
      'Hypothesis Reviewer skipped review on 2/8 drafts this hour — trajectory still within tolerance.',
  },
];

/** Pool of alerts used to "stream in" new ones over time. */
export const STREAM_ALERT_POOL: Omit<PathfinderAlert, 'id' | 'ts'>[] = [
  {
    severity: 'warn',
    source: 'Trajectory Judge',
    target: 'RCA Supervisor',
    summary: 'RCA Supervisor re-delegated the same subtask to Log Analyst twice in 30s.',
  },
  {
    severity: 'critical',
    source: 'Coherence Judge',
    target: 'Log Analyst',
    summary: 'Log Analyst conclusion conflicts with retrieved log evidence — confidence dropped below 0.4.',
  },
  {
    severity: 'info',
    source: 'Cost & Budget Judge',
    target: 'Triage Planner',
    summary: 'Triage Planner produced a 12-step plan; pruning suggested to stay under retry budget.',
  },
  {
    severity: 'warn',
    source: 'Safety & Policy Judge',
    target: 'PPL Runner',
    summary: 'PPL Runner hit rate-limit ceiling on `_search` endpoint — backoff engaged.',
  },
  {
    severity: 'info',
    source: 'Trajectory Judge',
    target: 'Index Navigator',
    summary: 'Index Navigator latency up 18% vs. last hour — not yet breaching SLO.',
  },
];
