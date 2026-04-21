/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * GuidedComparePage — Signal → Cause → Action
 *
 * Replaces side-by-side data tables with a guided "strand" of insight:
 * Step A: The Signal (What happened?)
 * Step B: The Cause (Why did it happen?)
 * Step C: The Action (How to fix it?)
 */

import React, { useState } from 'react';
import {
  TrendingDown, TrendingUp, AlertTriangle, Search, FileText,
  Wrench, ChevronDown, ChevronRight, ExternalLink, Sparkles,
  ArrowRight, CheckCircle2, Clock, Zap, Brain,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Breadcrumbs } from '../evals3/Breadcrumbs';
import {
  MOCK_SIGNALS, MOCK_FAILURE_CLUSTERS, MOCK_ROOT_CAUSES, MOCK_RECOMMENDATIONS,
  CompareSignal, FailureCluster, RootCause, Recommendation,
} from './mockData';

const PRIORITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: 'bg-red-500/10 border-red-500/30', text: 'text-red-600 dark:text-red-400', label: 'High Priority' },
  medium: { bg: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-600 dark:text-amber-400', label: 'Medium Priority' },
  low: { bg: 'bg-blue-500/10 border-blue-500/30', text: 'text-blue-600 dark:text-blue-400', label: 'Low Priority' },
};

