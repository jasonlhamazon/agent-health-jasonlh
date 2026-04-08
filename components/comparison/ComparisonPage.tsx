/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { GitCompare, ArrowLeft, ChevronDown, ChevronRight, X, Check, Eye } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { RunSummaryTable } from './RunSummaryTable';
import { AggregateMetricsChart } from './AggregateMetricsChart';
import { MetricsTimeSeriesChart } from './MetricsTimeSeriesChart';
import { UseCaseComparisonTable } from './UseCaseComparisonTable';
import { EvaluatorType } from './MetricCell';
import { asyncBenchmarkStorage, asyncRunStorage, asyncTestCaseStorage } from '@/services/storage';
import {
  calculateRunAggregates,
  buildTestCaseComparisonRows,
  filterRowsByCategory,
  filterRowsByStatus,
  getRealTestCaseMeta,
  countRowsByStatus,
  calculateRowStatus,
  collectRunIdsFromReports,
  RowStatus,
} from '@/services/comparisonService';
import { fetchBatchMetrics } from '@/services/metrics';
import { DEFAULT_CONFIG } from '@/lib/constants';
import { formatRelativeTime, getModelName } from '@/lib/utils';
import { Category, Benchmark, BenchmarkRun, EvaluationReport, RunAggregateMetrics, TestCaseComparisonRow, TraceMetrics, TestCase } from '@/types';

type StatusFilter = 'all' | 'passed' | 'failed' | 'mixed';

const getAgentName = (key: string) =>
  DEFAULT_CONFIG.agents.find(a => a.key === key)?.name || key;


// ─── Run Multi-Select Dropdown ───────────────────────────────────────────────

