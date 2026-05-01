/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mock data for the Agent Dashboard — the "Interaction Swarm" and
 * "Pathfinder" alert feed. Concept/mockup only; no backend.
 */

export type AgentKind = 'target' | 'evaluator';

export type TargetRole =
  | 'orchestrator'
  | 'researcher'
  | 'planner'
  | 'executor'
  | 'critic'
  | 'retriever';

export type EvaluatorRole =
  | 'pathfinder'
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

// --- Target Agents (the Actors customers build) ------------------------------

export const TARGET_AGENTS: SwarmAgent[] = [
  {
    id: 't-orchestrator',
    label: 'Orchestrator',
    kind: 'target',
    role: 'orchestrator',
    activity: 0.9,
    health: 0.82,
    description: 'Top-level planner routing work to sub-agents',
  },
  {
    id: 't-researcher',
    label: 'Researcher',
    kind: 'target',
    role: 'researcher',
    activity: 0.78,
    health: 0.55,
    description: 'Gathers and summarizes evidence from sources',
  },
  {
    id: 't-planner',
    label: 'Planner',
    kind: 'target',
    role: 'planner',
    activity: 0.62,
    health: 0.88,
    description: 'Decomposes goals into ordered steps',
  },
  {
    id: 't-executor',
    label: 'Executor',
    kind: 'target',
    role: 'executor',
    activity: 0.71,
    health: 0.74,
    description: 'Runs tools and external actions',
  },
  {
    id: 't-retriever',
    label: 'Retriever',
    kind: 'target',
    role: 'retriever',
    activity: 0.55,
    health: 0.91,
    description: 'Vector + keyword retrieval over the knowledge base',
  },
  {
    id: 't-critic',
    label: 'Critic',
    kind: 'target',
    role: 'critic',
    activity: 0.4,
    health: 0.67,
    description: 'Reviews drafts, flags gaps before final answer',
  },
];

// --- Evaluator Agents (the Judges provided by the platform) ------------------

export const EVALUATOR_AGENTS: SwarmAgent[] = [
  {
    id: 'e-pathfinder',
    label: 'Pathfinder',
    kind: 'evaluator',
    role: 'pathfinder',
    activity: 0.85,
    health: 0.95,
    description: 'Detects loops, stalls and trajectory deviations',
  },
  {
    id: 'e-coherence',
    label: 'Coherence',
    kind: 'evaluator',
    role: 'coherence',
    activity: 0.5,
    health: 0.9,
    description: 'Scores logical consistency across turns',
  },
  {
    id: 'e-safety',
    label: 'Safety',
    kind: 'evaluator',
    role: 'safety',
    activity: 0.3,
    health: 1,
    description: 'Watches for policy and tool-use violations',
  },
  {
    id: 'e-cost',
    label: 'Cost',
    kind: 'evaluator',
    role: 'cost',
    activity: 0.25,
    health: 0.8,
    description: 'Tracks token spend and budget anomalies',
  },
];

export const ALL_AGENTS: SwarmAgent[] = [...TARGET_AGENTS, ...EVALUATOR_AGENTS];

// --- Edges -------------------------------------------------------------------

/**
 * Target↔Target communication edges. Intensity is seeded but will be jittered
 * by the page's tick so the swarm feels alive.
 */
export const TARGET_LINKS: SwarmLink[] = [
  { id: 'l1', source: 't-orchestrator', target: 't-planner', intensity: 0.9 },
  { id: 'l2', source: 't-orchestrator', target: 't-researcher', intensity: 0.7 },
  { id: 'l3', source: 't-planner', target: 't-executor', intensity: 0.8 },
  { id: 'l4', source: 't-researcher', target: 't-retriever', intensity: 0.85 },
  { id: 'l5', source: 't-executor', target: 't-retriever', intensity: 0.35 },
  { id: 'l6', source: 't-critic', target: 't-orchestrator', intensity: 0.55 },
  { id: 'l7', source: 't-researcher', target: 't-critic', intensity: 0.4 },
];

/**
 * Evaluator→Target "watch" edges. Rendered dashed and subtle; these don't
 * carry tokens, they indicate which evaluator monitors which actor.
 */
export const WATCH_LINKS: SwarmLink[] = [
  { id: 'w1', source: 'e-pathfinder', target: 't-orchestrator', intensity: 0.5, watch: true },
  { id: 'w2', source: 'e-pathfinder', target: 't-researcher', intensity: 0.6, watch: true },
  { id: 'w3', source: 'e-coherence', target: 't-critic', intensity: 0.4, watch: true },
  { id: 'w4', source: 'e-coherence', target: 't-planner', intensity: 0.3, watch: true },
  { id: 'w5', source: 'e-safety', target: 't-executor', intensity: 0.35, watch: true },
  { id: 'w6', source: 'e-cost', target: 't-orchestrator', intensity: 0.25, watch: true },
];

export const ALL_LINKS: SwarmLink[] = [...TARGET_LINKS, ...WATCH_LINKS];

// --- Alert feed --------------------------------------------------------------

const now = Date.now();

export const SEED_ALERTS: PathfinderAlert[] = [
  {
    id: 'a1',
    ts: now - 12_000,
    severity: 'critical',
    source: 'Pathfinder',
    target: 'Researcher',
    summary:
      'Researcher Agent appears stuck in a logic loop — 4 consecutive retrieval calls with identical query.',
  },
  {
    id: 'a2',
    ts: now - 42_000,
    severity: 'warn',
    source: 'Coherence',
    target: 'Planner',
    summary:
      'Planner revised the goal mid-run; step 3 now contradicts the original acceptance criteria.',
  },
  {
    id: 'a3',
    ts: now - 95_000,
    severity: 'warn',
    source: 'Cost',
    target: 'Orchestrator',
    summary:
      'Token burn on the current trajectory is 2.4× the trailing 24h median for this task type.',
  },
  {
    id: 'a4',
    ts: now - 160_000,
    severity: 'info',
    source: 'Safety',
    target: 'Executor',
    summary:
      'Executor invoked `shell.run` with an unreviewed command — auto-approved under sandbox policy.',
  },
  {
    id: 'a5',
    ts: now - 220_000,
    severity: 'info',
    source: 'Pathfinder',
    target: 'Critic',
    summary:
      'Critic skipped review on 2/8 drafts this hour — trajectory still within tolerance.',
  },
];

/** Pool of alerts used to "stream in" new ones over time. */
export const STREAM_ALERT_POOL: Omit<PathfinderAlert, 'id' | 'ts'>[] = [
  {
    severity: 'warn',
    source: 'Pathfinder',
    target: 'Orchestrator',
    summary: 'Orchestrator re-delegated the same subtask to Researcher twice in 30s.',
  },
  {
    severity: 'critical',
    source: 'Coherence',
    target: 'Researcher',
    summary: 'Researcher answer conflicts with retrieved source — confidence dropped below 0.4.',
  },
  {
    severity: 'info',
    source: 'Cost',
    target: 'Planner',
    summary: 'Planner produced a 12-step plan; pruning suggested to stay under budget.',
  },
  {
    severity: 'warn',
    source: 'Safety',
    target: 'Executor',
    summary: 'Executor reached rate-limit ceiling on external API — backoff engaged.',
  },
  {
    severity: 'info',
    source: 'Pathfinder',
    target: 'Retriever',
    summary: 'Retriever latency up 18% vs. last hour — not yet breaching SLO.',
  },
];
