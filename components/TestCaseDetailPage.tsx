/*
 * TestCaseDetailPage — Evals 2: Test Case drill-down (Option A)
 *
 * Layout:
 *   1. Entity card with "TEST CASE" type badge, name, labels, metadata
 *   2. Collapsible "Definition" section (prompt, expected outcomes, context)
 *   3. Full-width runs timeline with time filter
 *
 * Route: /evals2/test-cases/:testCaseId
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Play, Calendar, CheckCircle2, XCircle, Trash2, Pencil,
  Loader2, X, ChevronDown, ChevronRight, FileText, Clock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { asyncTestCaseStorage, asyncRunStorage } from '@/services/storage';
import { TestCase, EvaluationReport } from '@/types';
import { DEFAULT_CONFIG } from '@/lib/constants';
import { getLabelColor, formatDate, formatRelativeTime } from '@/lib/utils';
import { QuickRunModal } from './QuickRunModal';
import { TestCaseEditor } from './TestCaseEditor';

// ─── Time Filter ─────────────────────────────────────────────────────────────

type TimeRange = '1h' | '6h' | '1d' | '7d' | '30d' | 'all';
const TIME_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '1h', label: 'Last 1h' },
  { value: '6h', label: 'Last 6h' },
  { value: '1d', label: 'Last 1d' },
  { value: '7d', label: 'Last 7d' },
  { value: '30d', label: 'Last 30d' },
  { value: 'all', label: 'All time' },
];

function getTimeThreshold(range: TimeRange): Date | null {
  if (range === 'all') return null;
  const now = new Date();
  const ms: Record<string, number> = { '1h': 3600000, '6h': 21600000, '1d': 86400000, '7d': 604800000, '30d': 2592000000 };
  return new Date(now.getTime() - ms[range]);
}


// ─── Main Component ──────────────────────────────────────────────────────────

export const TestCaseDetailPage: React.FC = () => {
  const { testCaseId } = useParams<{ testCaseId: string }>();
  const navigate = useNavigate();

  const [testCase, setTestCase] = useState<TestCase | null>(null);
  const [runs, setRuns] = useState<EvaluationReport[]>([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // UI state
  const [definitionOpen, setDefinitionOpen] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [runningTestCase, setRunningTestCase] = useState<TestCase | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  // Delete state
  const [deleteState, setDeleteState] = useState<{
    isDeleting: boolean; deletingId: string | null;
    status: 'idle' | 'success' | 'error'; message: string;
  }>({ isDeleting: false, deletingId: null, status: 'idle', message: '' });

  const loadData = useCallback(async () => {
    if (!testCaseId) return;
    setIsLoading(true);
    try {
      const [tc, { reports, total }] = await Promise.all([
        asyncTestCaseStorage.getById(testCaseId),
        asyncRunStorage.getReportsByTestCase(testCaseId),
      ]);
      if (!tc) { navigate('/evals2/test-cases'); return; }
      setTestCase(tc);
      setRuns(reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      setTotalRuns(total);
    } catch (error) {
      console.error('Failed to load test case:', error);
    } finally {
      setIsLoading(false);
    }
  }, [testCaseId, navigate]);

  useEffect(() => { loadData(); }, [loadData]);

  // Time-filtered runs
  const filteredRuns = useMemo(() => {
    const threshold = getTimeThreshold(timeRange);
    if (!threshold) return runs;
    return runs.filter(r => new Date(r.timestamp) >= threshold);
  }, [runs, timeRange]);

  // Stats
  const passCount = filteredRuns.filter(r => r.passFailStatus === 'passed').length;
  const failCount = filteredRuns.filter(r => r.passFailStatus === 'failed').length;
  const passRate = filteredRuns.length > 0 ? Math.round((passCount / filteredRuns.length) * 100) : 0;

  const handleRunClick = (run: EvaluationReport) => navigate(`/runs/${run.id}`);

  const handleDeleteRun = async (run: EvaluationReport) => {
    if (!window.confirm(`Delete this run from ${formatDate(run.timestamp)}?`)) return;
    setDeleteState({ isDeleting: true, deletingId: run.id, status: 'idle', message: '' });
    try {
      const success = await asyncRunStorage.deleteReport(run.id);
      if (success) {
        setDeleteState({ isDeleting: false, deletingId: null, status: 'success', message: 'Run deleted' });
        setTimeout(() => setDeleteState(s => ({ ...s, status: 'idle', message: '' })), 3000);
        loadData();
      } else {
        setDeleteState({ isDeleting: false, deletingId: null, status: 'error', message: 'Failed to delete' });
      }
    } catch (error) {
      setDeleteState({ isDeleting: false, deletingId: null, status: 'error',
        message: `Error: ${error instanceof Error ? error.message : 'Unknown'}` });
    }
  };

  const loadMore = useCallback(async () => {
    if (!testCaseId || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const { reports } = await asyncRunStorage.getReportsByTestCase(testCaseId, { limit: 100, offset: runs.length });
      setRuns(prev => [...prev, ...reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())]);
    } catch (error) {
      console.error('Failed to load more:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [testCaseId, runs.length, isLoadingMore]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!testCase) return null;


  return (
    <div className="p-6 h-full overflow-y-auto">
      {/* ── Back + Actions ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/evals2/test-cases')} className="gap-1.5">
          <ArrowLeft size={16} /> Back to Test Cases
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowEditor(true)}>
            <Pencil size={14} className="mr-1" /> Edit
          </Button>
          <Button size="sm" onClick={() => setRunningTestCase(testCase)} className="bg-opensearch-blue hover:bg-blue-600">
            <Play size={14} className="mr-1" /> Run Test
          </Button>
        </div>
      </div>

      {/* ── Entity Card ────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card overflow-hidden mb-6">
        <div className="flex">
          {/* Colored left accent bar */}
          <div className="w-1.5 bg-blue-500 shrink-0" />
          <div className="flex-1 p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                {/* Type badge + name */}
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="text-[10px] px-1.5 py-0 bg-blue-500/15 text-blue-500 border-blue-500/30 font-semibold uppercase tracking-wider">
                    Test Case
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">v{testCase.currentVersion}</span>
                </div>
                <h1 className="text-xl font-bold mb-2">{testCase.name}</h1>
                {testCase.description && (
                  <p className="text-sm text-muted-foreground mb-3">{testCase.description}</p>
                )}
                {/* Labels */}
                {testCase.labels?.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mb-3">
                    {testCase.labels.map(label => (
                      <Badge key={label} variant="outline" className={`text-[10px] ${getLabelColor(label)}`}>{label}</Badge>
                    ))}
                  </div>
                )}
                {/* Metadata row */}
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar size={11} /> Created {formatDate(testCase.createdAt)}</span>
                  <span className="flex items-center gap-1"><Play size={11} /> {totalRuns} run{totalRuns !== 1 ? 's' : ''}</span>
                  {testCase.context?.length > 0 && <span>{testCase.context.length} context item{testCase.context.length !== 1 ? 's' : ''}</span>}
                  {testCase.tools?.length ? <span>{testCase.tools.length} tool{testCase.tools.length !== 1 ? 's' : ''}</span> : null}
                </div>
              </div>
              {/* Quick stats */}
              <div className="flex items-center gap-4 ml-4 shrink-0">
                <div className="text-center">
                  <div className="text-lg font-bold text-green-500">{passCount}</div>
                  <div className="text-[10px] text-muted-foreground">Passed</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red-500">{failCount}</div>
                  <div className="text-[10px] text-muted-foreground">Failed</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold">{passRate}%</div>
                  <div className="text-[10px] text-muted-foreground">Pass Rate</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Collapsible Definition ─────────────────────────────────── */}
      <div className="mb-6">
        <button
          onClick={() => setDefinitionOpen(!definitionOpen)}
          className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          {definitionOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="uppercase tracking-wider">Definition</span>
        </button>
        {definitionOpen && (
          <div className="space-y-4 pl-5 border-l-2 border-border ml-1">
            {/* Prompt */}
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Prompt</h4>
              <div className="bg-muted/30 rounded-md p-3 text-sm whitespace-pre-wrap border border-border">
                {testCase.initialPrompt}
              </div>
            </div>
            {/* Expected Outcomes */}
            {testCase.expectedOutcomes?.length > 0 && (
              <div>
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Expected Outcomes</h4>
                <ul className="space-y-1">
                  {testCase.expectedOutcomes.map((o, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <CheckCircle2 size={12} className="text-green-500 mt-0.5 shrink-0" />
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* Context */}
            {testCase.context?.length > 0 && (
              <div>
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Context ({testCase.context.length})</h4>
                <div className="space-y-2">
                  {testCase.context.map((ctx, i) => (
                    <div key={i} className="bg-muted/30 rounded-md p-2 border border-border">
                      <p className="text-[10px] font-medium text-muted-foreground mb-1">{ctx.description}</p>
                      <pre className="text-xs overflow-x-auto max-h-16 overflow-y-auto">{ctx.value.slice(0, 200)}{ctx.value.length > 200 ? '…' : ''}</pre>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Tools */}
            {testCase.tools?.length > 0 && (
              <div>
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Tools</h4>
                <div className="flex flex-wrap gap-1">
                  {testCase.tools.map((tool, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{tool.name}</Badge>
                  ))}
                </div>
              </div>
            )}
            {/* Expected PPL */}
            {testCase.expectedPPL && (
              <div>
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Expected PPL</h4>
                <pre className="bg-muted/30 rounded-md p-2 text-xs overflow-x-auto border border-border">{testCase.expectedPPL}</pre>
              </div>
            )}
          </div>
        )}
      </div>


      {/* ── Runs Timeline ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Runs ({filteredRuns.length})
          </h3>
          <select
            value={timeRange}
            onChange={e => setTimeRange(e.target.value as TimeRange)}
            className="text-xs px-2 py-1.5 bg-background border border-border rounded-md"
          >
            {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Delete feedback */}
        {deleteState.message && (
          <div className={`flex items-center gap-2 text-sm mb-3 p-3 rounded-lg ${
            deleteState.status === 'success'
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            {deleteState.status === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            <span>{deleteState.message}</span>
            {deleteState.status === 'error' && (
              <Button variant="ghost" size="sm" onClick={() => setDeleteState(s => ({ ...s, status: 'idle', message: '' }))} className="ml-auto h-6 px-2">
                <X size={14} />
              </Button>
            )}
          </div>
        )}

        {filteredRuns.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText size={40} className="mb-3 opacity-20" />
              <p className="text-sm font-medium">
                {timeRange === 'all' ? 'No runs yet' : `No runs in ${TIME_OPTIONS.find(o => o.value === timeRange)?.label}`}
              </p>
              <p className="text-xs mb-3">Run this test case to see results</p>
              <Button size="sm" onClick={() => setRunningTestCase(testCase)} className="bg-opensearch-blue hover:bg-blue-600">
                <Play size={14} className="mr-1" /> Run Test
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            {/* Column headers */}
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              <span className="w-8 shrink-0" />
              <span className="w-20 shrink-0">Result</span>
              <span className="flex-1 min-w-0">Details</span>
              <span className="w-20 shrink-0 text-right">Accuracy</span>
              <span className="w-20 shrink-0 text-right">Faithfulness</span>
              <span className="w-8 shrink-0" />
            </div>
            {filteredRuns.map((run, index) => {
              const isPassed = run.passFailStatus === 'passed';
              const isLatest = index === 0;
              const modelName = DEFAULT_CONFIG.models[run.modelName]?.display_name || run.modelName;
              return (
                <div
                  key={run.id}
                  className="group flex items-center gap-2 px-3 py-3 border-b border-border/40 hover:bg-muted/20 cursor-pointer transition-colors"
                  onClick={() => handleRunClick(run)}
                >
                  {/* Status icon */}
                  <div className="w-8 shrink-0 flex justify-center">
                    <div className={`p-1 rounded-full ${isPassed ? 'bg-green-500/15' : 'bg-red-500/15'}`}>
                      {isPassed
                        ? <CheckCircle2 size={14} className="text-green-500" />
                        : <XCircle size={14} className="text-red-500" />}
                    </div>
                  </div>
                  {/* Result label */}
                  <div className="w-20 shrink-0">
                    <span className={`text-xs font-semibold ${isPassed ? 'text-green-500' : 'text-red-500'}`}>
                      {isPassed ? 'PASSED' : 'FAILED'}
                    </span>
                    {isLatest && (
                      <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0 bg-blue-500/10 text-blue-400 border-blue-500/30">
                        Latest
                      </Badge>
                    )}
                  </div>
                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar size={11} />{formatRelativeTime(run.timestamp)}</span>
                      <span>Model: {modelName}</span>
                      <span>Agent: {run.agentName}</span>
                    </div>
                  </div>
                  {/* Accuracy */}
                  <div className="w-20 shrink-0 text-right">
                    <span className="text-sm font-semibold text-blue-400">{run.metrics.accuracy}%</span>
                  </div>
                  {/* Faithfulness */}
                  <div className="w-20 shrink-0 text-right">
                    <span className="text-sm font-semibold text-blue-300">{run.metrics.faithfulness ?? '—'}%</span>
                  </div>
                  {/* Delete */}
                  <div className="w-8 shrink-0 flex justify-center">
                    <Button
                      variant="ghost" size="icon"
                      onClick={e => { e.stopPropagation(); handleDeleteRun(run); }}
                      disabled={deleteState.isDeleting && deleteState.deletingId === run.id}
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      {deleteState.isDeleting && deleteState.deletingId === run.id
                        ? <Loader2 size={12} className="animate-spin" />
                        : <Trash2 size={12} />}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Load more */}
        {runs.length < totalRuns && !isLoadingMore && (
          <div className="flex justify-center pt-4">
            <Button variant="outline" size="sm" onClick={loadMore}>Load More</Button>
          </div>
        )}
        {isLoadingMore && (
          <div className="flex justify-center pt-4">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

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
