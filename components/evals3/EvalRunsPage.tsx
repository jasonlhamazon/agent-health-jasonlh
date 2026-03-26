/*
 * EvalRunsPage — Evals 3: Evaluation Runs (Option C — Run-Centric)
 *
 * Primary entity = benchmark run (not individual test case results).
 * Two view modes: Flat table or Grouped by Benchmark.
 * Default: Grouped by Benchmark.
 * Click a run row → navigates to BenchmarkRunDetailPage.
 * Agent Traces-style filter bar.
 * Route: /evals3/runs
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, XCircle, Loader2, Clock, Search, RefreshCw,
  Activity, BarChart3, SlidersHorizontal, ChevronDown, ChevronRight,
  Layers, List,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { asyncBenchmarkStorage, asyncTestCaseStorage } from '@/services/storage';
import { Benchmark, TestCase, BenchmarkRun } from '@/types';
import { DEFAULT_CONFIG } from '@/lib/constants';
import { formatRelativeTime, getModelName } from '@/lib/utils';

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
  const ms: Record<string, number> = { '1h': 3600000, '6h': 21600000, '1d': 86400000, '7d': 604800000, '30d': 2592000000 };
  return new Date(Date.now() - ms[range]);
}

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewMode = 'flat' | 'grouped';

/** One benchmark run with its parent benchmark context */
interface RunRow {
  run: BenchmarkRun;
  benchmarkId: string;
  benchmarkName: string;
  agentName: string;
  passed: number;
  failed: number;
  total: number;
  score: number | null;
}

function SortHeader({ label, active, dir, onClick, className }: {
  label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void; className?: string;
}) {
  return (
    <th
      className={`h-8 px-3 text-left align-middle font-medium text-xs text-muted-foreground bg-background border-b cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap ${className || ''}`}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <ChevronDown size={10} className={dir === 'asc' ? 'rotate-180' : ''} />}
      </span>
    </th>
  );
}


// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeRunStats(run: BenchmarkRun): { passed: number; failed: number; total: number; score: number | null } {
  if (run.stats && run.stats.total > 0) {
    const score = Math.round((run.stats.passed / run.stats.total) * 100);
    return { passed: run.stats.passed, failed: run.stats.failed, total: run.stats.total, score };
  }
  const results = Object.values(run.results || {});
  let passed = 0, failed = 0;
  for (const r of results) {
    if (r.status === 'completed') passed++;
    else if (r.status === 'failed' || r.status === 'cancelled') failed++;
  }
  const total = results.length;
  const score = total > 0 ? Math.round((passed / total) * 100) : null;
  return { passed, failed, total, score };
}

// ─── Main Component ──────────────────────────────────────────────────────────