function SignalCard({ signal }: { signal: CompareSignal }) {
  const isNegative = signal.direction === 'down' && signal.delta < 0;
  const isPositive = signal.direction === 'up' && signal.metric === 'Avg Latency'; // latency up is bad
  const isBad = isNegative || isPositive;

  return (
    <div className={`rounded-lg border p-3 ${isBad ? 'border-red-500/30 bg-red-500/5' : 'border-green-500/30 bg-green-500/5'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{signal.metric}</span>
        {isBad ? <TrendingDown size={12} className="text-red-500" /> : <TrendingUp size={12} className="text-green-500" />}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold">{signal.after}{signal.metric !== 'Avg Latency' ? '%' : 's'}</span>
        <span className="text-xs text-muted-foreground">from {signal.before}{signal.metric !== 'Avg Latency' ? '%' : 's'}</span>
      </div>
      <div className={`text-xs font-semibold mt-0.5 ${isBad ? 'text-red-500' : 'text-green-500'}`}>
        {signal.delta > 0 ? '+' : ''}{signal.delta}{signal.metric !== 'Avg Latency' ? '%' : 's'}
      </div>
    </div>
  );
}

function ClusterBar({ cluster, maxCount }: { cluster: FailureCluster; maxCount: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="space-y-1">
      <button className="w-full flex items-center gap-2 hover:bg-muted/30 rounded p-1 transition-colors" onClick={() => setExpanded(!expanded)}>
        <span className="text-sm shrink-0">{cluster.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs font-medium">{cluster.category}</span>
            <span className="text-[10px] text-muted-foreground">{cluster.count} issues ({cluster.percentage}%)</span>
          </div>
          <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
            <div className="h-full bg-red-500/60 rounded-full transition-all" style={{ width: `${cluster.percentage}%` }} />
          </div>
        </div>
        {expanded ? <ChevronDown size={12} className="text-muted-foreground shrink-0" /> : <ChevronRight size={12} className="text-muted-foreground shrink-0" />}
      </button>
      {expanded && (
        <div className="ml-8 space-y-0.5">
          {cluster.examples.map((ex, i) => (
            <div key={i} className="text-[10px] text-muted-foreground flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-red-500 shrink-0" />
              {ex}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const GuidedComparePage: React.FC = () => {
  const [expandedCause, setExpandedCause] = useState<number | null>(0);
  const maxClusterCount = Math.max(...MOCK_FAILURE_CLUSTERS.map(c => c.count));

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b bg-card shrink-0">
        <Breadcrumbs
          items={[
            { label: 'Evaluations', href: '/evaluations/benchmarks' },
            { label: 'Agent Judge', href: '/judge' },
            { label: 'Guided Compare' },
          ]}
        />
        <div className="flex items-center gap-2 mt-1">
          <h2 className="text-lg font-bold">Guided Compare</h2>
          <Badge variant="outline" className="text-[9px]">v1.0 → v2.0</Badge>
          <Badge className="text-[9px] px-1.5 py-0 bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-500/15 dark:text-purple-400 dark:border-purple-500/30">
            <Brain size={9} className="mr-0.5" /> Judge Analysis
          </Badge>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6 max-w-4xl mx-auto">

          {/* ── Step A: The Signal ──────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 text-xs font-bold">A</div>
              <h3 className="text-sm font-semibold">The Signal — What happened?</h3>
            </div>

            <Card className="border-red-500/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3 p-2 rounded-md bg-red-500/10 border border-red-500/20">
                  <AlertTriangle size={14} className="text-red-500 shrink-0" />
                  <span className="text-sm font-medium">Accuracy dropped from 85% to 60% in Version 2.0</span>
                </div>

                <div className="grid grid-cols-4 gap-3 mb-4">
                  {MOCK_SIGNALS.map(s => <SignalCard key={s.metric} signal={s} />)}
                </div>

                <div>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Failure Pattern Clustering
                  </span>
                  <div className="space-y-2">
                    {MOCK_FAILURE_CLUSTERS.map(c => (
                      <ClusterBar key={c.category} cluster={c} maxCount={maxClusterCount} />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Arrow connector */}
          <div className="flex justify-center">
            <ArrowRight size={20} className="text-muted-foreground/30 rotate-90" />
          </div>

          {/* ── Step B: The Cause ──────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 text-xs font-bold">B</div>
              <h3 className="text-sm font-semibold">The Cause — Why did it happen?</h3>
            </div>

            <div className="space-y-3">
              {MOCK_ROOT_CAUSES.map((cause, i) => (
                <Card key={i} className={`border-amber-500/20 ${expandedCause === i ? 'ring-1 ring-amber-500/20' : ''}`}>
                  <CardContent className="p-4">
                    <button
                      className="w-full flex items-start gap-2 text-left"
                      onClick={() => setExpandedCause(expandedCause === i ? null : i)}
                    >
                      <Search size={14} className="text-amber-500 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold">{cause.title}</h4>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{cause.explanation}</p>
                      </div>
                      {expandedCause === i ? <ChevronDown size={14} className="text-muted-foreground shrink-0 mt-0.5" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0 mt-0.5" />}
                    </button>

                    {expandedCause === i && (
                      <div className="mt-3 pt-3 border-t space-y-2">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Evidence Traces</span>
                        {cause.evidenceTraces.map((ev, j) => (
                          <div key={j} className="flex items-start gap-2 p-2 rounded-md bg-muted/30 border border-border">
                            <FileText size={11} className="text-amber-500 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-mono text-blue-500">{ev.traceId}</span>
                                <span className="text-[10px] text-muted-foreground">·</span>
                                <span className="text-[10px] font-medium">{ev.spanName}</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{ev.description}</p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0">
                              <ExternalLink size={9} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* Arrow connector */}
          <div className="flex justify-center">
            <ArrowRight size={20} className="text-muted-foreground/30 rotate-90" />
          </div>

          {/* ── Step C: The Action ─────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 text-xs font-bold">C</div>
              <h3 className="text-sm font-semibold">The Action — How to fix it?</h3>
            </div>

            <div className="space-y-3">
              {MOCK_RECOMMENDATIONS.map((rec, i) => {
                const style = PRIORITY_STYLES[rec.priority];
                return (
                  <Card key={i} className={`${style.bg}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className={`text-[8px] px-1.5 py-0 ${style.text}`}>
                              {style.label}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Zap size={9} /> {rec.impact}
                            </span>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Clock size={9} /> {rec.effort}
                            </span>
                          </div>
                          <h4 className="text-sm font-semibold">{rec.title}</h4>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{rec.description}</p>
                        </div>
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs shrink-0 ml-3">
                          <Sparkles size={10} /> Generate Fix
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
};
