/*
 * TestCaseDetailPage — Evals 3: Test Case drill-down
 *
 * Split-panel layout matching RunInspectorPage:
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ ← Back to Test Cases   Test Case Name        Edit | Run Test   │
 *   │ [TEST CASE] · labels · Created date · X runs · pass rate       │
 *   ├──────────────────┬──────────────────────────────────────────────┤
 *   │ Left Panel       │ Right Panel                                  │
 *   │ ▸ DEFINITION     │ TestCaseInspectorPanel for selected run      │
 *   │   5 expected     │                                              │
 *   │   3 context      │                                              │
 *   │ ─────────────    │                                              │
 *   │ RUNS (timeline)  │                                              │
 *   │ ✓ PASSED  88%    │                                              │
 *   │ ✗ FAILED  33%    │                                              │
 *   └──────────────────┴──────────────────────────────────────────────┘
 *
 * Route: /evals3/test-cases/:testCaseId
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Play, Calendar, CheckCircle2, XCircle, Trash2, Pencil,
  Loader2, ChevronDown, ChevronRight, FileText, Clock, Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { asyncTestCaseStorage, asyncRunStorage } from '@/services/storage';
import { TestCase, EvaluationReport } from '@/types';
import { DEFAULT_CONFIG } from '@/lib/constants';
import { getLabelColor, formatDate, formatRelativeTime, getModelName } from '@/lib/utils';
import { QuickRunModal } from '../QuickRunModal';
import { TestCaseEditor } from '../TestCaseEditor';
import { TestCaseInspectorPanel } from './TestCaseInspectorPanel';

type TimeRange = '1h' | '6h' | '1d' | '7d' | '30d' | 'all';
const TIME_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '7d', label: 'Last 7d' },
  { value: '30d', label: 'Last 30d' },
  { value: 'all', label: 'All time' },
];
function getTimeThreshold(range: TimeRange): Date | null {
  if (range === 'all') return null;
  const ms: Record<string, number> = { '1h': 3600000, '6h': 21600000, '1d': 86400000, '7d': 604800000, '30d': 2592000000 };
  return new Date(Date.now() - ms[range]);
}

type ResultStatus = 'passed' | 'failed' | 'running' | 'pending';
function getStatus(r: EvaluationReport): ResultStatus {
  if (r.passFailStatus === 'passed') return 'passed';
  if (r.passFailStatus === 'failed') return 'failed';
  if (r.status === 'running') return 'running';
  return 'pending';
}

export const TestCaseDetailPage: React.FC = () => {
  const { testCaseId } = useParams<{ testCaseId: string }>();
  const navigate = useNavigate();

  const [testCase, setTestCase] = useState<TestCase | null>(null);
  const [runs, setRuns] = useState<EvaluationReport[]>([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // UI state
  const [definitionOpen, setDefinitionOpen] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runningTestCase, setRunningTestCase] = useState<TestCase | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const loadData = useCallback(async () => {
    if (!testCaseId) return;
    setIsLoading(true);
    try {
      const [tc, { reports, total }] = await Promise.all([
        asyncTestCaseStorage.getById(testCaseId),
        asyncRunStorage.getReportsByTestCase(testCaseId),
      ]);
      if (!tc) { navigate('/evals3/test-cases'); return; }
      setTestCase(tc);
      const sorted = reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setRuns(sorted);
      setTotalRuns(total);
      // Auto-select first run
      if (sorted.length > 0 && !selectedRunId) setSelectedRunId(sorted[0].id);
    } catch (error) {
      console.error('Failed to load test case:', error);
    } finally {
      setIsLoading(false);
    }
  }, [testCaseId, navigate, selectedRunId]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredRuns = useMemo(() => {
    const threshold = getTimeThreshold(timeRange);
    if (!threshold) return runs;
    return runs.filter(r => new Date(r.timestamp) >= threshold);
  }, [runs, timeRange]);

  const passCount = filteredRuns.filter(r => r.passFailStatus === 'passed').length;
  const failCount = filteredRuns.filter(r => r.passFailStatus === 'failed').length;
  const passRate = filteredRuns.length > 0 ? Math.round((passCount / filteredRuns.length) * 100) : 0;

  const selectedRun = filteredRuns.find(r => r.id === selectedRunId) || null;

  if (isLoading || !testCase) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-60" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-[calc(100vh-200px)] w-full" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* ── Top Summary Bar ────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b bg-card shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(-1)}>
              <ArrowLeft size={16} />
            </Button>
            <h2 className="text-xl font-bold truncate">{testCase.name}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowEditor(true)}>
              <Pencil size={12} className="mr-1" /> Edit
            </Button>
            <Button size="sm" className="h-7 text-xs bg-opensearch-blue hover:bg-blue-600" onClick={() => setRunningTestCase(testCase)}>
              <Play size={12} className="mr-1" /> Run Test
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap ml-10">
          <Badge className="text-[10px] px-2 py-0.5 bg-muted text-muted-foreground border-border font-medium uppercase tracking-widest rounded shrink-0">
            Test Case
          </Badge>
          {testCase.labels?.length > 0 && testCase.labels.slice(0, 3).map(l => (
            <Badge key={l} variant="outline" className={`text-[9px] px-1.5 py-0 ${getLabelColor(l)}`}>{l}</Badge>
          ))}
          <span className="flex items-center gap-1"><Calendar size={11} /> {formatDate(testCase.createdAt)}</span>
          <span className="text-muted-foreground/30">·</span>
          <span>{totalRuns} run{totalRuns !== 1 ? 's' : ''}</span>
          <span className="text-muted-foreground/30">·</span>
          <span className="flex items-center gap-1.5">
            <span className="text-green-500 font-medium">{passCount}✓</span>
            <span className="text-red-500 font-medium">{failCount}✗</span>
          </span>
          <span className="text-muted-foreground/30">·</span>
          <span className={`font-medium ${passRate >= 80 ? 'text-green-500' : passRate >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
            {passRate}% pass rate
          </span>
        </div>
      </div>

      {/* ── Main Content: Left Panel + Right Panel ─────────────────── */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* ── Left Panel ──────────────────────────────────────────── */}
        <ResizablePanel defaultSize={30} minSize={20} maxSize={45} className="border-r">
          <ScrollArea className="h-full">
            {/* ── Collapsible Definition ──────────────────────────── */}
            <div className="border-b">
              <button
                onClick={() => setDefinitionOpen(!definitionOpen)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {definitionOpen ? <ChevronDown size={12} className="text-muted-foreground" /> : <ChevronRight size={12} className="text-muted-foreground" />}
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Definition</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  {testCase.expectedOutcomes?.length > 0 && (
                    <span className="flex items-center gap-0.5"><Target size={9} /> {testCase.expectedOutcomes.length} expected</span>
                  )}
                  {testCase.context?.length > 0 && (
                    <span>{testCase.context.length} context</span>
                  )}
                </div>
              </button>
              {definitionOpen && (
                <div className="px-3 pb-3 space-y-2.5">
                  {/* Input prompt */}
                  <div>
                    <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Input</div>
                    <div className="text-[10px] bg-muted/40 rounded px-2 py-1.5 border border-border max-h-20 overflow-y-auto break-words leading-relaxed">
                      {testCase.initialPrompt || '—'}
                    </div>
                  </div>
                  {/* Expected outcomes */}
                  {testCase.expectedOutcomes?.length > 0 && (
                    <div>
                      <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Expected</div>
                      <ul className="space-y-0.5">
                        {testCase.expectedOutcomes.map((o, i) => (
                          <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1 leading-snug">
                            <CheckCircle2 size={9} className="text-green-500 mt-0.5 shrink-0" />
                            <span className="break-words min-w-0">{o}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {/* Context */}
                  {testCase.context?.length > 0 && (
                    <div>
                      <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Context ({testCase.context.length})</div>
                      <div className="space-y-1">
                        {testCase.context.map((ctx, i) => (
                          <div key={i} className="bg-muted/30 rounded px-2 py-1 border border-border">
                            <p className="text-[9px] font-medium text-muted-foreground">{ctx.description}</p>
                            <pre className="text-[9px] overflow-x-auto max-h-12 overflow-y-auto">{ctx.value.slice(0, 150)}{ctx.value.length > 150 ? '…' : ''}</pre>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Runs List ───────────────────────────────────────── */}
            <div className="px-3 pt-2 pb-1 border-b flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Test Case Runs ({filteredRuns.length})</span>
              <select
                value={timeRange}
                onChange={e => setTimeRange(e.target.value as TimeRange)}
                className="text-[10px] px-1.5 py-0.5 bg-background border border-border rounded"
              >
                {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="p-2 space-y-0.5">
              {filteredRuns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <FileText size={24} className="mb-2 opacity-20" />
                  <p className="text-[10px]">No runs yet</p>
                </div>
              ) : (
                filteredRuns.map((run, index) => {
                  const isPassed = run.passFailStatus === 'passed';
                  const isSelected = run.id === selectedRunId;
                  const isLatest = index === 0;
                  return (
                    <div
                      key={run.id}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-colors ${
                        isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50 border border-transparent'
                      }`}
                      onClick={() => setSelectedRunId(run.id)}
                    >
                      <div className="shrink-0">
                        {isPassed
                          ? <CheckCircle2 size={14} className="text-green-500" />
                          : <XCircle size={14} className="text-red-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-semibold ${isPassed ? 'text-green-500' : 'text-red-500'}`}>
                            {isPassed ? 'PASSED' : 'FAILED'}
                          </span>
                          {isLatest && (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30">
                              Latest
                            </Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono">{run.id.slice(0, 12)}</span>
                          <span>·</span>
                          <span>{formatRelativeTime(run.timestamp)}</span>
                          <span>·</span>
                          <span>{getModelName(run.modelName)}</span>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                        {run.metrics?.accuracy ?? '—'}%
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* ── Right Panel: Test Case Inspector ────────────────────── */}
        <ResizablePanel defaultSize={70} minSize={50}>
          {selectedRun ? (
            <TestCaseInspectorPanel
              report={selectedRun}
              testCase={testCase}
              status={getStatus(selectedRun)}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <FileText size={32} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">Select a run to inspect</p>
              </div>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* ── Modals ─────────────────────────────────────────────────── */}
      {runningTestCase && (
        <QuickRunModal testCase={runningTestCase} onClose={() => { setRunningTestCase(null); loadData(); }} onSaveAsTestCase={() => {}} />
      )}
      {showEditor && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
          <div className="fixed inset-4 z-50 overflow-auto bg-background border rounded-lg shadow-lg">
            <TestCaseEditor testCase={testCase} onSave={async () => { setShowEditor(false); loadData(); }} onCancel={() => setShowEditor(false)} />
          </div>
        </div>
      )}
    </div>
  );
};
