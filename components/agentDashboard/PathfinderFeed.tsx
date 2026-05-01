/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PathfinderFeed — natural-language alerts emitted by Evaluator Agents about
 * the Target Agent swarm. New alerts stream in on a timer (mock).
 */

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info, ShieldAlert, Sparkles, ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PathfinderAlert, SEED_ALERTS, STREAM_ALERT_POOL } from './mockSwarm';

function fmtAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

const SEV_STYLE: Record<PathfinderAlert['severity'], { icon: React.ReactNode; badge: string; bar: string }> = {
  critical: {
    icon: <ShieldAlert size={13} className="text-red-400" />,
    badge: 'bg-red-500/15 text-red-300 border-red-500/30',
    bar: 'bg-red-500',
  },
  warn: {
    icon: <AlertTriangle size={13} className="text-amber-400" />,
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    bar: 'bg-amber-500',
  },
  info: {
    icon: <Info size={13} className="text-sky-400" />,
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    bar: 'bg-sky-500',
  },
};

export const PathfinderFeed: React.FC = () => {
  const [alerts, setAlerts] = useState<PathfinderAlert[]>(SEED_ALERTS);
  const seq = useRef(SEED_ALERTS.length);

  // Stream in a new mock alert every ~8s, keep most recent 20
  useEffect(() => {
    const timer = setInterval(() => {
      const pick = STREAM_ALERT_POOL[Math.floor(Math.random() * STREAM_ALERT_POOL.length)];
      seq.current += 1;
      const next: PathfinderAlert = {
        ...pick,
        id: `a-stream-${seq.current}`,
        ts: Date.now(),
      };
      setAlerts(prev => [next, ...prev].slice(0, 20));
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col h-full rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-purple-400" />
          <span className="text-xs font-semibold">Pathfinder Alert Feed</span>
          <Badge className="text-[9px] px-1.5 py-0 bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30">
            Evaluator-generated
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="relative flex w-1.5 h-1.5">
            <span className="animate-ping absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500" />
          </span>
          Live
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y">
        {alerts.map(a => {
          const s = SEV_STYLE[a.severity];
          return (
            <div
              key={a.id}
              className="flex gap-2 px-3 py-2.5 hover:bg-accent/40 transition-colors"
              data-testid={`pathfinder-alert-${a.id}`}
            >
              <div className={`w-0.5 rounded-full ${s.bar}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {s.icon}
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1.5 py-0 uppercase tracking-wider ${s.badge}`}
                  >
                    {a.severity}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    <span className="text-purple-400 font-medium">{a.source}</span>
                    {' → '}
                    <span className="text-foreground font-medium">{a.target}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{fmtAgo(a.ts)}</span>
                </div>
                <p className="text-[11px] leading-snug text-foreground/90">{a.summary}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] gap-1">
                    Investigate <ArrowUpRight size={10} />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]">
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
