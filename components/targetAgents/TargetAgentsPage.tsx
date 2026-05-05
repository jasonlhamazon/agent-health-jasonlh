/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TargetAgentsPage — placeholder for the "Target Agents" section.
 *
 * Target Agents are the actors customers build (Orchestrator, Researcher,
 * Planner, Executor, Retriever, Critic, …). This page is intentionally
 * blank for now — concept mockup only.
 */

import React from 'react';
import { Bot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '../evals3/Breadcrumbs';

export const TargetAgentsPage: React.FC = () => {
  return (
    <div className="p-4 h-full flex flex-col">
      <Breadcrumbs items={[{ label: 'Target Agents' }]} />

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Bot size={20} className="text-sky-500" />
          <h2 className="text-xl font-bold">Target Agents</h2>
          <Badge className="text-[9px] px-1.5 py-0 bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-500/15 dark:text-purple-400 dark:border-purple-500/30">
            Coming Soon
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">
          The actors your team builds — Orchestrators, Researchers, Planners and their peers. This
          page will host registration, health, and ownership for every Target Agent in the swarm.
        </p>
      </div>

      {/* Empty state */}
      <div className="flex-1 flex items-center justify-center">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
            <Bot size={22} className="text-sky-400" />
          </div>
          <h3 className="text-sm font-semibold mb-1">Nothing here yet</h3>
          <p className="text-[11px] text-muted-foreground">
            Target Agent inventory and management will live here. For now, see the live swarm on
            the Agent Dashboard.
          </p>
        </div>
      </div>
    </div>
  );
};
