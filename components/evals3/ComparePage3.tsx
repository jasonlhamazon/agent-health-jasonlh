/*
 * ComparePage3 — Matrix Heatmap Compare View (Option C)
 *
 * Rows = test cases, columns = runs, cells = colored heatmap squares.
 * - Green gradient for high accuracy, red for low/failures
 * - Group-by toggle: category/label or status (all-passed, has-regression, mixed)
 * - Hover tooltip with full details (accuracy, pass/fail, delta)
 * - Sparkline row at top showing pass rate per run
 * - Same benchmark/run selector + last-2-runs default
 *
 * Route: /evaluations/compare3
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  GitCompare, ArrowLeft, Loader2, Layers, List,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { asyncBenchmarkStorage, asyncRunStorage } from '@/services/storage';
import {
  calculateRunAggregates,
  buildTestCaseComparisonRows,
  getRealTestCaseMeta,
  calculateRowStatus,
  RowStatus,
} from '@/services/comparisonService';
import { DEFAULT_CONFIG } from '@/lib/constants';
import { formatRelativeTime, getModelName } from '@/lib/utils';
import type {
  Benchmark, BenchmarkRun, EvaluationReport,
  RunAggregateMetrics, TestCaseComparisonRow,
} from '@/types';

const getAgentName = (key: string) =>
  DEFAULT_CONFIG.agents.find(a => a.key === key)?.name || key;

type GroupBy = 'none' | 'category' | 'status';


// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Get heatmap color based on accuracy (0-100) or missing/failed */
function getHeatmapColor(accuracy: number | undefined, status?: string): string {
  if (!status || status === 'missing') return 'bg-muted border-border';
  if (status === 'failed' && (accuracy === undefined || accuracy === 0))
    return 'bg-red-500/80 border-red-600/50';
  if (accuracy === undefined) return 'bg-muted border-border';
  // Green gradient: 0-40 red, 40-70 amber, 70-90 light green, 90-100 bright green
  if (accuracy >= 90) return 'bg-green-500 border-green-600/50';
  if (accuracy >= 70) return 'bg-green-400/70 border-green-500/40';
  if (accuracy >= 50) return 'bg-amber-400/70 border-amber-500/40';
  if (accuracy >= 30) return 'bg-orange-400/70 border-orange-500/40';
  return 'bg-red-400/70 border-red-500/40';
}

/** Sparkline — tiny inline bar for pass rate */
function Sparkline({ values }: { values: number[] }) {
  const max = 100;
  return (
    <div className="flex items-end gap-px h-5">
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * 100);
        const color = v >= 80 ? 'bg-green-500' : v >= 50 ? 'bg-amber-500' : 'bg-red-400';
        return <div key={i} className={`w-3 rounded-t-sm ${color}`} style={{ height: `${h}%` }} />;
      })}
    </div>
  );
}

/** Status label for grouping */
const statusLabels: Record<RowStatus, string> = {
  regression: '↓ Regressions',
  improvement: '↑ Improvements',
  mixed: '↔ Mixed',
  neutral: '= Unchanged',
};


// ─── Main Component ──────────────────────────────────────────────────────────

