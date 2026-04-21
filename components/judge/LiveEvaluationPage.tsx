/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LiveEvaluationPage — The "Probing" Trace View
 *
 * Shows the judge's own execution trace alongside the agent's trace.
 * The judge dynamically "probes" the agent's history, leaving evidence
 * annotations directly on the timeline.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brain, Search, Eye, Lightbulb, FileText, Scale,
  CheckCircle2, XCircle, AlertTriangle, ChevronRight,
  Loader2, Play, Pause,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Breadcrumbs } from '../evals3/Breadcrumbs';
import { MOCK_AGENT_SPANS, MOCK_PROBE_STEPS, AgentSpan, ProbeStep } from './mockData';

const PROBE_ICONS: Record<ProbeStep['type'], React.ReactNode> = {
  search: <Search size={12} className="text-blue-500" />,
  inspect: <Eye size={12} className="text-amber-500" />,
  hypothesis: <Lightbulb size={12} className="text-purple-500" />,
  evidence: <FileText size={12} className="text-red-500" />,
  verdict: <Scale size={12} className="text-foreground" />,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 border-red-500/40 text-red-700 dark:text-red-400',
  high: 'bg-amber-500/20 border-amber-500/40 text-amber-700 dark:text-amber-400',
  medium: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-700 dark:text-yellow-400',
  low: 'bg-blue-500/20 border-blue-500/40 text-blue-700 dark:text-blue-400',
};

