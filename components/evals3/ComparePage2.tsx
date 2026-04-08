/*
 * ComparePage2 — Scorecard Compare View (Option B)
 *
 * Vertical scorecard columns per run. Each run gets a column with:
 * - Header card: overall stats (pass rate, accuracy, model, agent, timestamp)
 * - Test case rows: colored status dots (green/red/gray)
 * - Delta gutter between columns showing arrows and % changes
 * - Baseline run gets a subtle highlight
 * - Bottom: mini bar chart showing pass rate per run
 *
 * Route: /evaluations/compare2
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  GitCompare, CheckCircle2, XCircle, Minus,
  TrendingDown, TrendingUp, ArrowLeft, Loader2, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { asyncBenchmarkStorage, asyncRunStorage } from '@/services/storage';
import {
  calculateRunAggregates,
  buildTestCaseComparisonRows,
  getRealTestCaseMeta,
} from '@/services/comparisonService';
import { DEFAULT_CONFIG } from '@/lib/constants';
import { formatRelativeTime, getModelName } from '@/lib/utils';
import type {
  Benchmark, BenchmarkRun, EvaluationReport,
  RunAggregateMetrics, TestCaseComparisonRow,
} from '@/types';

const getAgentName = (key: string) =>
  DEFAULT_CONFIG.agents.find(a => a.key === key)?.name || key;


// ─── Sub-components ──────────────────────────────────────────────────────────

/** Scorecard header for a single run */
function ScorecardHeader({ agg, isBaseline }: { agg: RunAggregateMetrics; isBaseline: boolean }) {
  const passRate = agg.passRatePercent;
  const barColor = passRate >= 80 ? 'bg-green-500' : passRate >= 50 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className={`p-3 rounded-lg border ${isBaseline ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'}`}>
      {isBaseline && (
        <Badge variant="outline" className="text-[8px] px-1 py-0 border-primary/40 text-primary mb-1.5">
          Baseline
        </Badge>
      )}
      <div className="text-sm font-semibold truncate mb-1">{agg.runName}</div>
      <div className="text-[10px] text-muted-foreground space-y-0.5">
        <div>{getAgentName(agg.agentKey)}</div>
        <div>{getModelName(agg.modelId)}</div>
        <div>{formatRelativeTime(agg.createdAt)}</div>
      </div>
      {/* Pass rate bar */}
      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px] mb-0.5">
          <span className="text-muted-foreground">Pass Rate</span>
          <span className="font-semibold">{passRate}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${passRate}%` }} />
        </div>
      </div>
      {/* Stats row */}
      <div className="flex items-center gap-2 mt-2 text-[10px]">
        <span className="text-green-500 font-medium">{agg.passedCount}P</span>
        <span className="text-red-400 font-medium">{agg.failedCount}F</span>
        <span className="text-muted-foreground">/ {agg.totalTestCases}</span>
        <span className="ml-auto text-muted-foreground">Acc {agg.avgAccuracy}%</span>
      </div>
    </div>
  );
}

/** Delta gutter between two columns */
function DeltaGutter({ left, right }: { left?: RunAggregateMetrics; right?: RunAggregateMetrics }) {
  if (!left || !right) return null;
  const passRateDelta = right.passRatePercent - left.passRatePercent;
  const accDelta = right.avgAccuracy - left.avgAccuracy;

  return (
    <div className="flex flex-col items-center justify-center gap-1 px-1 min-w-[40px]">
      <DeltaChip value={passRateDelta} label="PR" />
      <DeltaChip value={accDelta} label="Acc" />
    </div>
  );
}

function DeltaChip({ value, label }: { value: number; label: string }) {
  if (value === 0) return (
    <div className="text-[9px] text-muted-foreground text-center">
      <div>=</div>
      <div>{label}</div>
    </div>
  );
  const isPositive = value > 0;
  return (
    <div className={`text-[9px] text-center font-medium ${isPositive ? 'text-green-500' : 'text-red-400'}`}>
      <div className="flex items-center gap-0.5 justify-center">
        {isPositive ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
        {isPositive ? '+' : ''}{value}
      </div>
      <div className="text-muted-foreground font-normal">{label}</div>
    </div>
  );
}

/** Status dot for a test case result */
function StatusDot({ status, accuracy }: { status?: string; accuracy?: number }) {
  if (!status || status === 'missing') {
    return <div className="w-3 h-3 rounded-full bg-muted border border-border" title="Not run" />;
  }
  const isPassed = status === 'passed';
  return (
    <div
      className={`w-3 h-3 rounded-full ${isPassed ? 'bg-green-500' : 'bg-red-400'}`}
      title={`${isPassed ? 'Passed' : 'Failed'}${accuracy !== undefined ? ` — ${accuracy}%` : ''}`}
    />
  );
}

/** Mini pass rate bar chart at the bottom */
function PassRateChart({ aggregates, baselineRunId }: { aggregates: RunAggregateMetrics[]; baselineRunId: string }) {
  const maxRate = 100;
  return (
    <div className="flex items-end gap-3 h-16 px-2">
      {aggregates.map(agg => {
        const height = Math.max(4, (agg.passRatePercent / maxRate) * 100);
        const isBaseline = agg.runId === baselineRunId;
        const barColor = agg.passRatePercent >= 80 ? 'bg-green-500' : agg.passRatePercent >= 50 ? 'bg-amber-500' : 'bg-red-400';
        return (
          <div key={agg.runId} className="flex flex-col items-center gap-0.5 flex-1">
            <span className="text-[9px] font-medium">{agg.passRatePercent}%</span>
            <div
              className={`w-full rounded-t ${barColor} ${isBaseline ? 'ring-1 ring-primary/50' : ''} transition-all`}
              style={{ height: `${height}%`, minHeight: '4px' }}
            />
            <span className="text-[8px] text-muted-foreground truncate max-w-full text-center">{agg.runName}</span>
          </div>
        );
      })}
    </div>
  );
}


// ─── Main Component ──────────────────────────────────────────────────────────

export const ComparePage2: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<Record<string, EvaluationReport>>({});
  const [reportsLoading, setReportsLoading] = useState(false);
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState<string>('');
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);

  // Load benchmarks
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
            .sort((a, b) => {
              const la = Math.max(...(a.runs || []).map(r => new Date(r.createdAt).getTime()));
              const lb = Math.max(...(b.runs || []).map(r => new Date(r.createdAt).getTime()));
              return lb - la;
            });
          const def = sorted[0] || bms[0];
          setSelectedBenchmarkId(def.id);
          setSelectedRunIds(pickLastTwo(def));
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const benchmark = useMemo(() => benchmarks.find(b => b.id === selectedBenchmarkId) || null, [benchmarks, selectedBenchmarkId]);

  // Load reports
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

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8"><ArrowLeft size={16} /></Button>
          <GitCompare className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-xl font-bold">Compare Runs — Scorecard</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Side-by-side scorecard columns per run</p>
          </div>
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
                <Checkbox id={`r2-${run.id}`} checked={selectedRunIds.includes(run.id)} onCheckedChange={() => toggleRun(run.id)} disabled={selectedRunIds.includes(run.id) && selectedRunIds.length <= 2} className="h-3.5 w-3.5" />
                <Label htmlFor={`r2-${run.id}`} className="text-xs cursor-pointer">{run.name}</Label>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scorecard content */}
      {selectedRuns.length >= 2 && !reportsLoading ? (
        <div className="flex-1 overflow-y-auto">
          {/* Scorecard headers with delta gutters */}
          <div className="flex items-stretch gap-0 mb-4">
            {runAggregates.map((agg, i) => (
              <React.Fragment key={agg.runId}>
                <div className="flex-1 min-w-[160px]">
                  <ScorecardHeader agg={agg} isBaseline={agg.runId === baselineRunId} />
                </div>
                {i < runAggregates.length - 1 && (
                  <DeltaGutter left={runAggregates[i]} right={runAggregates[i + 1]} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Test case rows */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[200px]">Test Case</th>
                  {selectedRuns.map(run => (
                    <th key={run.id} className="px-3 py-2 text-center font-medium text-muted-foreground min-w-[100px]">
                      <span className="truncate block">{run.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allRows.length === 0 ? (
                  <tr><td colSpan={1 + selectedRuns.length} className="py-8 text-center text-muted-foreground">No test cases</td></tr>
                ) : (
                  allRows.map(row => {
                    const baseResult = row.results[baselineRunId];
                    return (
                      <tr key={row.testCaseId} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2">
                          <div className="font-medium truncate max-w-[190px]">{row.testCaseName}</div>
                          {row.labels?.slice(0, 1).map(l => (
                            <Badge key={l} variant="outline" className="text-[8px] px-1 py-0 mt-0.5">{l}</Badge>
                          ))}
                        </td>
                        {selectedRuns.map(run => {
                          const result = row.results[run.id];
                          const isBase = run.id === baselineRunId;
                          const acc = result?.accuracy;
                          const baseAcc = baseResult?.accuracy;
                          const delta = !isBase && acc !== undefined && baseAcc !== undefined ? acc - baseAcc : undefined;

                          return (
                            <td key={run.id} className="px-3 py-2 text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <StatusDot status={result?.passFailStatus} accuracy={acc} />
                                {acc !== undefined && <span className="text-[10px] text-muted-foreground">{acc}%</span>}
                                {delta !== undefined && delta !== 0 && (
                                  <span className={`text-[9px] font-medium ${delta > 0 ? 'text-green-500' : 'text-red-400'}`}>
                                    {delta > 0 ? '+' : ''}{delta}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mini pass rate chart */}
          <div className="mt-4 p-3 rounded-lg border border-border bg-card">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Pass Rate Comparison</div>
            <PassRateChart aggregates={runAggregates} baselineRunId={baselineRunId} />
          </div>
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
  );
};