export const EvalRunsPage: React.FC = () => {
  const navigate = useNavigate();

  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('1d');
  const [selectedAgent, setSelectedAgent] = useState('all');

  // View
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ field: string; dir: 'asc' | 'desc' }>({ field: 'timestamp', dir: 'desc' });

  // Scroll
  const [isScrolled, setIsScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const bms = await asyncBenchmarkStorage.getAll();
      setBenchmarks(bms);
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const h = () => setIsScrolled(el.scrollTop > 10);
    el.addEventListener('scroll', h);
    return () => el.removeEventListener('scroll', h);
  }, []);

  // Agent options
  const agentOptions = useMemo(() => {
    const agents = DEFAULT_CONFIG.agents.filter(a => a.enabled !== false).map(a => ({ value: a.key, label: a.name }));
    return [{ value: 'all', label: 'All Agents' }, ...agents];
  }, []);

  // Derive flat run rows from benchmark data
  const allRunRows = useMemo<RunRow[]>(() => {
    const threshold = getTimeThreshold(timeRange);
    const rows: RunRow[] = [];

    for (const bm of benchmarks) {
      for (const run of bm.runs || []) {
        if (threshold && new Date(run.createdAt) < threshold) continue;
        if (selectedAgent !== 'all' && run.agentKey !== selectedAgent) continue;

        const agentName = DEFAULT_CONFIG.agents.find(a => a.key === run.agentKey)?.name || run.agentKey || 'Unknown';

        if (search) {
          const q = search.toLowerCase();
          if (
            !run.name.toLowerCase().includes(q) &&
            !run.id.toLowerCase().includes(q) &&
            !bm.name.toLowerCase().includes(q) &&
            !agentName.toLowerCase().includes(q)
          ) continue;
        }

        const stats = computeRunStats(run);
        rows.push({
          run,
          benchmarkId: bm.id,
          benchmarkName: bm.name,
          agentName,
          ...stats,
        });
      }
    }

    return rows;
  }, [benchmarks, timeRange, selectedAgent, search]);

  // Summary
  const totalRuns = allRunRows.length;
  const passedRuns = allRunRows.filter(r => r.score !== null && r.score >= 80).length;
  const avgScore = allRunRows.length > 0
    ? Math.round(allRunRows.filter(r => r.score !== null).reduce((s, r) => s + (r.score || 0), 0) / Math.max(allRunRows.filter(r => r.score !== null).length, 1))
    : 0;

  // Sort
  const sortRows = useCallback((rows: RunRow[]) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sort.field) {
        case 'runId': return dir * a.run.name.localeCompare(b.run.name);
        case 'benchmark': return dir * a.benchmarkName.localeCompare(b.benchmarkName);
        case 'agent': return dir * a.agentName.localeCompare(b.agentName);
        case 'timestamp': return dir * (new Date(a.run.createdAt).getTime() - new Date(b.run.createdAt).getTime());
        case 'score': return dir * ((a.score ?? -1) - (b.score ?? -1));
        case 'results': return dir * (a.total - b.total);
        default: return 0;
      }
    });
  }, [sort]);

  const handleSort = (field: string) => {
    setSort(prev => prev.field === field ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'desc' });
  };

  const toggleGroup = (id: string) => {
    setCollapsedGroups(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  // Grouped by benchmark
  const groupedByBenchmark = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; rows: RunRow[] }>();
    for (const rr of allRunRows) {
      if (!groups.has(rr.benchmarkId)) groups.set(rr.benchmarkId, { id: rr.benchmarkId, name: rr.benchmarkName, rows: [] });
      groups.get(rr.benchmarkId)!.rows.push(rr);
    }
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allRunRows]);

  // Render a run row
  const renderRunRow = (rr: RunRow, showBenchmark: boolean) => {
    const isAllPassed = rr.failed === 0 && rr.passed > 0;
    return (
      <tr
        key={`${rr.benchmarkId}-${rr.run.id}`}
        className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
        onClick={() => navigate(`/evals3/benchmarks/${rr.benchmarkId}/runs/${rr.run.id}/inspect`)}
      >
        <td className="px-2 py-2.5 align-middle text-center w-8">
          {isAllPassed
            ? <CheckCircle2 size={13} className="text-green-500" />
            : rr.failed > 0
              ? <XCircle size={13} className="text-red-500" />
              : <Clock size={13} className="text-muted-foreground" />}
        </td>
        <td className="px-3 py-2.5 align-middle">
          <div className="text-sm font-medium">{rr.run.name}</div>
          <div className="text-[10px] text-muted-foreground font-mono">{rr.run.id.slice(0, 8)}</div>
        </td>
        {showBenchmark && (
          <td className="px-3 py-2.5 align-middle">
            <button
              className="text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 hover:underline transition-colors"
              onClick={e => { e.stopPropagation(); navigate(`/evals3/benchmarks/${rr.benchmarkId}/runs`); }}
            >
              {rr.benchmarkName}
            </button>
          </td>
        )}
        <td className="px-3 py-2.5 align-middle text-xs">{rr.agentName}</td>
        <td className="px-3 py-2.5 align-middle text-xs">{getModelName(rr.run.modelId)}</td>
        <td className="px-3 py-2.5 align-middle text-[11px] text-muted-foreground whitespace-nowrap">{formatRelativeTime(rr.run.createdAt)}</td>
        <td className="px-3 py-2.5 align-middle text-right">
          {rr.score !== null
            ? <span className={`text-xs font-semibold tabular-nums ${rr.score >= 80 ? 'text-green-500' : rr.score >= 50 ? 'text-amber-500' : 'text-red-500'}`}>{rr.score}%</span>
            : <span className="text-xs text-muted-foreground">—</span>}
        </td>
        <td className="px-3 py-2.5 align-middle text-right">
          <div className="inline-flex items-center gap-1.5 text-xs">
            <span className="text-green-500 font-medium">{rr.passed}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-red-500 font-medium">{rr.failed}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">{rr.total}</span>
          </div>
        </td>
      </tr>
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-4 h-full flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">Evaluation Runs</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">Benchmark runs across all evaluations</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-[200px] relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search runs..." value={search} onChange={e => setSearch(e.target.value)} className="pl-7 h-7 text-xs md:text-xs" />
          </div>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs font-normal">
            <SlidersHorizontal size={12} /> Filter
          </Button>
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger className="w-[120px] h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {agentOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={timeRange} onValueChange={v => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[85px] h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIME_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="h-7">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* ── Summary Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card">
          <Activity size={16} className="text-blue-500" />
          <div><div className="text-lg font-semibold leading-tight">{totalRuns}</div><div className="text-[11px] text-muted-foreground">Benchmark Runs</div></div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card">
          <CheckCircle2 size={16} className="text-green-500" />
          <div><div className="text-lg font-semibold leading-tight">{passedRuns}</div><div className="text-[11px] text-muted-foreground">Runs ≥80%</div></div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card">
          <BarChart3 size={16} className="text-purple-500" />
          <div><div className={`text-lg font-semibold leading-tight ${avgScore >= 50 ? 'text-green-500' : 'text-red-500'}`}>{avgScore}%</div><div className="text-[11px] text-muted-foreground">Avg Score</div></div>
        </div>
      </div>

      {/* ── View Toggle ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center border border-border rounded-md overflow-hidden">
          <button
            onClick={() => setViewMode('grouped')}
            className={`px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${viewMode === 'grouped' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Layers size={12} /> Group by Benchmark
          </button>
          <button
            onClick={() => setViewMode('flat')}
            className={`px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${viewMode === 'flat' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <List size={12} /> Flat
          </button>
        </div>
        <span className="text-[11px] text-muted-foreground">{totalRuns} run{totalRuns !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Table ──────────────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-lg border border-border">
        <table className="w-full caption-bottom text-sm">
          <thead className={`sticky top-0 z-10 bg-background transition-shadow duration-200 ${isScrolled ? 'shadow-sm' : ''}`}>
            <tr className="border-b">
              <th className="h-8 w-8 px-2 align-middle bg-background border-b" />
              <SortHeader label="Run" active={sort.field === 'runId'} dir={sort.dir} onClick={() => handleSort('runId')} />
              {viewMode === 'flat' && (
                <SortHeader label="Benchmark" active={sort.field === 'benchmark'} dir={sort.dir} onClick={() => handleSort('benchmark')} />
              )}
              <SortHeader label="Agent" active={sort.field === 'agent'} dir={sort.dir} onClick={() => handleSort('agent')} />
              <th className="h-8 px-3 text-left align-middle font-medium text-xs text-muted-foreground bg-background border-b whitespace-nowrap">Model</th>
              <SortHeader label="Timestamp" active={sort.field === 'timestamp'} dir={sort.dir} onClick={() => handleSort('timestamp')} />
              <SortHeader label="Score" active={sort.field === 'score'} dir={sort.dir} onClick={() => handleSort('score')} className="text-right" />
              <SortHeader label="Pass/Fail/Total" active={sort.field === 'results'} dir={sort.dir} onClick={() => handleSort('results')} className="text-right" />
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {allRunRows.length === 0 ? (
              <tr>
                <td colSpan={viewMode === 'flat' ? 8 : 7} className="py-16 text-center text-sm text-muted-foreground">
                  {timeRange === 'all' ? 'No evaluation runs found' : `No runs in ${TIME_OPTIONS.find(o => o.value === timeRange)?.label}`}
                </td>
              </tr>
            ) : viewMode === 'flat' ? (
              sortRows(allRunRows).map(rr => renderRunRow(rr, true))
            ) : (
              groupedByBenchmark.map(group => {
                const isCollapsed = collapsedGroups.has(group.id);
                const sorted = sortRows(group.rows);
                const groupAvg = group.rows.length > 0
                  ? Math.round(group.rows.filter(r => r.score !== null).reduce((s, r) => s + (r.score || 0), 0) / Math.max(group.rows.filter(r => r.score !== null).length, 1))
                  : 0;
                return (
                  <React.Fragment key={group.id}>
                    <tr
                      className="border-b cursor-pointer hover:bg-muted/30 transition-colors bg-purple-50 dark:bg-purple-500/5"
                      onClick={() => toggleGroup(group.id)}
                    >
                      <td colSpan={7} className="px-3 py-2 align-middle">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">
                            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          </span>
                          <Badge className="text-[9px] px-1 py-0 bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-500/15 dark:text-purple-400 dark:border-purple-500/30 font-semibold uppercase tracking-wider">
                            Benchmark
                          </Badge>
                          <span className="text-xs font-semibold">{group.name}</span>
                          <span className="text-[10px] text-muted-foreground">({group.rows.length} run{group.rows.length !== 1 ? 's' : ''})</span>
                          <span className={`text-[10px] font-medium ml-1 ${groupAvg >= 50 ? 'text-green-500' : 'text-red-500'}`}>
                            {groupAvg}% avg
                          </span>
                        </div>
                      </td>
                    </tr>
                    {!isCollapsed && sorted.map(rr => renderRunRow(rr, false))}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