function RunMultiSelect({
  runs,
  selectedIds,
  onToggle,
  onSelectAll,
}: {
  runs: BenchmarkRun[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedCount = selectedIds.length;
  const allSelected = selectedCount === runs.length;

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-2 text-xs font-normal w-[280px] justify-between">
            <span>{selectedCount} of {runs.length} runs selected</span>
            <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] p-0" align="start">
          <div className="p-2 border-b flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Select runs to compare</span>
            <button
              onClick={() => onSelectAll(allSelected ? [] : runs.map(r => r.id))}
              className="text-[10px] text-primary hover:underline"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="max-h-[240px] overflow-y-auto p-1">
            {runs.map(run => {
              const isSelected = selectedIds.includes(run.id);
              const canDeselect = selectedIds.length > 2;
              return (
                <button
                  key={run.id}
                  onClick={() => {
                    if (isSelected && !canDeselect) return;
                    onToggle(run.id);
                  }}
                  disabled={isSelected && !canDeselect}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted/50 transition-colors text-left ${
                    isSelected ? 'bg-primary/5' : ''
                  } ${isSelected && !canDeselect ? 'opacity-60' : ''}`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40'
                  }`}>
                    {isSelected && <Check size={10} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{run.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {getAgentName(run.agentKey)} · {getModelName(run.modelId)} · {formatRelativeTime(run.createdAt)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {selectedIds.length <= 2 && (
            <div className="p-2 border-t text-[10px] text-muted-foreground">Min 2 runs required</div>
          )}
        </PopoverContent>
      </Popover>

      {/* Selected run badges */}
      <div className="flex flex-wrap gap-1.5">
        {runs.filter(r => selectedIds.includes(r.id)).map(run => (
          <Badge
            key={run.id}
            variant="secondary"
            className="text-[10px] gap-1 px-2 py-0.5 font-normal"
          >
            {run.name}
            {selectedIds.length > 2 && (
              <button
                onClick={() => onToggle(run.id)}
                className="hover:text-foreground ml-0.5"
                aria-label={`Remove ${run.name}`}
              >
                <X size={10} />
              </button>
            )}
          </Badge>
        ))}
      </div>
    </div>
  );
}


// ─── Main Component ──────────────────────────────────────────────────────────

export const ComparisonPage: React.FC = () => {
  const { benchmarkId } = useParams<{ benchmarkId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // All benchmarks for the selector
  const [allBenchmarks, setAllBenchmarks] = useState<Benchmark[]>([]);

  // All test cases for name lookup
  const [allTestCases, setAllTestCases] = useState<TestCase[]>([]);

  // State for benchmark and data
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [allRuns, setAllRuns] = useState<BenchmarkRun[]>([]);
  const [reports, setReports] = useState<Record<string, EvaluationReport>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [traceMetricsMap, setTraceMetricsMap] = useState<Map<string, TraceMetrics>>(new Map());

  // State for selected runs (initialized from URL)
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);

  // State for filters
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [rowStatusFilter, setRowStatusFilter] = useState<RowStatus | 'all'>('all');

  // Evaluator visibility
  const ALL_EVALUATORS: EvaluatorType[] = ['accuracy', 'faithfulness', 'trajectory', 'latency', 'annotations'];
  const [visibleEvaluators, setVisibleEvaluators] = useState<Set<EvaluatorType>>(new Set(ALL_EVALUATORS));
  const [evalPopoverOpen, setEvalPopoverOpen] = useState(false);

  // Load all benchmarks and test cases
  useEffect(() => {
    (async () => {
      try {
        const [bms, tcs] = await Promise.all([
          asyncBenchmarkStorage.getAll(),
          asyncTestCaseStorage.getAll(),
        ]);
        setAllBenchmarks(bms);
        setAllTestCases(tcs);
      } catch (err) {
        console.error('Failed to load benchmarks/test cases:', err);
      }
    })();
  }, []);

  // Helper: pick last 2 runs by date
  const pickLastTwoRuns = (runs: BenchmarkRun[]) => {
    const sorted = [...runs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sorted.slice(0, 2).map(r => r.id);
  };

  // Load benchmark data
  useEffect(() => {
    const loadBenchmark = async () => {
      if (!benchmarkId) {
        navigate('/benchmarks');
        return;
      }

      const bench = await asyncBenchmarkStorage.getById(benchmarkId);
      if (!bench) {
        navigate('/benchmarks');
        return;
      }

      const runs = bench.runs || [];

      const reportIds = new Set<string>();
      runs.forEach(run => {
        Object.values(run.results || {}).forEach(result => {
          if (result.reportId) reportIds.add(result.reportId);
        });
      });

      const reportsMap: Record<string, EvaluationReport> = {};
      await Promise.all(
        Array.from(reportIds).map(async (reportId) => {
          const report = await asyncRunStorage.getReportById(reportId);
          if (report) reportsMap[reportId] = report;
        })
      );

      setBenchmark(bench);
      setAllRuns(runs);
      setReports(reportsMap);

      // Initialize selected runs from URL or default to last 2
      const urlRunIds = searchParams.get('runs')?.split(',').filter(Boolean) || [];
      if (urlRunIds.length > 0) {
        const validRunIds = urlRunIds.filter(id => runs.some(r => r.id === id));
        setSelectedRunIds(validRunIds.length >= 2 ? validRunIds : pickLastTwoRuns(runs));
      } else {
        setSelectedRunIds(pickLastTwoRuns(runs));
      }

      setIsLoading(false);
    };

    loadBenchmark();
  }, [benchmarkId, navigate]);

  // Sync selectedRunIds when URL changes externally
  useEffect(() => {
    const urlRunIds = searchParams.get('runs')?.split(',').filter(Boolean) || [];
    if (urlRunIds.length > 0 && allRuns.length > 0) {
      const validRunIds = urlRunIds.filter(id => allRuns.some(r => r.id === id));
      if (validRunIds.length > 0 && validRunIds.join(',') !== selectedRunIds.join(',')) {
        setSelectedRunIds(validRunIds);
      }
    }
  }, [searchParams, allRuns, selectedRunIds]);

  // Fetch trace metrics
  useEffect(() => {
    const loadTraceMetrics = async () => {
      const runIds = collectRunIdsFromReports(allRuns, reports);
      if (runIds.length === 0) { setTraceMetricsMap(new Map()); return; }
      try {
        const { metrics } = await fetchBatchMetrics(runIds);
        const map = new Map<string, TraceMetrics>();
        metrics.forEach(m => { if (m.runId && !('error' in m)) map.set(m.runId, m as TraceMetrics); });
        setTraceMetricsMap(map);
      } catch (error) {
        console.warn('[ComparisonPage] Failed to fetch trace metrics:', error);
      }
    };
    if (allRuns.length > 0 && Object.keys(reports).length > 0) loadTraceMetrics();
  }, [allRuns, reports]);

  // Update URL when selection changes
  const updateSelection = (runIds: string[]) => {
    setSelectedRunIds(runIds);
    if (runIds.length > 0 && runIds.length < allRuns.length) {
      setSearchParams({ runs: runIds.join(',') }, { replace: true });
    } else if (runIds.length === allRuns.length) {
      setSearchParams({}, { replace: true });
    }
  };

  // Toggle run
  const toggleRun = (runId: string) => {
    const newSelection = selectedRunIds.includes(runId)
      ? selectedRunIds.filter(id => id !== runId)
      : [...selectedRunIds, runId];
    if (newSelection.length >= 2 || newSelection.length > selectedRunIds.length) {
      updateSelection(newSelection);
    }
  };

  // Handle benchmark change — navigate to new URL
  const handleBenchmarkChange = (newBmId: string) => {
    if (newBmId !== benchmarkId) {
      navigate(`/compare/${newBmId}`, { replace: true });
    }
  };

  const selectedRuns = useMemo((): BenchmarkRun[] => allRuns.filter(r => selectedRunIds.includes(r.id)), [allRuns, selectedRunIds]);

  const runAggregates = useMemo((): RunAggregateMetrics[] => {
    return selectedRuns.map(run => {
      const base = calculateRunAggregates(run, reports);
      let totalTokens = 0, totalInputTokens = 0, totalOutputTokens = 0, totalCostUsd = 0, totalDurationMs = 0, totalLlmCalls = 0, totalToolCalls = 0, mc = 0;
      for (const result of Object.values(run.results)) {
        const report = reports[result.reportId];
        if (report?.runId) {
          const tm = traceMetricsMap.get(report.runId);
          if (tm) { totalTokens += tm.totalTokens || 0; totalInputTokens += tm.inputTokens || 0; totalOutputTokens += tm.outputTokens || 0; totalCostUsd += tm.costUsd || 0; totalDurationMs += tm.durationMs || 0; totalLlmCalls += tm.llmCalls || 0; totalToolCalls += tm.toolCalls || 0; mc++; }
        }
      }
      return { ...base, totalTokens: mc > 0 ? totalTokens : undefined, totalInputTokens: mc > 0 ? totalInputTokens : undefined, totalOutputTokens: mc > 0 ? totalOutputTokens : undefined, totalCostUsd: mc > 0 ? totalCostUsd : undefined, avgDurationMs: mc > 0 ? Math.round(totalDurationMs / mc) : undefined, totalLlmCalls: mc > 0 ? totalLlmCalls : undefined, totalToolCalls: mc > 0 ? totalToolCalls : undefined };
    });
  }, [selectedRuns, reports, traceMetricsMap]);

  // Test case name lookup — checks loaded test cases first, falls back to getRealTestCaseMeta (static data)
  const getTestCaseMeta = useCallback((testCaseId: string) => {
    const tc = allTestCases.find(t => t.id === testCaseId);
    if (tc) {
      return {
        id: tc.id,
        name: tc.name,
        labels: tc.labels,
        category: tc.category,
        difficulty: tc.difficulty,
        version: `v${tc.currentVersion}`,
      };
    }
    return getRealTestCaseMeta(testCaseId);
  }, [allTestCases]);

  const allComparisonRows = useMemo((): TestCaseComparisonRow[] => buildTestCaseComparisonRows(selectedRuns, reports, getTestCaseMeta), [selectedRuns, reports, getTestCaseMeta]);

  // Detect which evaluators have data and auto-select them
  const evaluatorsWithData = useMemo((): Set<EvaluatorType> => {
    const found = new Set<EvaluatorType>();
    found.add('accuracy'); // always present
    for (const row of allComparisonRows) {
      for (const result of Object.values(row.results)) {
        if (result.faithfulness !== undefined) found.add('faithfulness');
        if (result.trajectoryAlignment !== undefined) found.add('trajectory');
        if (result.latencyScore !== undefined) found.add('latency');
      }
    }
    // Check annotations from reports
    for (const run of selectedRuns) {
      for (const res of Object.values(run.results)) {
        const report = reports[res.reportId];
        if (report?.annotations && report.annotations.length > 0) found.add('annotations');
      }
    }
    return found;
  }, [allComparisonRows, selectedRuns, reports]);

  // Auto-update visible evaluators when data changes (only pre-select ones with data)
  useEffect(() => {
    setVisibleEvaluators(new Set(evaluatorsWithData));
  }, [evaluatorsWithData]);

  const referenceRunId = useMemo(() => {
    const sorted = [...selectedRuns].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return sorted[0]?.id ?? '';
  }, [selectedRuns]);

  const rowStatusCounts = useMemo(() => countRowsByStatus(allComparisonRows, referenceRunId), [allComparisonRows, referenceRunId]);

  const filteredRows = useMemo((): TestCaseComparisonRow[] => {
    let rows = allComparisonRows;
    rows = filterRowsByCategory(rows, categoryFilter);
    rows = filterRowsByStatus(rows, statusFilter, selectedRunIds);
    if (rowStatusFilter !== 'all') rows = rows.filter(row => calculateRowStatus(row, referenceRunId) === rowStatusFilter);
    return rows;
  }, [allComparisonRows, categoryFilter, statusFilter, selectedRunIds, rowStatusFilter, referenceRunId]);

  const categories = useMemo(() => Array.from(new Set(allComparisonRows.map(r => r.category))).sort(), [allComparisonRows]);

  // Collapsible state
  const [summaryOpen, setSummaryOpen] = useState(false);

  if (isLoading) {
    return <div className="p-6 flex items-center justify-center h-full"><p className="text-muted-foreground">Loading...</p></div>;
  }

  if (!benchmark) {
    return <div className="p-6 flex items-center justify-center h-full"><p className="text-muted-foreground">Benchmark not found</p></div>;
  }

  return (
    <div className="h-full flex flex-col" data-testid="comparison-page">
      {/* ── Sticky Header + Toolbar ─────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background border-b border-border">
        {/* Title row */}
        <div className="flex items-center gap-3 px-4 py-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} data-testid="back-button" className="h-7 w-7">
            <ArrowLeft size={14} />
          </Button>
          <GitCompare className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold" data-testid="comparison-title">Compare Runs</h1>
        </div>

        {/* Selector toolbar — always visible, thin */}
        <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 border-t border-border/50">
          <Select value={benchmarkId || ''} onValueChange={handleBenchmarkChange}>
            <SelectTrigger className="w-[220px] h-7 text-xs"><SelectValue placeholder="Select benchmark" /></SelectTrigger>
            <SelectContent>
              {allBenchmarks.map(bm => (
                <SelectItem key={bm.id} value={bm.id}>
                  <span>{bm.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-1">({bm.runs?.length || 0})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="h-4 w-px bg-border" />

          <RunMultiSelect runs={allRuns} selectedIds={selectedRunIds} onToggle={toggleRun} onSelectAll={(ids) => updateSelection(ids.length >= 2 ? ids : pickLastTwoRuns(allRuns))} />
        </div>
      </div>

      {/* ── Scrollable Results Area ─────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {selectedRuns.length >= 2 ? (
          <div className="p-4 space-y-3">
            {/* Run Summary + Metrics — collapsible, collapsed by default */}
            <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 w-full text-left">
                  <ChevronRight size={14} className={`text-muted-foreground transition-transform ${summaryOpen ? 'rotate-90' : ''}`} />
                  <span className="text-xs font-medium text-muted-foreground">Run Summary & Metrics</span>
                  {!summaryOpen && (
                    <span className="text-[10px] text-muted-foreground ml-1">
                      {runAggregates.map(a => `${a.runName}: ${a.passRatePercent}%`).join(' · ')}
                    </span>
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 mt-2">
                <RunSummaryTable runs={runAggregates} referenceRunId={referenceRunId} />
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="w-full md:w-[400px] flex-shrink-0">
                    <AggregateMetricsChart runs={runAggregates} height={240} referenceRunId={referenceRunId} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <MetricsTimeSeriesChart runs={runAggregates} height={240} />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* ── Results Section — primary content ──────────────── */}
            <section>
              {/* Results header with filters */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">Results</h2>
                  <span className="text-[10px] text-muted-foreground">{allComparisonRows.length} test cases</span>
                  {/* Inline status badges */}
                  <div className="flex items-center gap-1 ml-2">
                    <Badge
                      variant="outline"
                      className={`cursor-pointer text-[9px] px-1.5 py-0 transition-colors ${rowStatusFilter === 'all' ? 'bg-primary/20 border-primary text-primary' : 'hover:bg-muted'}`}
                      onClick={() => setRowStatusFilter('all')}
                    >
                      All
                    </Badge>
                    {rowStatusCounts.regression > 0 && (
                      <Badge variant="outline" className={`cursor-pointer text-[9px] px-1.5 py-0 border-red-500/30 ${rowStatusFilter === 'regression' ? 'bg-red-500/10 text-red-400' : 'hover:bg-red-500/5'}`} onClick={() => setRowStatusFilter('regression')}>
                        ↓{rowStatusCounts.regression}
                      </Badge>
                    )}
                    {rowStatusCounts.improvement > 0 && (
                      <Badge variant="outline" className={`cursor-pointer text-[9px] px-1.5 py-0 border-blue-500/30 ${rowStatusFilter === 'improvement' ? 'bg-blue-500/10 text-blue-400' : 'hover:bg-blue-500/5'}`} onClick={() => setRowStatusFilter('improvement')}>
                        ↑{rowStatusCounts.improvement}
                      </Badge>
                    )}
                    {rowStatusCounts.mixed > 0 && (
                      <Badge variant="outline" className={`cursor-pointer text-[9px] px-1.5 py-0 border-amber-500/30 ${rowStatusFilter === 'mixed' ? 'bg-amber-500/10 text-amber-400' : 'hover:bg-amber-500/5'}`} onClick={() => setRowStatusFilter('mixed')}>
                        ↔{rowStatusCounts.mixed}
                      </Badge>
                    )}
                    <Badge variant="outline" className={`cursor-pointer text-[9px] px-1.5 py-0 ${rowStatusFilter === 'neutral' ? 'bg-muted text-muted-foreground' : 'hover:bg-muted/50'}`} onClick={() => setRowStatusFilter('neutral')}>
                      ={rowStatusCounts.neutral}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as Category | 'all')}>
                    <SelectTrigger className="w-36 h-7 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                    <SelectTrigger className="w-28 h-7 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="passed">Passed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Popover open={evalPopoverOpen} onOpenChange={setEvalPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs font-normal">
                        <Eye size={11} />
                        Evaluators ({visibleEvaluators.size})
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-2" align="end">
                      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center justify-between">
                        <span>Show evaluators</span>
                        <button
                          onClick={() => setVisibleEvaluators(prev => prev.size === ALL_EVALUATORS.length ? new Set<EvaluatorType>() : new Set(ALL_EVALUATORS))}
                          className="text-[10px] text-primary hover:underline font-normal normal-case tracking-normal"
                        >
                          {visibleEvaluators.size === ALL_EVALUATORS.length ? 'Deselect all' : 'Select all'}
                        </button>
                      </div>
                      <div className="space-y-1">
                        {ALL_EVALUATORS.map(ev => {
                          const hasData = evaluatorsWithData.has(ev);
                          const isVisible = visibleEvaluators.has(ev);
                          const labels: Record<EvaluatorType, string> = { accuracy: 'Accuracy', faithfulness: 'Faithfulness', trajectory: 'Trajectory Alignment', latency: 'Latency Score', annotations: 'Human Annotations' };
                          return (
                            <label key={ev} className={`flex items-center gap-2 text-xs cursor-pointer px-1 py-0.5 rounded hover:bg-muted/50 ${!hasData ? 'opacity-40' : ''}`}>
                              <input type="checkbox" checked={isVisible} onChange={() => { setVisibleEvaluators(prev => { const n = new Set(prev); n.has(ev) ? n.delete(ev) : n.add(ev); return n; }); }} className="h-3 w-3 rounded" />
                              <span>{labels[ev]}</span>
                              {!hasData && <span className="text-[9px] text-muted-foreground ml-auto">no data</span>}
                            </label>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Comparison table */}
              <UseCaseComparisonTable rows={filteredRows} runs={selectedRuns} reports={reports} referenceRunId={referenceRunId} visibleEvaluators={visibleEvaluators} />
              {filteredRows.length === 0 && allComparisonRows.length > 0 && (
                <p className="text-sm text-muted-foreground text-center mt-3">No test cases match the current filters</p>
              )}
            </section>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-muted-foreground">
            <GitCompare className="h-10 w-10 mb-3 opacity-50" />
            <p className="text-sm">Select at least 2 runs to compare</p>
          </div>
        )}
      </div>
    </div>
  );
};
