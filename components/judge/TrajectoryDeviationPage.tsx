/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TrajectoryDeviationPage — Merged diff view of two agent runs
 *
 * Shows a side-by-side trajectory overlay with:
 * - Matched steps (green dots)
 * - Deviation steps (red dots) with judge annotations
 * - Added steps (purple dots, v1 only)
 * - Agentic judge annotation banner at the deviation point
 * - Summary stats footer
 */

import React, { useState } from 'react';
import {
  User, Brain, Wrench, Database, MessageSquare, CheckCircle2,
  XCircle, AlertTriangle, ArrowLeft, ArrowRight, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Breadcrumbs } from '../evals3/Breadcrumbs';
import {
  DEVIATION_ROWS, BASELINE_RUN, CANDIDATE_RUN, TEST_CASE_NAME,
  COMPARISON_STATS, DeviationRow, TrajectoryStep, StepType, MatchStatus,
} from './trajectoryDeviationData';

// ─── Step type styling ───────────────────────────────────────────────────────

const STEP_STYLES: Record<StepType, { icon: React.ReactNode; borderColor: string; labelColor: string }> = {
  'user-prompt': {
    icon: <User size={11} />,
    borderColor: 'border-blue-400 dark:border-blue-500',
    labelColor: 'text-blue-600 dark:text-blue-400',
  },
  'llm-reasoning': {
    icon: <Brain size={11} />,
    borderColor: 'border-orange-400 dark:border-orange-500',
    labelColor: 'text-orange-600 dark:text-orange-400',
  },
  'tool-call': {
    icon: <Wrench size={11} />,
    borderColor: 'border-red-400 dark:border-red-500',
    labelColor: 'text-red-600 dark:text-red-400',
  },
  'tool-result': {
    icon: <Database size={11} />,
    borderColor: 'border-purple-400 dark:border-purple-500',
    labelColor: 'text-purple-600 dark:text-purple-400',
  },
  'llm-response': {
    icon: <MessageSquare size={11} />,
    borderColor: 'border-red-400 dark:border-red-500',
    labelColor: 'text-red-600 dark:text-red-400',
  },
  'user-reply': {
    icon: <User size={11} />,
    borderColor: 'border-violet-400 dark:border-violet-500',
    labelColor: 'text-violet-600 dark:text-violet-400',
  },
  'complete': {
    icon: <CheckCircle2 size={11} />,
    borderColor: 'border-muted',
    labelColor: 'text-muted-foreground',
  },
};

// ─── Dot color for the center connector ──────────────────────────────────────

function DotColor({ status }: { status: MatchStatus }) {
  const colors: Record<MatchStatus, string> = {
    matched: 'bg-green-500',
    deviation: 'bg-red-500',
    added: 'bg-purple-500',
  };
  return <div className={`w-2.5 h-2.5 rounded-full ${colors[status]} shrink-0 ring-2 ring-background`} />;
}

// ─── Single step card ────────────────────────────────────────────────────────

function StepCard({ step, side }: { step: TrajectoryStep; side: 'left' | 'right' }) {
  const style = STEP_STYLES[step.type];
  return (
    <div className={`rounded-lg border-2 ${style.borderColor} bg-card p-3 space-y-1.5`}>
      <div className="flex items-center gap-1.5">
        <span className={style.labelColor}>{style.icon}</span>
        <span className={`text-[10px] font-bold uppercase tracking-wider ${style.labelColor}`}>
          {step.label}
        </span>
      </div>
      <p className="text-xs leading-relaxed">{step.content}</p>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>Step {step.step}</span>
        {step.durationMs !== undefined && <span>{step.durationMs}ms</span>}
        {step.tokens !== undefined && <span>{step.tokens} tokens</span>}
        {step.annotation && (
          <span className="text-green-600 dark:text-green-400 font-medium">✓ {step.annotation}</span>
        )}
        {step.warningAnnotation && (
          <span className="text-red-500 font-medium">✗ {step.warningAnnotation}</span>
        )}
      </div>
    </div>
  );
}

// ─── Empty placeholder for added-only rows ───────────────────────────────────

function EmptySlot({ label }: { label?: string }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-muted bg-muted/10 p-3 flex items-center justify-center min-h-[80px]">
      <span className="text-[10px] text-muted-foreground italic">{label || '—'}</span>
    </div>
  );
}

// ─── Judge annotation banner ─────────────────────────────────────────────────