function SpanBar({ span, maxDuration, isHighlighted }: { span: AgentSpan; maxDuration: number; isHighlighted: boolean }) {
  const left = (span.startMs / maxDuration) * 100;
  const width = Math.max((span.durationMs / maxDuration) * 100, 1);
  const colors = {
    llm: 'bg-purple-500',
    tool: span.status === 'error' ? 'bg-red-500' : 'bg-blue-500',
    agent: 'bg-green-500',
    error: 'bg-red-500',
  };

  return (
    <div className={`relative flex items-center gap-2 py-1 px-2 rounded transition-all ${isHighlighted ? 'bg-amber-500/10 ring-1 ring-amber-500/30' : 'hover:bg-muted/30'}`}>
      <span className="text-[10px] text-muted-foreground w-5 shrink-0 text-right">#{span.id}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {span.status === 'error' && <XCircle size={10} className="text-red-500 shrink-0" />}
          <span className="text-[11px] font-medium truncate">{span.name}</span>
          <span className="text-[9px] text-muted-foreground shrink-0">{span.durationMs}ms</span>
        </div>
        <div className="h-2.5 bg-muted/30 rounded-full relative overflow-hidden">
          <div
            className={`absolute top-0 h-full rounded-full ${colors[span.type]} ${span.status === 'error' ? 'opacity-70' : 'opacity-50'}`}
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        </div>
        {span.annotation && (
          <div className="mt-1 flex items-start gap-1">
            <AlertTriangle size={9} className="text-red-500 mt-0.5 shrink-0" />
            <span className="text-[9px] text-red-600 dark:text-red-400 leading-tight">{span.annotation}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export const LiveEvaluationPage: React.FC = () => {
  const navigate = useNavigate();
  const [visibleSteps, setVisibleSteps] = useState<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const [highlightedSpan, setHighlightedSpan] = useState<number | null>(null);
  const probeEndRef = useRef<HTMLDivElement>(null);

  const maxDuration = Math.max(...MOCK_AGENT_SPANS.map(s => s.startMs + s.durationMs));

  // Simulate the judge probing step by step
  useEffect(() => {
    if (!isRunning || visibleSteps >= MOCK_PROBE_STEPS.length) {
      if (visibleSteps >= MOCK_PROBE_STEPS.length) setIsRunning(false);
      return;
    }
    const timer = setTimeout(() => {
      setVisibleSteps(prev => prev + 1);
      const step = MOCK_PROBE_STEPS[visibleSteps];
      if (step?.spanRef) setHighlightedSpan(step.spanRef);
    }, 1200);
    return () => clearTimeout(timer);
  }, [isRunning, visibleSteps]);

  // Auto-scroll probe feed
  useEffect(() => {
    probeEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleSteps]);

  const handleStart = () => {
    setVisibleSteps(0);
    setHighlightedSpan(null);
    setIsRunning(true);
  };

  const verdict = visibleSteps >= MOCK_PROBE_STEPS.length
    ? MOCK_PROBE_STEPS.find(s => s.type === 'verdict')
    : null;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-card shrink-0">
        <Breadcrumbs
          items={[
            { label: 'Evaluations', href: '/evaluations/benchmarks' },
            { label: 'Agent Judge', href: '/judge' },
            { label: 'Live Evaluation' },
          ]}
          actions={
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs bg-purple-600 hover:bg-purple-700"
              onClick={handleStart}
              disabled={isRunning}
            >
              {isRunning ? <><Loader2 size={12} className="animate-spin" /> Probing...</> : <><Play size={12} /> Start Evaluation</>}
            </Button>
          }
        />
        <div className="flex items-center gap-3 mt-1">
          <h2 className="text-lg font-bold">Live Evaluation</h2>
          <Badge className="text-[9px] px-1.5 py-0 bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-500/15 dark:text-purple-400 dark:border-purple-500/30">
            Senior Business Leader
          </Badge>
          {verdict && (
            <Badge className={`text-[9px] px-1.5 py-0 ${verdict.content.includes('FAIL') ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30' : 'bg-green-100 text-green-700 border-green-300 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30'}`}>
              {verdict.content.includes('FAIL') ? 'FAILED' : 'PASSED'}
            </Badge>
          )}
        </div>
      </div>

      {/* Split: Agent Timeline (left) | Judge Probe Feed (right) */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left: Agent Trace Timeline */}
        <ResizablePanel defaultSize={55} minSize={35}>
          <div className="h-full flex flex-col">
            <div className="px-3 py-2 border-b">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Agent Trace · {MOCK_AGENT_SPANS.length} spans
              </span>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-0.5">
                {MOCK_AGENT_SPANS.map(span => (
                  <SpanBar
                    key={span.id}
                    span={span}
                    maxDuration={maxDuration}
                    isHighlighted={highlightedSpan === span.id}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right: Judge Probe Feed */}
        <ResizablePanel defaultSize={45} minSize={25}>
          <div className="h-full flex flex-col">
            <div className="px-3 py-2 border-b flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Brain size={11} className="text-purple-500" /> Judge Probe Feed
              </span>
              {isRunning && (
                <span className="text-[9px] text-purple-500 flex items-center gap-1">
                  <Loader2 size={9} className="animate-spin" /> Analyzing...
                </span>
              )}
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {visibleSteps === 0 && !isRunning && (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Brain size={32} className="mb-3 opacity-20" />
                    <p className="text-sm">Click "Start Evaluation" to begin</p>
                    <p className="text-[10px] mt-1">The judge will probe the agent trace step by step</p>
                  </div>
                )}
                {MOCK_PROBE_STEPS.slice(0, visibleSteps).map((step, i) => (
                  <div
                    key={step.id}
                    className={`flex items-start gap-2 p-2 rounded-md border transition-all ${
                      step.type === 'verdict'
                        ? step.content.includes('FAIL')
                          ? 'bg-red-500/10 border-red-500/30'
                          : 'bg-green-500/10 border-green-500/30'
                        : step.severity
                          ? SEVERITY_COLORS[step.severity]
                          : 'bg-muted/20 border-border'
                    } ${i === visibleSteps - 1 ? 'ring-1 ring-purple-500/30' : ''}`}
                  >
                    <div className="mt-0.5 shrink-0">{PROBE_ICONS[step.type]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] leading-relaxed">{step.content}</p>
                      {step.spanRef && (
                        <button
                          className="text-[9px] text-blue-500 hover:underline mt-0.5"
                          onClick={() => setHighlightedSpan(step.spanRef!)}
                        >
                          → View Span #{step.spanRef}
                        </button>
                      )}
                    </div>
                    {step.severity && (
                      <Badge variant="outline" className={`text-[8px] px-1 py-0 shrink-0 ${SEVERITY_COLORS[step.severity]}`}>
                        {step.severity.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                ))}
                <div ref={probeEndRef} />
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};
