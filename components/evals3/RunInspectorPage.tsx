/*
 * RunInspectorPage — Evals 3: Unified Run Inspection
 *
 * Replaces BenchmarkRunDetailPage with a single-screen inspection workflow.
 * Layout:
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ Top Summary Bar (run metadata: agent, model, time, score)      │
 *   ├──────────────────┬──────────────────────────────────────────────┤
 *   │ Left Panel       │ Right Panel                                  │
 *   │ Test case list   │ Selected test case detail                    │
 *   │ with inline      │ Tabs: Conversation | Traces | Judge | Notes │
 *   │ expand for       │                                              │
 *   │ input/expected   │                                              │
 *   └──────────────────┴──────────────────────────────────────────────┘
 *
 * Route: /evals3/benchmarks/:benchmarkId/runs/:runId/inspect
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, XCircle, Loader2, Clock, Calendar,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { asyncBenchmarkStorage, asyncTestCaseStorage, asyncRunStorage } from '@/services/storage';
import { Benchmark, BenchmarkRun, TestCase, EvaluationReport } from '@/types';
import { DEFAULT_CONFIG } from '@/lib/constants';
import { formatDate, getModelName, getLabelColor } from '@/lib/utils';
import { TestCaseInspectorPanel } from './TestCaseInspectorPanel';

// ─── Types ───────────────────────────────────────────────────────────────────

type ResultStatus = 'passed' | 'failed' | 'running' | 'pending';

interface TestCaseResult {
  testCaseId: string;
  testCase: TestCase | null;
  reportId: string | null;
  status: ResultStatus;
}

function getResultStatus(runResult: { status: string }): ResultStatus {
  if (runResult.status === 'running') return 'running';
  if (runResult.status === 'pending') return 'pending';
  if (runResult.status === 'completed') return 'passed';
  if (runResult.status === 'failed' || runResult.status === 'cancelled') return 'failed';
  return 'pending';
}

function StatusIcon({ status, size = 14 }: { status: ResultStatus; size?: number }) {
  switch (status) {
    case 'passed': return <CheckCircle2 size={size} className="text-green-500" />;
    case 'failed': return <XCircle size={size} className="text-red-500" />;
    case 'running': return <Loader2 size={size} className="text-blue-600 dark:text-blue-400 animate-spin" />;
    case 'pending': return <Clock size={size} className="text-muted-foreground" />;
  }
}


// ─── Main Component ──────────────────────────────────────────────────────────

export const RunInspectorPage: React.FC = () => {
  const { benchmarkId, runId } = useParams<{ benchmarkId: string; runId: string }>();
  const navigate = useNavigate();

  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [run, setRun] = useState<BenchmarkRun | null>(null);
  const [results, setResults] = useState<TestCaseResult[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected test case
  const [selectedTcId, setSelectedTcId] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<EvaluationReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Expanded test cases in left panel (for inline input/expected preview)
  const [expandedTcs, setExpandedTcs] = useState<Set<string>>(new Set());

  // ─── Data Loading ────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!benchmarkId || !runId) return;
    setLoading(true);
    try {
      const bm = await asyncBenchmarkStorage.getById(benchmarkId);
      if (!bm) { navigate('/evals3/benchmarks'); return; }
      setBenchmark(bm);

      const bmRun = bm.runs?.find(r => r.id === runId);
      if (!bmRun) { navigate(`/evals3/benchmarks/${benchmarkId}/runs`); return; }
      setRun(bmRun);

      const tcIds = Object.keys(bmRun.results || {});
      const testCases = await asyncTestCaseStorage.getByIds(tcIds);
      const tcMap = new Map(testCases.map(tc => [tc.id, tc]));

      const resultRows: TestCaseResult[] = tcIds.map(tcId => {
        const runResult = bmRun.results[tcId];
        return {
          testCaseId: tcId,
          testCase: tcMap.get(tcId) || null,
          reportId: runResult?.reportId || null,
          status: getResultStatus(runResult),
        };
      });

      setResults(resultRows);

      // Auto-select first test case and expand it
      if (resultRows.length > 0 && !selectedTcId) {
        setSelectedTcId(resultRows[0].testCaseId);
        setExpandedTcs(new Set([resultRows[0].testCaseId]));
      }
    } catch (error) {
      console.error('Failed to load:', error);
    } finally {
      setLoading(false);
    }
  }, [benchmarkId, runId, navigate, selectedTcId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load report when selection changes
  useEffect(() => {
    if (!selectedTcId) { setSelectedReport(null); return; }
    const result = results.find(r => r.testCaseId === selectedTcId);
    if (!result?.reportId) { setSelectedReport(null); return; }

    setReportLoading(true);
    asyncRunStorage.getReportById(result.reportId)
      .then(report => setSelectedReport(report || null))
      .catch(() => setSelectedReport(null))
      .finally(() => setReportLoading(false));
  }, [selectedTcId, results]);

  // ─── Derived ─────────────────────────────────────────────────────────────

  const passCount = results.filter(r => r.status === 'passed').length;
  const failCount = results.filter(r => r.status === 'failed').length;
  const totalCount = results.length;
  const passRate = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 0;

  const selectedResult = results.find(r => r.testCaseId === selectedTcId) || null;

  const toggleExpand = (tcId: string) => {
    setExpandedTcs(prev => {
      const n = new Set(prev);
      n.has(tcId) ? n.delete(tcId) : n.add(tcId);
      return n;
    });
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading || !benchmark || !run) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-60" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-[calc(100vh-200px)] w-full" />
      </div>
    );
  }

  const agentName = DEFAULT_CONFIG.agents.find(a => a.key === run.agentKey)?.name || run.agentKey;
  const modelName = getModelName(run.modelId);

  return (
    <div className="h-full flex flex-col">
      {/* ── Top Summary Bar ────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b bg-card shrink-0">
        {/* Back + Breadcrumb title */}
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
          </Button>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <button
              className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate"
              onClick={() => navigate(`/evals3/benchmarks/${benchmarkId}/runs`)}
            >
              {benchmark.name}
            </button>
            <ChevronRight size={16} className="text-muted-foreground/50 shrink-0" />
            <h2 className="text-xl font-bold truncate">{run.name}</h2>
          </div>
        </div>

        {/* Metadata row — badge + all key info */}
        <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap ml-10">
          <Badge className="text-[10px] px-2 py-0.5 bg-muted text-muted-foreground border-border font-medium uppercase tracking-widest rounded shrink-0">
            Evaluation Run
          </Badge>
          <span className="flex items-center gap-1"><Calendar size={11} /> {formatDate(run.createdAt)}</span>
          <span className="text-muted-foreground/30">·</span>
          <span>Agent: <span className="text-foreground">{agentName}</span></span>
          <span className="text-muted-foreground/30">·</span>
          <span>Model: <span className="text-foreground">{modelName}</span></span>
          <span className="text-muted-foreground/30">·</span>
          <span className="flex items-center gap-1.5">
            <span className="text-green-500 font-medium">{passCount}✓</span>
            <span className="text-red-500 font-medium">{failCount}✗</span>
            <span>/ {totalCount}</span>
          </span>
          <span className="text-muted-foreground/30">·</span>
          <span className={`font-medium ${passRate >= 80 ? 'text-green-500' : passRate >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
            {passRate}% pass rate
          </span>
        </div>
      </div>

      {/* ── Main Content: Left Panel + Right Panel ─────────────────── */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* ── Left Panel: Test Case List ──────────────────────────── */}
        <ResizablePanel defaultSize={35} minSize={25} maxSize={50} className="border-r">
          <ScrollArea className="h-full">
            <div className="px-3 pt-2 pb-1 border-b">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Test Cases</span>
                <span className="text-[10px] text-muted-foreground">{results.length}</span>
              </div>
            </div>
            <div className="p-2 space-y-0.5">
              {results.map(r => {
                const isSelected = r.testCaseId === selectedTcId;
                const isExpanded = expandedTcs.has(r.testCaseId);
                const tc = r.testCase;

                return (
                  <div key={r.testCaseId}>
                    {/* Test case row */}
                    <div
                      className={`flex items-start gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-colors ${
                        isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50 border border-transparent'
                      }`}
                      onClick={() => setSelectedTcId(r.testCaseId)}
                    >
                      {/* Expand toggle */}
                      <button
                        className="p-0.5 rounded hover:bg-muted text-muted-foreground shrink-0 mt-0.5"
                        onClick={e => { e.stopPropagation(); toggleExpand(r.testCaseId); }}
                      >
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </button>

                      <div className="shrink-0 mt-0.5">
                        <StatusIcon status={r.status} size={14} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-medium leading-snug break-words ${isSelected ? 'text-foreground' : ''}`}>
                          {tc?.name || r.testCaseId}
                        </div>
                        {tc?.labels && tc.labels.length > 0 && (
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            {tc.labels.slice(0, 2).map(l => (
                              <Badge key={l} variant="outline" className={`text-[7px] px-1 py-0 ${getLabelColor(l)}`}>{l}</Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      <span className={`text-[10px] font-semibold shrink-0 mt-0.5 ${
                        r.status === 'passed' ? 'text-green-500' : r.status === 'failed' ? 'text-red-500' : 'text-muted-foreground'
                      }`}>
                        {r.status === 'passed' ? 'PASS' : r.status === 'failed' ? 'FAIL' : r.status.toUpperCase()}
                      </span>
                    </div>

                    {/* Inline expand: input + expected output */}
                    {isExpanded && tc && (
                      <div className="ml-7 mr-1 mb-1 mt-0.5 space-y-1.5 overflow-hidden">
                        {/* Input prompt */}
                        <div>
                          <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Input</div>
                          <div className="text-[10px] bg-muted/40 rounded px-2 py-1.5 border border-border max-h-16 overflow-y-auto break-words leading-relaxed">
                            {tc.initialPrompt || '—'}
                          </div>
                        </div>
                        {/* Expected outcomes */}
                        {tc.expectedOutcomes && tc.expectedOutcomes.length > 0 && (
                          <div>
                            <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Expected</div>
                            <ul className="space-y-0.5">
                              {tc.expectedOutcomes.map((o, i) => (
                                <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1 leading-snug">
                                  <CheckCircle2 size={9} className="text-green-500 mt-0.5 shrink-0" />
                                  <span className="break-words min-w-0">{o}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {/* Context count */}
                        {tc.context && tc.context.length > 0 && (
                          <div className="text-[10px] text-muted-foreground">{tc.context.length} context item{tc.context.length !== 1 ? 's' : ''}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* ── Right Panel: Test Case Inspector ────────────────────── */}
        <ResizablePanel defaultSize={65} minSize={50}>
          {selectedResult ? (
            reportLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : selectedReport ? (
              <TestCaseInspectorPanel
                report={selectedReport}
                testCase={selectedResult.testCase}
                status={selectedResult.status}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  {selectedResult.status === 'running' ? (
                    <><Loader2 size={32} className="mx-auto mb-3 text-blue-600 dark:text-blue-400 animate-spin" /><p className="text-sm">Running...</p></>
                  ) : selectedResult.status === 'pending' ? (
                    <><Clock size={32} className="mx-auto mb-3 text-amber-600 dark:text-amber-400" /><p className="text-sm">Pending</p></>
                  ) : (
                    <><XCircle size={32} className="mx-auto mb-3 opacity-20" /><p className="text-sm">No report available</p></>
                  )}
                </div>
              </div>
            )
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-sm">Select a test case to inspect</p>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};