function JudgeAnnotationBanner({ title, detail, highlightTerms }: { title: string; detail: string; highlightTerms: string[] }) {
  // Bold the highlight terms in the detail text
  let rendered = detail;
  for (const term of highlightTerms) {
    rendered = rendered.replace(new RegExp(`'${term}'`, 'g'), `<strong class="text-foreground">'${term}'</strong>`);
  }

  return (
    <div className="col-span-3 mx-4 my-1">
      <div className="rounded-lg border-2 border-dashed border-red-400 dark:border-red-500 bg-red-50 dark:bg-red-500/10 p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={14} className="text-red-500 shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">{title}</span>
        </div>
        <p
          className="text-xs leading-relaxed text-red-800 dark:text-red-300"
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export const TrajectoryDeviationPage: React.FC = () => {
  const [viewMode, setViewMode] = useState<'diff' | 'side-by-side' | 'timeline'>('diff');

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-card shrink-0">
        <Breadcrumbs
          items={[
            { label: 'Evaluations', href: '/evaluations/benchmarks' },
            { label: 'Compare Runs', href: '/judge/compare' },
            { label: 'Trajectory Deviation' },
          ]}
          actions={
            <div className="flex items-center border border-border rounded-md overflow-hidden">
              {(['diff', 'side-by-side', 'timeline'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1 text-xs transition-colors ${
                    viewMode === mode ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                >
                  {mode === 'diff' ? 'Diff View' : mode === 'side-by-side' ? 'Side-by-Side' : 'Timeline'}
                </button>
              ))}
            </div>
          }
        />
        <div className="mt-1">
          <h2 className="text-lg font-bold">Trajectory Deviation Overlay</h2>
          <p className="text-[11px] text-muted-foreground">
            Merged diff view — "{TEST_CASE_NAME}" test case
          </p>
        </div>
      </div>

      {/* Test case header bar */}
      <div className="px-4 py-2 border-b bg-muted/20 flex items-center justify-between">
        <div>
          <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Test Case</span>
          <p className="text-sm font-semibold">{TEST_CASE_NAME}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="text-[9px] px-2 py-0.5 bg-green-100 text-green-700 border-green-300 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30">
            v0 Passed
          </Badge>
          <ArrowRight size={12} className="text-muted-foreground" />
          <Badge className="text-[9px] px-2 py-0.5 bg-red-100 text-red-700 border-red-300 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30">
            v1 Failed
          </Badge>
          <Badge variant="outline" className="text-[9px] px-2 py-0.5 text-red-500 border-red-300">
            ↓ Regressed
          </Badge>
        </div>
      </div>

      {/* Column headers */}
      <div className="px-4 py-2 border-b grid grid-cols-[1fr_32px_1fr] gap-2 items-center">
        <div className="flex items-center gap-2">
          <ArrowLeft size={12} className="text-blue-500" />
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
            BASELINE · RUN 5 (V0)
          </span>
        </div>
        <div />
        <div className="flex items-center gap-2 justify-end">
          <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
            RUN 6 (V1)
          </span>
          <ArrowRight size={12} className="text-purple-500" />
        </div>
      </div>

      {/* Scrollable trajectory rows */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-1">
          {DEVIATION_ROWS.map(row => (
            <React.Fragment key={row.id}>
              {/* Judge annotation banner — rendered before the deviation row */}
              {row.judgeAnnotation && (
                <JudgeAnnotationBanner
                  title={row.judgeAnnotation.title}
                  detail={row.judgeAnnotation.detail}
                  highlightTerms={row.judgeAnnotation.highlightTerms}
                />
              )}

              {/* Step row: left | dot | right */}
              <div className="grid grid-cols-[1fr_32px_1fr] gap-2 items-start">
                {/* Left (baseline) */}
                <div>
                  {row.left ? <StepCard step={row.left} side="left" /> : <EmptySlot label={row.status === 'added' ? 'Conversation ended at step 5' : undefined} />}
                </div>

                {/* Center dot */}
                <div className="flex justify-center pt-4">
                  <DotColor status={row.status} />
                </div>

                {/* Right (candidate) */}
                <div>
                  {row.right ? <StepCard step={row.right} side="right" /> : <EmptySlot />}
                </div>
              </div>
            </React.Fragment>
          ))}

          {/* Complete marker for left side */}
          <div className="grid grid-cols-[1fr_32px_1fr] gap-2 items-start">
            <div className="rounded-lg border border-dashed border-muted p-3 text-center">
              <span className="text-[10px] text-muted-foreground italic">— Complete —</span>
              <p className="text-[9px] text-muted-foreground">Conversation ended at step 5</p>
            </div>
            <div className="flex justify-center pt-4">
              <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
            </div>
            <div />
          </div>
        </div>
      </ScrollArea>

      {/* Footer: legend + stats */}
      <div className="px-4 py-2.5 border-t bg-muted/20 flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" /> Matched
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500" /> Deviation
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-purple-500" /> Added (v1 only)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-red-400" /> Bridge
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-500" /> v0 Baseline
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-purple-500" /> v1 Candidate
          </span>
        </div>
        <div className="text-muted-foreground">
          v0: {BASELINE_RUN.steps} steps · {BASELINE_RUN.durationMs}ms · {BASELINE_RUN.tokens} tok
          {' | '}
          v1: {CANDIDATE_RUN.steps} steps · {CANDIDATE_RUN.durationMs}ms · {CANDIDATE_RUN.tokens} tok
          {' | '}
          <span className="text-red-500 font-medium">
            +{COMPARISON_STATS.extraTurns} turns, +{COMPARISON_STATS.latencyIncrease}% latency
          </span>
        </div>
      </div>
    </div>
  );
};
