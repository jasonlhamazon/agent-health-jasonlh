/*
 * ComparePage — Diff-First Compare View (Option A)
 *
 * Leads with what changed between runs. Think "git diff for eval runs."
 * - Top: benchmark selector + run picker
 * - Change summary strip: regressions / improvements / unchanged (clickable filters)
 * - Compact run summary bar (not full cards)
 * - Diff table: only changed rows by default, toggle to show all
 * - Each row: clear ↑↓= indicator with delta prominently displayed
 *
 * Route: /evaluations/compare
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  GitCompare, ChevronDown, ChevronRight, CheckCircle2, XCircle,
  TrendingDown, TrendingUp, Minus, ArrowRightLeft, Eye, EyeOff,
  ArrowLeft, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { TooltipProvider } from '@/components/ui/tooltip';
import { asyncBenchmarkStorage, asyncRunStorage } from '@/services/storage';
import {
  calculateRunAggregates,
  buildTestCaseComparisonRows,
  getRealTestCaseMeta,
  countRowsByStatus,
  calculateRowStatus,
  RowStatus,
} from '@/services/comparisonService';
import { DEFAULT_CONFIG } from '@/lib/constants';
import { formatRelativeTime, getModelName } from '@/lib/utils';
import type {
  Benchmark, BenchmarkRun, EvaluationReport,
  RunAggregateMetrics, TestCaseComparisonRow,
} from '@/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getAgentName = (key: string) =>
  DEFAULT_CONFIG.agents.find(a => a.key === key)?.name || key;

type DiffFilter = 'all' | RowStatus;


// ─── Sub-components ──────────────────────────────────────────────────────────

/** Compact run bar — one row per run showing key stats */
function RunBar({ agg, isBaseline }: { agg: RunAggregateMetrics; isBaseline: boolean }) {
  return (
    <div className={`flex items-center gap-4 px-4 py-2 rounded-lg border text-xs ${
      isBaseline ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'
    }`}>
      {isBaseline && (
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/40 text-primary">
          Baseline
        </Badge>
      )}
      <span className="font-medium truncate max-w-[180px]">{agg.runName}</span>
      <span className="text-muted-foreground">{getAgentName(agg.agentKey)}</span>
      <span className="text-muted-foreground">{getModelName(agg.modelId)}</span>
      <span className="text-muted-foreground">{formatRelativeTime(agg.createdAt)}</span>
      <div className="ml-auto flex items-center gap-3">
        <span>
          <span className="text-green-500 font-medium">{agg.passedCount}</span>
          <span className="text-muted-foreground"> / </span>
          <span className="text-red-500 font-medium">{agg.failedCount}</span>
          <span className="text-muted-foreground"> / {agg.totalTestCases}</span>
        </span>
        <span className="font-medium">{agg.passRatePercent}%</span>
        <span className="text-muted-foreground">Acc {agg.avgAccuracy}%</span>
      </div>
    </div>
  );
}

