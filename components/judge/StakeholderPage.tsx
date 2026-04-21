/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StakeholderPage — Human-in-the-Loop Labeling Dashboard
 *
 * Business owners see the judge's Yes/No decision with trace evidence.
 * Humans can override decisions, which calibrates the judge's guidelines.
 */

import React, { useState } from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, MessageSquare,
  ThumbsUp, ThumbsDown, ChevronDown, ChevronRight,
  Brain, Users, BarChart3, Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Breadcrumbs } from '../evals3/Breadcrumbs';
import { MOCK_LABELING_ITEMS, LabelingItem } from './mockData';

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-muted-foreground">{pct}%</span>
    </div>
  );
}

function LabelingCard({ item, onOverride }: { item: LabelingItem; onOverride: (id: string, decision: 'agree' | 'disagree', note: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(item.humanNote || '');
  const [localOverride, setLocalOverride] = useState<'agree' | 'disagree' | null>(item.humanOverride || null);

  const handleOverride = (decision: 'agree' | 'disagree') => {
    setLocalOverride(decision);
    onOverride(item.id, decision, note);
  };

  return (
    <Card className={`transition-all ${
      localOverride === 'disagree'
        ? 'border-amber-500/40 bg-amber-500/5'
        : localOverride === 'agree'
          ? 'border-green-500/20'
          : ''
    }`}>
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className="mt-0.5 shrink-0">
              {item.judgeDecision === 'pass'
                ? <CheckCircle2 size={16} className="text-green-500" />
                : <XCircle size={16} className="text-red-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold">{item.testCaseName}</span>
                <Badge className={`text-[8px] px-1.5 py-0 ${
                  item.judgeDecision === 'pass'
                    ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30'
                    : 'bg-red-100 text-red-700 border-red-300 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30'
                }`}>
                  {item.judgeDecision === 'pass' ? 'PASS' : 'FAIL'}
                </Badge>
                <ConfidenceBar confidence={item.judgeConfidence} />
                {localOverride && (
                  <Badge variant="outline" className={`text-[8px] px-1.5 py-0 ${
                    localOverride === 'agree' ? 'text-green-600 border-green-300' : 'text-amber-600 border-amber-300'
                  }`}>
                    {localOverride === 'agree' ? '✓ Confirmed' : '⚠ Overridden'}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.agentResponse}</p>
            </div>
          </div>
          <button onClick={() => setExpanded(!expanded)} className="shrink-0 p-1 hover:bg-muted rounded transition-colors">
            {expanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
          </button>
        </div>

        {/* Expanded: reasoning + evidence + override controls */}
        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-3">
            {/* Judge reasoning */}
            <div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-1">
                <Brain size={9} className="text-purple-500" /> Judge Reasoning
              </span>
              <p className="text-xs leading-relaxed bg-muted/30 rounded-md p-2 border border-border">{item.judgeReasoning}</p>
            </div>

            {/* Evidence */}
            <div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Evidence</span>
              <p className="text-[11px] text-muted-foreground bg-purple-500/5 rounded-md p-2 border border-purple-500/20">{item.evidenceSummary}</p>
            </div>

            {/* Human override controls */}
            <div className="flex items-start gap-3 p-3 rounded-md bg-muted/20 border border-border">
              <Users size={14} className="text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 space-y-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Your Review</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant={localOverride === 'agree' ? 'default' : 'outline'}
                    size="sm"
                    className={`h-7 gap-1 text-xs ${localOverride === 'agree' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                    onClick={() => handleOverride('agree')}
                  >
                    <ThumbsUp size={10} /> Agree
                  </Button>
                  <Button
                    variant={localOverride === 'disagree' ? 'default' : 'outline'}
                    size="sm"
                    className={`h-7 gap-1 text-xs ${localOverride === 'disagree' ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
                    onClick={() => handleOverride('disagree')}
                  >
                    <ThumbsDown size={10} /> Disagree
                  </Button>
                </div>
                <Textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Add a note (optional) — this calibrates the judge for future runs..."
                  className="min-h-[60px] text-xs"
                />
                {localOverride === 'disagree' && (
                  <div className="flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                    <AlertTriangle size={10} />
                    <span>Your override will update the judge's guidelines for future evaluations</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const StakeholderPage: React.FC = () => {
  const [items, setItems] = useState(MOCK_LABELING_ITEMS);
  const [filter, setFilter] = useState<'all' | 'pass' | 'fail' | 'needs-review'>('all');

  const handleOverride = (id: string, decision: 'agree' | 'disagree', note: string) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, humanOverride: decision, humanNote: note } : item
    ));
  };

  const filtered = items.filter(item => {
    if (filter === 'pass') return item.judgeDecision === 'pass';
    if (filter === 'fail') return item.judgeDecision === 'fail';
    if (filter === 'needs-review') return !item.humanOverride;
    return true;
  });

  const stats = {
    total: items.length,
    passed: items.filter(i => i.judgeDecision === 'pass').length,
    failed: items.filter(i => i.judgeDecision === 'fail').length,
    reviewed: items.filter(i => i.humanOverride).length,
    overridden: items.filter(i => i.humanOverride === 'disagree').length,
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b bg-card shrink-0">
        <Breadcrumbs
          items={[
            { label: 'Evaluations', href: '/evaluations/benchmarks' },
            { label: 'Agent Judge', href: '/judge' },
            { label: 'Stakeholder Review' },
          ]}
        />
        <div className="flex items-center justify-between mt-1">
          <div>
            <h2 className="text-lg font-bold">Stakeholder Review</h2>
            <p className="text-[10px] text-muted-foreground">Review judge decisions and calibrate with human feedback</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <BarChart3 size={12} className="text-blue-500" />
              <span className="font-semibold">{stats.total}</span>
              <span className="text-muted-foreground">evaluations</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-green-500" />
              <span className="font-semibold">{stats.reviewed}</span>
              <span className="text-muted-foreground">reviewed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={12} className="text-amber-500" />
              <span className="font-semibold">{stats.overridden}</span>
              <span className="text-muted-foreground">overridden</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="px-4 py-2 border-b flex items-center gap-2">
        <Filter size={12} className="text-muted-foreground" />
        {(['all', 'pass', 'fail', 'needs-review'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-1 text-[10px] rounded-md border transition-colors ${
              filter === f ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
            }`}
          >
            {f === 'all' ? `All (${stats.total})` : f === 'pass' ? `Passed (${stats.passed})` : f === 'fail' ? `Failed (${stats.failed})` : `Needs Review (${stats.total - stats.reviewed})`}
          </button>
        ))}
      </div>

      {/* Labeling items */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3 max-w-3xl mx-auto">
          {filtered.map(item => (
            <LabelingCard key={item.id} item={item} onOverride={handleOverride} />
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <CheckCircle2 size={32} className="mb-3 opacity-20" />
              <p className="text-sm">All items reviewed</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
