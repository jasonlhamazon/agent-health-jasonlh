/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AgentDashboardPage — the new first-page "Agent Dashboard" for Agentic
 * Observability. Distinguishes Target Agents (Actors) from Evaluator Agents
 * (Judges), and surfaces real-time swarm interactions + Pathfinder alerts.
 *
 * This is a concept mockup — all data is mocked in ./mockSwarm.
 */

import React, { useState } from 'react';
import { Activity, Bot, Gavel, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '../evals3/Breadcrumbs';
import { InteractionSwarm } from './InteractionSwarm';
import { PathfinderFeed } from './PathfinderFeed';
import {
  EVALUATOR_AGENTS,
  SwarmAgent,
  TARGET_AGENTS,
  TARGET_LINKS,
} from './mockSwarm';

interface KpiProps {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ReactNode;
  tone?: 'default' | 'purple' | 'amber' | 'emerald';
}

function Kpi({ label, value, sub, icon, tone = 'default' }: KpiProps) {
  const toneClass =
    tone === 'purple'
      ? 'from-purple-500/10 to-transparent border-purple-500/30'
      : tone === 'amber'
        ? 'from-amber-500/10 to-transparent border-amber-500/30'
        : tone === 'emerald'
          ? 'from-emerald-500/10 to-transparent border-emerald-500/30'
          : 'from-sky-500/10 to-transparent border-sky-500/30';

  return (
    <Card className={`bg-gradient-to-br ${toneClass}`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {label}
          </span>
          <div className="opacity-80">{icon}</div>
        </div>
        <div className="mt-1.5 text-xl font-bold leading-none">{value}</div>
        {sub && <div className="mt-1 text-[10px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export const AgentDashboardPage: React.FC = () => {
  const [selected, setSelected] = useState<SwarmAgent | null>(null);

  // Naive "messages/min" estimate from link intensities (mocked)
  const activeTargets = TARGET_AGENTS.filter(a => a.activity > 0.4).length;
  const msgsPerMin = Math.round(
    TARGET_LINKS.reduce((s, l) => s + l.intensity, 0) * 48,
  );

  return (
    <div className="p-4 h-full flex flex-col">
      <Breadcrumbs items={[{ label: 'Agent Dashboard' }]} />

      {/* Title */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <Activity size={20} className="text-sky-500" />
          <h2 className="text-xl font-bold">Agent Dashboard</h2>
          <Badge className="text-[9px] px-1.5 py-0 bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30">
            Concept
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Live view of the agent swarm. <span className="text-foreground font-medium">Target Agents</span>{' '}
          are the actors your team builds; <span className="text-purple-400 font-medium">Evaluator Agents</span>{' '}
          are the judges watching them.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <Kpi
          label="Active Target Agents"
          value={`${activeTargets} / ${TARGET_AGENTS.length}`}
          sub="Above activity threshold"
          icon={<Bot size={14} className="text-sky-400" />}
          tone="default"
        />
        <Kpi
          label="Active Evaluators"
          value={EVALUATOR_AGENTS.length}
          sub="Judges monitoring the swarm"
          icon={<Gavel size={14} className="text-purple-400" />}
          tone="purple"
        />
        <Kpi
          label="Messages / min"
          value={msgsPerMin}
          sub="Rolling 60s inter-agent traffic"
          icon={<Activity size={14} className="text-emerald-400" />}
          tone="emerald"
        />
        <Kpi
          label="Open Alerts"
          value={<span>3 <span className="text-xs font-normal text-muted-foreground">· 1 critical</span></span>}
          sub="Pathfinder + Coherence"
          icon={<AlertTriangle size={14} className="text-amber-400" />}
          tone="amber"
        />
      </div>

      {/* Main split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 min-h-[520px]">
        {/* Swarm takes 2/3 on wide screens */}
        <div className="lg:col-span-2 min-h-[520px]">
          <InteractionSwarm
            onSelectAgent={setSelected}
            selectedAgentId={selected?.id ?? null}
          />
        </div>

        {/* Right column: selected agent details (if any) + feed */}
        <div className="flex flex-col gap-3 min-h-[520px]">
          {selected && <SelectedAgentCard agent={selected} />}
          <div className={selected ? 'flex-1 min-h-0' : 'flex-1 min-h-0'}>
            <PathfinderFeed />
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- Selected agent side card ---------------------------------------

function SelectedAgentCard({ agent }: { agent: SwarmAgent }) {
  const isEvaluator = agent.kind === 'evaluator';
  const tone = isEvaluator
    ? 'border-purple-500/40 bg-purple-500/5'
    : 'border-sky-500/40 bg-sky-500/5';

  return (
    <Card className={`${tone} flex-shrink-0`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1.5">
          {isEvaluator ? (
            <Gavel size={14} className="text-purple-400" />
          ) : (
            <Bot size={14} className="text-sky-400" />
          )}
          <span className="text-sm font-semibold">{agent.label}</span>
          <Badge
            variant="outline"
            className={`text-[9px] px-1.5 py-0 uppercase tracking-wider ${
              isEvaluator
                ? 'text-purple-300 border-purple-500/40 bg-purple-500/10'
                : 'text-sky-300 border-sky-500/40 bg-sky-500/10'
            }`}
          >
            {isEvaluator ? 'Evaluator' : 'Target'}
          </Badge>
          <span className="text-[10px] text-muted-foreground ml-auto">
            role: {agent.role}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mb-2">{agent.description}</p>
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Activity" value={`${Math.round(agent.activity * 100)}%`} />
          <Metric
            label="Health"
            value={`${Math.round(agent.health * 100)}%`}
            tone={agent.health > 0.8 ? 'emerald' : agent.health > 0.6 ? 'amber' : 'red'}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'emerald' | 'amber' | 'red';
}) {
  const color =
    tone === 'emerald'
      ? 'text-emerald-400'
      : tone === 'amber'
        ? 'text-amber-400'
        : tone === 'red'
          ? 'text-red-400'
          : 'text-foreground';
  return (
    <div className="rounded-md border bg-background/50 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${color}`}>{value}</div>
    </div>
  );
}