export const ComparePage3: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<Record<string, EvaluationReport>>({});
  const [reportsLoading, setReportsLoading] = useState(false);
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState<string>('');
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');

  // Load benchmarks (same pattern as Compare 1/2)
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const bms = await asyncBenchmarkStorage.getAll();
        setBenchmarks(bms);
        const urlBm = searchParams.get('benchmark');
        const urlRuns = searchParams.get('runs')?.split(',').filter(Boolean) || [];
        const pickLastTwo = (bm: Benchmark) => {
          const sorted = [...(bm.runs || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          return sorted.slice(0, 2).map(r => r.id);
        };
        if (urlBm && bms.some(b => b.id === urlBm)) {
          setSelectedBenchmarkId(urlBm);
          const bm = bms.find(b => b.id === urlBm)!;
          const valid = urlRuns.filter(id => bm.runs.some(r => r.id === id));
          setSelectedRunIds(valid.length >= 2 ? valid : pickLastTwo(bm));
        } else if (bms.length > 0) {
          const sorted = [...bms].filter(b => (b.runs?.length || 0) >= 2)
            .sort((a, b) => Math.max(...(b.runs || []).map(r => new Date(r.createdAt).getTime())) - Math.max(...(a.runs || []).map(r => new Date(r.createdAt).getTime())));
          const def = sorted[0] || bms[0];
          setSelectedBenchmarkId(def.id);
          setSelectedRunIds(pickLastTwo(def));
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const benchmark = useMemo(() => benchmarks.find(b => b.id === selectedBenchmarkId) || null, [benchmarks, selectedBenchmarkId]);

  useEffect(() => {
    if (!benchmark) return;
    (async () => {
      setReportsLoading(true);
      const ids = new Set<string>();
      for (const run of benchmark.runs) {
        if (!selectedRunIds.includes(run.id)) continue;
        Object.values(run.results || {}).forEach(r => { if (r.reportId) ids.add(r.reportId); });
      }
      const map: Record<string, EvaluationReport> = {};
      await Promise.all(Array.from(ids).map(async id => {
        const rpt = await asyncRunStorage.getReportById(id);
        if (rpt) map[id] = rpt;
      }));
      setReports(map);
      setReportsLoading(false);
    })();
  }, [benchmark, selectedRunIds]);

  const updateUrl = useCallback((bmId: string, runIds: string[]) => {
    const p: Record<string, string> = {};
    if (bmId) p.benchmark = bmId;
    if (runIds.length > 0) p.runs = runIds.join(',');
    setSearchParams(p, { replace: true });
  }, [setSearchParams]);

  const handleBenchmarkChange = (bmId: string) => {
    setSelectedBenchmarkId(bmId);
    const bm = benchmarks.find(b => b.id === bmId);
    const sorted = [...(bm?.runs || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const ids = sorted.slice(0, 2).map(r => r.id);
    setSelectedRunIds(ids);
    updateUrl(bmId, ids);
  };

  const toggleRun = (runId: string) => {
    setSelectedRunIds(prev => {
      const next = prev.includes(runId) ? prev.filter(id => id !== runId) : [...prev, runId];
      if (next.length < 2 && next.length < prev.length) return prev;
      updateUrl(selectedBenchmarkId, next);
      return next;
    });
  };

  const selectedRuns = useMemo(() => (benchmark?.runs || []).filter(r => selectedRunIds.includes(r.id)), [benchmark, selectedRunIds]);
  const runAggregates = useMemo(() => selectedRuns.map(run => calculateRunAggregates(run, reports)), [selectedRuns, reports]);
  const baselineRunId = useMemo(() => {
    const sorted = [...selectedRuns].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return sorted[0]?.id ?? '';
  }, [selectedRuns]);
  const allRows = useMemo(() => buildTestCaseComparisonRows(selectedRuns, reports, getRealTestCaseMeta), [selectedRuns, reports]);

  // Group rows
  const groupedRows = useMemo(() => {
    if (groupBy === 'none') return [{ label: '', rows: allRows }];
    if (groupBy === 'category') {
      const groups = new Map<string, TestCaseComparisonRow[]>();
      for (const row of allRows) {
        const cat = row.category || 'Uncategorized';
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat)!.push(row);
      }
      return Array.from(groups.entries()).map(([label, rows]) => ({ label, rows })).sort((a, b) => a.label.localeCompare(b.label));
    }
    // group by status
    const groups = new Map<RowStatus, TestCaseComparisonRow[]>();
    for (const row of allRows) {
      const s = calculateRowStatus(row, baselineRunId);
      if (!groups.has(s)) groups.set(s, []);
      groups.get(s)!.push(row);
    }
    const order: RowStatus[] = ['regression', 'improvement', 'mixed', 'neutral'];
    return order.filter(s => groups.has(s)).map(s => ({ label: statusLabels[s], rows: groups.get(s)! }));
  }, [allRows, groupBy, baselineRunId]);

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <TooltipProvider delayDuration={100}>
      <div className="p-4 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8"><ArrowLeft size={16} /></Button>
            <GitCompare className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-xl font-bold">Compare Runs — Heatmap</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Matrix heatmap with smart grouping</p>
            </div>
          </div>
          {/* Group by toggle */}
          <div className="flex items-center border border-border rounded-md overflow-hidden">
            {([['none', 'Flat', <List size={12} key="f" />], ['category', 'Category', <Layers size={12} key="c" />], ['status', 'Status', null]] as [GroupBy, string, React.ReactNode][]).map(([val, lbl, icon]) => (
              <button
                key={val}
                onClick={() => setGroupBy(val)}
                className={`px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${groupBy === val ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {icon}{lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Benchmark + Run Selector */}
        <div className="flex items-start gap-4 mb-4 p-4 rounded-lg border border-border bg-card">
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Benchmark</label>
            <Select value={selectedBenchmarkId} onValueChange={handleBenchmarkChange}>
              <SelectTrigger className="w-[260px] h-8 text-xs"><SelectValue placeholder="Select benchmark" /></SelectTrigger>
              <SelectContent>
                {benchmarks.map(bm => (
                  <SelectItem key={bm.id} value={bm.id}>
                    <span>{bm.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">({bm.runs?.length || 0} runs)</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Runs ({selectedRunIds.length} selected)</label>
            <div className="flex flex-wrap gap-3">
              {(benchmark?.runs || []).map(run => (
                <div key={run.id} className="flex items-center gap-1.5">
                  <Checkbox id={`r3-${run.id}`} checked={selectedRunIds.includes(run.id)} onCheckedChange={() => toggleRun(run.id)} disabled={selectedRunIds.includes(run.id) && selectedRunIds.length <= 2} className="h-3.5 w-3.5" />
                  <Label htmlFor={`r3-${run.id}`} className="text-xs cursor-pointer">{run.name}</Label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Heatmap content */}
        {selectedRuns.length >= 2 && !reportsLoading ? (
          <div className="flex-1 overflow-auto rounded-lg border border-border">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground bg-background border-b w-[200px] sticky left-0 z-20">
                    Test Case
                  </th>
                  {selectedRuns.map((run, i) => (
                    <th key={run.id} className="px-2 py-2 text-center font-medium text-muted-foreground bg-background border-b min-w-[70px]">
                      <div className="truncate text-[10px]">{run.name}</div>
                      <div className="text-[8px] text-muted-foreground font-normal">{getAgentName(run.agentKey)}</div>
                      {/* Sparkline for this run's pass rate */}
                      <div className="flex justify-center mt-1">
                        <div className="h-3 w-5 flex items-end">
                          <div
                            className={`w-full rounded-t-sm ${runAggregates[i]?.passRatePercent >= 80 ? 'bg-green-500' : runAggregates[i]?.passRatePercent >= 50 ? 'bg-amber-500' : 'bg-red-400'}`}
                            style={{ height: `${Math.max(10, runAggregates[i]?.passRatePercent || 0)}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-[8px] font-medium mt-0.5">{runAggregates[i]?.passRatePercent ?? 0}%</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedRows.map((group, gi) => (
                  <React.Fragment key={gi}>
                    {group.label && (
                      <tr>
                        <td colSpan={1 + selectedRuns.length} className="px-3 py-1.5 bg-muted/30 border-b">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</span>
                          <span className="text-[9px] text-muted-foreground ml-2">({group.rows.length})</span>
                        </td>
                      </tr>
                    )}
                    {group.rows.map(row => {
                      const baseResult = row.results[baselineRunId];
                      return (
                        <tr key={row.testCaseId} className="border-b hover:bg-muted/10 transition-colors">
                          <td className="px-3 py-1.5 sticky left-0 bg-background z-10">
                            <div className="font-medium truncate max-w-[190px]">{row.testCaseName}</div>
                          </td>
                          {selectedRuns.map(run => {
                            const result = row.results[run.id];
                            const acc = result?.accuracy;
                            const pf = result?.passFailStatus;
                            const isBase = run.id === baselineRunId;
                            const baseAcc = baseResult?.accuracy;
                            const delta = !isBase && acc !== undefined && baseAcc !== undefined ? acc - baseAcc : undefined;

                            return (
                              <td key={run.id} className="px-1 py-1 text-center">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className={`w-8 h-8 mx-auto rounded border flex items-center justify-center text-[9px] font-medium cursor-default transition-colors ${getHeatmapColor(acc, pf || (!result || result.status === 'missing' ? 'missing' : undefined))}`}>
                                      {acc !== undefined ? acc : !result || result.status === 'missing' ? '—' : '✗'}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs max-w-[200px]">
                                    <div className="space-y-0.5">
                                      <div className="font-medium">{row.testCaseName}</div>
                                      <div>Run: {run.name}</div>
                                      {pf && <div>Status: <span className={pf === 'passed' ? 'text-green-500' : 'text-red-400'}>{pf}</span></div>}
                                      {acc !== undefined && <div>Accuracy: {acc}%</div>}
                                      {delta !== undefined && delta !== 0 && (
                                        <div className={delta > 0 ? 'text-green-500' : 'text-red-400'}>
                                          Delta: {delta > 0 ? '+' : ''}{delta} vs baseline
                                        </div>
                                      )}
                                      {isBase && <div className="text-primary">Baseline run</div>}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
                {allRows.length === 0 && (
                  <tr><td colSpan={1 + selectedRuns.length} className="py-8 text-center text-muted-foreground">No test cases</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : reportsLoading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <GitCompare className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-sm">Select a benchmark with at least 2 runs</p>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};