/** Change summary strip — clickable chips */
function ChangeSummary({
  counts,
  activeFilter,
  onFilterClick,
}: {
  counts: Record<RowStatus, number>;
  activeFilter: DiffFilter;
  onFilterClick: (f: DiffFilter) => void;
}) {
  const total = counts.regression + counts.improvement + counts.mixed + counts.neutral;
  const items: Array<{
    key: DiffFilter;
    label: string;
    count: number;
    icon: React.ReactNode;
    color: string;
    activeColor: string;
  }> = [
    { key: 'all', label: 'All', count: total, icon: null, color: '', activeColor: 'bg-primary/20 border-primary text-primary' },
    { key: 'regression', label: 'Regressions', count: counts.regression, icon: <TrendingDown size={12} />, color: 'text-red-400', activeColor: 'bg-red-500/10 border-red-500/30 text-red-400' },
    { key: 'improvement', label: 'Improvements', count: counts.improvement, icon: <TrendingUp size={12} />, color: 'text-blue-400', activeColor: 'bg-blue-500/10 border-blue-500/30 text-blue-400' },
    { key: 'mixed', label: 'Mixed', count: counts.mixed, icon: <ArrowRightLeft size={12} />, color: 'text-amber-400', activeColor: 'bg-amber-500/10 border-amber-500/30 text-amber-400' },
    { key: 'neutral', label: 'Unchanged', count: counts.neutral, icon: <Minus size={12} />, color: 'text-muted-foreground', activeColor: 'bg-muted border-muted text-muted-foreground' },
  ];

  return (
    <div className="flex items-center gap-2">
      {items.map(item => (
        <button
          key={item.key}
          onClick={() => onFilterClick(item.key)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
            activeFilter === item.key ? item.activeColor : 'border-border hover:bg-muted/50 text-muted-foreground'
          }`}
        >
          {item.icon && <span className={activeFilter === item.key ? '' : item.color}>{item.icon}</span>}
          {item.label}
          <span className="opacity-70">({item.count})</span>
        </button>
      ))}
    </div>
  );
}


/** Delta indicator — shows ↑↓= with value */
function DeltaIndicator({ value, baseline }: { value?: number; baseline?: number }) {
  if (value === undefined || baseline === undefined) return <span className="text-muted-foreground">—</span>;
  const delta = value - baseline;
  if (delta === 0) return <span className="text-muted-foreground text-xs">=</span>;
  const isPositive = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPositive ? 'text-blue-500' : 'text-red-400'}`}>
      {isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {isPositive ? '+' : ''}{delta}
    </span>
  );
}

/** Single diff row for a test case */
function DiffRow({
  row,
  runs,
  baselineRunId,
  rowStatus,
  isExpanded,
  onToggle,
}: {
  row: TestCaseComparisonRow;
  runs: BenchmarkRun[];
  baselineRunId: string;
  rowStatus: RowStatus;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const baselineResult = row.results[baselineRunId];
  const statusStyles: Record<RowStatus, string> = {
    regression: 'border-l-4 border-l-red-500/50',
    improvement: 'border-l-4 border-l-blue-500/50',
    mixed: 'border-l-4 border-l-amber-500/50',
    neutral: 'border-l-4 border-l-transparent',
  };
  const statusIcons: Record<RowStatus, React.ReactNode> = {
    regression: <TrendingDown size={13} className="text-red-400" />,
    improvement: <TrendingUp size={13} className="text-blue-500" />,
    mixed: <ArrowRightLeft size={13} className="text-amber-400" />,
    neutral: <Minus size={13} className="text-muted-foreground" />,
  };

  return (
    <>
      <tr
        className={`border-b hover:bg-muted/30 cursor-pointer transition-colors ${statusStyles[rowStatus]}`}
        onClick={onToggle}
      >
        {/* Status icon */}
        <td className="px-3 py-2.5 w-8 text-center">{statusIcons[rowStatus]}</td>
        {/* Test case name */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
            <span className="text-sm font-medium truncate max-w-[240px]">{row.testCaseName}</span>
            {row.labels?.slice(0, 2).map(l => (
              <Badge key={l} variant="outline" className="text-[9px] px-1 py-0">{l}</Badge>
            ))}
          </div>
        </td>
        {/* Per-run results */}
        {runs.map(run => {
          const result = row.results[run.id];
          const isBaseline = run.id === baselineRunId;
          if (!result || result.status === 'missing') {
            return <td key={run.id} className="px-3 py-2.5 text-center text-xs text-muted-foreground">—</td>;
          }
          const isPassed = result.passFailStatus === 'passed';
          return (
            <td key={run.id} className="px-3 py-2.5 text-center">
              <div className="flex flex-col items-center gap-0.5">
                <div className={`inline-flex items-center gap-1 text-xs font-medium ${isPassed ? 'text-green-500' : 'text-red-400'}`}>
                  {isPassed ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  {result.accuracy ?? 0}%
                </div>
                {!isBaseline && (
                  <DeltaIndicator value={result.accuracy} baseline={baselineResult?.accuracy} />
                )}
                {isBaseline && <span className="text-[9px] text-muted-foreground">baseline</span>}
              </div>
            </td>
          );
        })}
      </tr>
      {/* Expanded detail */}
      {isExpanded && (
        <tr className="bg-muted/20">
          <td colSpan={2 + runs.length} className="px-6 py-3">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 text-xs">
              {runs.map(run => {
                const result = row.results[run.id];
                if (!result || result.status === 'missing') return null;
                const isBaseline = run.id === baselineRunId;
                return (
                  <div key={run.id} className={`p-3 rounded-lg border ${isBaseline ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'}`}>
                    <div className="font-medium mb-2 truncate">{run.name}</div>
                    <div className="space-y-1 text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Status</span>
                        <span className={result.passFailStatus === 'passed' ? 'text-green-500' : 'text-red-400'}>
                          {result.passFailStatus === 'passed' ? 'Passed' : 'Failed'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Accuracy</span>
                        <span className="text-foreground">{result.accuracy ?? 0}%</span>
                      </div>
                      {result.testCaseVersion && (
                        <div className="flex justify-between">
                          <span>Version</span>
                          <span className="text-foreground">{result.testCaseVersion}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}


// ─── Main Component ──────────────────────────────────────────────────────────

export const ComparePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Data
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<Record<string, EvaluationReport>>({});
  const [reportsLoading, setReportsLoading] = useState(false);

  // Selection
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState<string>('');
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);

  // View state
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all');
  const [showUnchanged, setShowUnchanged] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Load all benchmarks
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const bms = await asyncBenchmarkStorage.getAll();
        setBenchmarks(bms);

        // Initialize from URL params
        const urlBm = searchParams.get('benchmark');
        const urlRuns = searchParams.get('runs')?.split(',').filter(Boolean) || [];

        // Helper: pick the last 2 runs by date from a benchmark
        const pickLastTwoRuns = (bm: Benchmark) => {
          const sorted = [...(bm.runs || [])].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          return sorted.slice(0, 2).map(r => r.id);
        };

        if (urlBm && bms.some(b => b.id === urlBm)) {
          setSelectedBenchmarkId(urlBm);
          const bm = bms.find(b => b.id === urlBm)!;
          const validRuns = urlRuns.filter(id => bm.runs.some(r => r.id === id));
          setSelectedRunIds(validRuns.length >= 2 ? validRuns : pickLastTwoRuns(bm));
        } else if (bms.length > 0) {
          // Default: benchmark with the most recent run, last 2 runs selected
          const sorted = [...bms]
            .filter(b => (b.runs?.length || 0) >= 2)
            .sort((a, b) => {
              const latestA = Math.max(...(a.runs || []).map(r => new Date(r.createdAt).getTime()));
              const latestB = Math.max(...(b.runs || []).map(r => new Date(r.createdAt).getTime()));
              return latestB - latestA;
            });
          const defaultBm = sorted[0] || bms.find(b => (b.runs?.length || 0) >= 2) || bms[0];
          setSelectedBenchmarkId(defaultBm.id);
          setSelectedRunIds(pickLastTwoRuns(defaultBm));
        }
      } catch (err) {
        console.error('Failed to load benchmarks:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Current benchmark
  const benchmark = useMemo(
    () => benchmarks.find(b => b.id === selectedBenchmarkId) || null,
    [benchmarks, selectedBenchmarkId]
  );

  // Load reports when benchmark/runs change
  useEffect(() => {
    if (!benchmark) return;
    (async () => {
      setReportsLoading(true);
      const reportIds = new Set<string>();
      for (const run of benchmark.runs) {
        if (!selectedRunIds.includes(run.id)) continue;
        Object.values(run.results || {}).forEach(r => {
          if (r.reportId) reportIds.add(r.reportId);
        });
      }
      const map: Record<string, EvaluationReport> = {};
      await Promise.all(
        Array.from(reportIds).map(async id => {
          const report = await asyncRunStorage.getReportById(id);
          if (report) map[id] = report;
        })
      );
      setReports(map);
      setReportsLoading(false);
    })();
  }, [benchmark, selectedRunIds]);

  // Update URL when selection changes
  const updateUrl = useCallback((bmId: string, runIds: string[]) => {
    const params: Record<string, string> = {};
    if (bmId) params.benchmark = bmId;
    if (runIds.length > 0) params.runs = runIds.join(',');
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  // Handle benchmark change
  const handleBenchmarkChange = (bmId: string) => {
    setSelectedBenchmarkId(bmId);
    const bm = benchmarks.find(b => b.id === bmId);
    // Default to last 2 runs by date
    const sorted = [...(bm?.runs || [])].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const newRunIds = sorted.slice(0, 2).map(r => r.id);
    setSelectedRunIds(newRunIds);
    setDiffFilter('all');
    setExpandedRows(new Set());
    updateUrl(bmId, newRunIds);
  };

  // Toggle run selection
  const toggleRun = (runId: string) => {
    setSelectedRunIds(prev => {
      const next = prev.includes(runId)
        ? prev.filter(id => id !== runId)
        : [...prev, runId];
      if (next.length < 2 && next.length < prev.length) return prev; // keep min 2
      updateUrl(selectedBenchmarkId, next);
      return next;
    });
  };

  // Selected runs
  const selectedRuns = useMemo(
    () => (benchmark?.runs || []).filter(r => selectedRunIds.includes(r.id)),
    [benchmark, selectedRunIds]
  );

  // Aggregates
  const runAggregates = useMemo(
    () => selectedRuns.map(run => calculateRunAggregates(run, reports)),
    [selectedRuns, reports]
  );

  // Baseline = oldest selected run
  const baselineRunId = useMemo(() => {
    const sorted = [...selectedRuns].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    return sorted[0]?.id ?? '';
  }, [selectedRuns]);

  // Comparison rows
  const allRows = useMemo(
    () => buildTestCaseComparisonRows(selectedRuns, reports, getRealTestCaseMeta),
    [selectedRuns, reports]
  );

  // Status counts
  const statusCounts = useMemo(
    () => countRowsByStatus(allRows, baselineRunId),
    [allRows, baselineRunId]
  );

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (diffFilter === 'all') {
      return showUnchanged ? allRows : allRows.filter(r => calculateRowStatus(r, baselineRunId) !== 'neutral');
    }
    return allRows.filter(r => calculateRowStatus(r, baselineRunId) === diffFilter);
  }, [allRows, diffFilter, showUnchanged, baselineRunId]);

  const toggleExpand = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="p-4 h-full flex flex-col">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
              <ArrowLeft size={16} />
            </Button>
            <GitCompare className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-xl font-bold">Compare Runs</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Diff-first comparison across benchmark runs</p>
            </div>
          </div>
        </div>

        {/* ── Benchmark + Run Selector ───────────────────────────── */}
        <div className="flex items-start gap-4 mb-4 p-4 rounded-lg border border-border bg-card">
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Benchmark</label>
            <Select value={selectedBenchmarkId} onValueChange={handleBenchmarkChange}>
              <SelectTrigger className="w-[260px] h-8 text-xs">
                <SelectValue placeholder="Select benchmark" />
              </SelectTrigger>
              <SelectContent>
                {benchmarks.map(bm => (
                  <SelectItem key={bm.id} value={bm.id}>
                    <div className="flex items-center gap-2">
                      <span>{bm.name}</span>
                      <span className="text-[10px] text-muted-foreground">({bm.runs?.length || 0} runs)</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Runs to compare ({selectedRunIds.length} selected)
            </label>
            <div className="flex flex-wrap gap-3">
              {(benchmark?.runs || []).map(run => {
                const isSelected = selectedRunIds.includes(run.id);
                const canDeselect = selectedRunIds.length > 2;
                return (
                  <div key={run.id} className="flex items-center gap-1.5">
                    <Checkbox
                      id={`run-${run.id}`}
                      checked={isSelected}
                      onCheckedChange={() => toggleRun(run.id)}
                      disabled={isSelected && !canDeselect}
                      className="h-3.5 w-3.5"
                    />
                    <Label htmlFor={`run-${run.id}`} className="text-xs cursor-pointer">
                      {run.name}
                    </Label>
                  </div>
                );
              })}
            </div>
            {selectedRunIds.length <= 2 && (
              <p className="text-[10px] text-muted-foreground">At least 2 runs must be selected</p>
            )}
          </div>
        </div>

        {/* ── Content (needs 2+ runs) ────────────────────────────── */}
        {selectedRuns.length >= 2 && !reportsLoading ? (
          <>
            {/* Compact run bars */}
            <div className="space-y-1.5 mb-4">
              {runAggregates.map(agg => (
                <RunBar key={agg.runId} agg={agg} isBaseline={agg.runId === baselineRunId} />
              ))}
            </div>

            {/* Change summary strip */}
            <div className="flex items-center justify-between mb-4">
              <ChangeSummary counts={statusCounts} activeFilter={diffFilter} onFilterClick={setDiffFilter} />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowUnchanged(!showUnchanged)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs transition-colors ${
                    showUnchanged ? 'border-border text-muted-foreground hover:bg-muted/50' : 'border-primary/30 bg-primary/5 text-primary'
                  }`}
                >
                  {showUnchanged ? <Eye size={12} /> : <EyeOff size={12} />}
                  {showUnchanged ? 'Showing all' : 'Changes only'}
                </button>
              </div>
            </div>

            {/* Diff table */}
            <div className="flex-1 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="border-b">
                    <th className="h-8 w-8 px-3 bg-background border-b" />
                    <th className="h-8 px-3 text-left font-medium text-xs text-muted-foreground bg-background border-b">
                      Test Case
                    </th>
                    {selectedRuns.map(run => (
                      <th key={run.id} className="h-8 px-3 text-center font-medium text-xs text-muted-foreground bg-background border-b min-w-[120px]">
                        <div className="truncate">{run.name}</div>
                        {run.id === baselineRunId && (
                          <span className="text-[8px] text-primary font-normal">(baseline)</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={2 + selectedRuns.length} className="py-12 text-center text-sm text-muted-foreground">
                        {diffFilter !== 'all'
                          ? `No ${diffFilter} test cases found`
                          : 'No test cases to compare'}
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map(row => (
                      <DiffRow
                        key={row.testCaseId}
                        row={row}
                        runs={selectedRuns}
                        baselineRunId={baselineRunId}
                        rowStatus={calculateRowStatus(row, baselineRunId)}
                        isExpanded={expandedRows.has(row.testCaseId)}
                        onToggle={() => toggleExpand(row.testCaseId)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : reportsLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <GitCompare className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-sm">Select a benchmark with at least 2 runs to compare</p>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};
