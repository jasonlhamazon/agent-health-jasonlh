/*
 * BenchmarksPage4 — Evals 3: Benchmarks
 *
 * Two tabs:
 *   Tab 1 "Benchmarks" — leaderboard with trend columns, summary cards, last run link
 *   Tab 2 "Runs" — flattened test case results (click → run detail)
 *
 * Agent Traces-style filter bar + sticky table headers + sortable columns.
 * Global time filter in header scopes everything.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, CheckCircle2, XCircle, Loader2, Clock, Search, X, RefreshCw,
  Activity, BarChart3, Layers, TrendingUp, TrendingDown, Minus, AlertTriangle,
  SlidersHorizontal, ChevronDown,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { asyncBenchmarkStorage, asyncTestCaseStorage } from '@/services/storage';
import { Benchmark, BenchmarkRun, TestCase } from '@/types';
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
  const now = new Date();
  const ms: Record<string, number> = { '1h': 3600000, '6h': 21600000, '1d': 86400000, '7d': 604800000, '30d': 2592000000 };
  return new Date(now.getTime() - ms[range]);
}


// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeScore(run: BenchmarkRun): number | null {
  if (run.stats && run.stats.total > 0) return Math.round((run.stats.passed / run.stats.total) * 100);
  const results = Object.values(run.results || {});
  if (results.length === 0) return null;
  const completed = results.filter(r => r.status === 'completed').length;
  return Math.round((completed / results.length) * 100);
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted-foreground">—</span>;
  const cls = score >= 80 ? 'text-green-700 dark:text-green-400' : score >= 50 ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400';
  return <span className={`text-xs font-semibold tabular-nums ${cls}`}>{score}%</span>;
}

type TrendDir = 'improving' | 'stable' | 'regressing' | 'unknown';

function getTrend(runs: BenchmarkRun[]): TrendDir {
  if (runs.length < 2) return 'unknown';
  const sorted = [...runs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const latest = computeScore(sorted[0]);
  const prev = computeScore(sorted[1]);
  if (latest === null || prev === null) return 'unknown';
  const diff = latest - prev;
  if (diff > 5) return 'improving';
  if (diff < -5) return 'regressing';
  return 'stable';
}

function TrendBadge({ trend }: { trend: TrendDir }) {
  const config: Record<TrendDir, { icon: React.ReactNode; label: string; cls: string }> = {
    improving: { icon: <TrendingUp size={12} />, label: 'Improving', cls: 'text-green-600 dark:text-green-400' },
    stable: { icon: <Minus size={12} />, label: 'Stable', cls: 'text-muted-foreground' },
    regressing: { icon: <TrendingDown size={12} />, label: 'Regressing', cls: 'text-red-600 dark:text-red-400' },
    unknown: { icon: <Minus size={12} />, label: '—', cls: 'text-muted-foreground' },
  };
  const c = config[trend];
  return <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${c.cls}`}>{c.icon} {c.label}</span>;
}

interface FlatResult {
  benchmarkId: string; benchmarkName: string; runId: string; runName: string;
  runCreatedAt: string; agentName: string; testCaseId: string; testCaseName: string;
  reportId: string | null; resultStatus: string; passed: boolean | null;
}

interface BenchmarkStats {
  runCount: number; latestRun: BenchmarkRun | null; latestScore: number | null;
  bestScore: number | null; worstScore: number | null; trend: TrendDir;
}

// Sort types
type BmSortField = 'name' | 'tcs' | 'runs' | 'score' | 'best' | 'worst' | 'trend';
type RunSortField = 'testCase' | 'benchmark' | 'run' | 'agent' | 'timestamp' | 'result';
type SortDir = 'asc' | 'desc';

function SortHeader({ label, active, dir, onClick, className }: {
  label: string; active: boolean; dir: SortDir; onClick: () => void; className?: string;
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


// ─── Main Component ──────────────────────────────────────────────────────────

export const BenchmarksPage4: React.FC = () => {
  const navigate = useNavigate();
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('benchmarks');
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [isScrolled, setIsScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sort state for Benchmarks tab
  const [bmSort, setBmSort] = useState<{ field: BmSortField; dir: SortDir }>({ field: 'runs', dir: 'desc' });
  // Sort state for Runs tab
  const [runSort, setRunSort] = useState<{ field: RunSortField; dir: SortDir }>({ field: 'timestamp', dir: 'desc' });

  const loadData = useCallback(async () => {
    try {
      const [bms, tcs] = await Promise.all([
        asyncBenchmarkStorage.getAll(),
        asyncTestCaseStorage.getAll(),
      ]);
      setBenchmarks(bms);
      setTestCases(tcs as TestCase[]);
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Scroll detection for sticky header shadow
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => setIsScrolled(el.scrollTop > 10);
    el.addEventListener('scroll', handler);
    return () => el.removeEventListener('scroll', handler);
  }, []);

  const tcMap = useMemo(() => new Map(testCases.map(tc => [tc.id, tc])), [testCases]);

  // Agent options from config
  const agentOptions = useMemo(() => {
    const agents = DEFAULT_CONFIG.agents.filter(a => a.enabled !== false).map(a => ({ value: a.key, label: a.name }));
    return [{ value: 'all', label: 'All Agents' }, ...agents];
  }, []);

  // Time-filter + agent-filter runs
  const timeFilteredBenchmarks = useMemo(() => {
    const threshold = getTimeThreshold(timeRange);
    return benchmarks.map(bm => {
      let runs = bm.runs || [];
      if (threshold) runs = runs.filter(r => new Date(r.createdAt) >= threshold);
      if (selectedAgent !== 'all') runs = runs.filter(r => r.agentKey === selectedAgent);
      return { ...bm, runs };
    });
  }, [benchmarks, timeRange, selectedAgent]);

  // Per-benchmark stats
  const benchmarkStats = useMemo(() => {
    const map = new Map<string, BenchmarkStats>();
    for (const bm of timeFilteredBenchmarks) {
      const runs = bm.runs || [];
      const scores = runs.map(r => computeScore(r)).filter((s): s is number => s !== null);
      const sorted = [...runs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      map.set(bm.id, {
        runCount: runs.length, latestRun: sorted[0] || null,
        latestScore: sorted[0] ? computeScore(sorted[0]) : null,
        bestScore: scores.length > 0 ? Math.max(...scores) : null,
        worstScore: scores.length > 0 ? Math.min(...scores) : null,
        trend: getTrend(runs),
      });
    }
    return map;
  }, [timeFilteredBenchmarks]);

  // Summary cards
  const totalBenchmarks = benchmarks.length;
  const totalRuns = Array.from(benchmarkStats.values()).reduce((s, bs) => s + bs.runCount, 0);
  const allScores = Array.from(benchmarkStats.values()).map(bs => bs.latestScore).filter((s): s is number => s !== null);
  const avgPassRate = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;

  const worstTestCase = useMemo(() => {
    let worst: { name: string; benchmarkName: string } | null = null;
    for (const bm of timeFilteredBenchmarks) {
      const stats = benchmarkStats.get(bm.id);
      if (!stats?.latestRun) continue;
      for (const [tcId, result] of Object.entries(stats.latestRun.results || {})) {
        if (result.status === 'failed') {
          const tc = tcMap.get(tcId);
          if (!worst) worst = { name: tc?.name || tcId, benchmarkName: bm.name };
        }
      }
    }
    return worst;
  }, [timeFilteredBenchmarks, benchmarkStats, tcMap]);

  // Filtered + sorted benchmarks
  const sortedBenchmarks = useMemo(() => {
    let list = timeFilteredBenchmarks;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(b => b.name.toLowerCase().includes(q));
    }
    const dir = bmSort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const sa = benchmarkStats.get(a.id);
      const sb = benchmarkStats.get(b.id);
      switch (bmSort.field) {
        case 'name': return dir * a.name.localeCompare(b.name);
        case 'tcs': return dir * (a.testCaseIds.length - b.testCaseIds.length);
        case 'runs': return dir * ((sa?.runCount || 0) - (sb?.runCount || 0));
        case 'score': return dir * ((sa?.latestScore ?? -1) - (sb?.latestScore ?? -1));
        case 'best': return dir * ((sa?.bestScore ?? -1) - (sb?.bestScore ?? -1));
        case 'worst': return dir * ((sa?.worstScore ?? -1) - (sb?.worstScore ?? -1));
        case 'trend': return dir * ((sa?.trend || '').localeCompare(sb?.trend || ''));
        default: return 0;
      }
    });
  }, [timeFilteredBenchmarks, search, bmSort, benchmarkStats]);

  const handleBmSort = (field: BmSortField) => {
    setBmSort(prev => prev.field === field ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'desc' });
  };


  // Flattened test case results for Runs tab
  const allFlatResults = useMemo<FlatResult[]>(() => {
    const rows: FlatResult[] = [];
    for (const bm of timeFilteredBenchmarks) {
      for (const run of bm.runs || []) {
        const agent = DEFAULT_CONFIG.agents.find(a => a.key === run.agentKey)?.name || run.agentKey || 'Unknown';
        for (const [tcId, result] of Object.entries(run.results || {})) {
          rows.push({
            benchmarkId: bm.id, benchmarkName: bm.name, runId: run.id, runName: run.name,
            runCreatedAt: run.createdAt, agentName: agent, testCaseId: tcId,
            testCaseName: tcMap.get(tcId)?.name || tcId, reportId: result.reportId || null,
            resultStatus: result.status,
            passed: result.status === 'completed' ? true : result.status === 'failed' ? false : null,
          });
        }
      }
    }
    return rows;
  }, [timeFilteredBenchmarks, tcMap]);

  const sortedResults = useMemo(() => {
    let list = allFlatResults;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r => r.benchmarkName.toLowerCase().includes(q) || r.testCaseName.toLowerCase().includes(q) || r.agentName.toLowerCase().includes(q));
    }
    const dir = runSort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (runSort.field) {
        case 'testCase': return dir * a.testCaseName.localeCompare(b.testCaseName);
        case 'benchmark': return dir * a.benchmarkName.localeCompare(b.benchmarkName);
        case 'run': return dir * a.runName.localeCompare(b.runName);
        case 'agent': return dir * a.agentName.localeCompare(b.agentName);
        case 'timestamp': return dir * (new Date(a.runCreatedAt).getTime() - new Date(b.runCreatedAt).getTime());
        case 'result': {
          const order = (p: boolean | null) => p === true ? 0 : p === false ? 1 : 2;
          return dir * (order(a.passed) - order(b.passed));
        }
        default: return 0;
      }
    });
  }, [allFlatResults, search, runSort]);

  const handleRunSort = (field: RunSortField) => {
    setRunSort(prev => prev.field === field ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'desc' });
  };

  const totalResults = allFlatResults.length;
  const passedResults = allFlatResults.filter(r => r.passed === true).length;
  const resultsPassRate = totalResults > 0 ? Math.round((passedResults / totalResults) * 100) : 0;

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-4 h-full flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">Benchmarks</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">Collections of test cases to run evaluations against your agents</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="w-[200px] relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search" value={search} onChange={e => setSearch(e.target.value)}
              className="pl-7 h-7 text-xs md:text-xs" />
          </div>
          {/* Filter button (placeholder) */}
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs font-normal">
            <SlidersHorizontal size={12} /> Filter
          </Button>
          {/* Agent filter */}
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger className="w-[120px] h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {agentOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Time filter */}
          <Select value={timeRange} onValueChange={v => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[85px] h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIME_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Refresh */}
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="h-7">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>


      {/* ── Summary Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card">
          <Layers size={16} className="text-purple-500" />
          <div><div className="text-lg font-semibold leading-tight">{totalBenchmarks}</div><div className="text-[11px] text-muted-foreground">Benchmarks</div></div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card">
          <Activity size={16} className="text-blue-500" />
          <div><div className="text-lg font-semibold leading-tight">{totalRuns}</div><div className="text-[11px] text-muted-foreground">Total Runs</div></div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card">
          <BarChart3 size={16} className="text-green-500" />
          <div><div className={`text-lg font-semibold leading-tight ${avgPassRate >= 50 ? 'text-green-500' : 'text-red-500'}`}>{avgPassRate}%</div><div className="text-[11px] text-muted-foreground">Avg Pass Rate</div></div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card">
          <AlertTriangle size={16} className="text-amber-500" />
          <div>
            {worstTestCase
              ? <><div className="text-sm font-semibold leading-tight truncate max-w-[140px]">{worstTestCase.name}</div><div className="text-[10px] text-muted-foreground truncate">{worstTestCase.benchmarkName}</div></>
              : <><div className="text-sm text-muted-foreground">—</div><div className="text-[11px] text-muted-foreground">Worst Test Case</div></>}
          </div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mb-3 self-start">
          <TabsTrigger value="benchmarks" className="text-xs">Benchmarks</TabsTrigger>
          <TabsTrigger value="runs" className="text-xs">Runs</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Benchmarks Leaderboard ──────────────────────── */}
        <TabsContent value="benchmarks" className="flex-1 overflow-hidden mt-0">
          <div ref={scrollRef} className="h-full overflow-y-auto rounded-lg border border-border">
            <table className="w-full caption-bottom text-sm">
              <thead className={`sticky top-0 z-10 bg-background transition-shadow duration-200 ${isScrolled ? 'shadow-sm' : ''}`}>
                <tr className="border-b">
                  <SortHeader label="Name" active={bmSort.field === 'name'} dir={bmSort.dir} onClick={() => handleBmSort('name')} />
                  <SortHeader label="# TCs" active={bmSort.field === 'tcs'} dir={bmSort.dir} onClick={() => handleBmSort('tcs')} className="text-center" />
                  <SortHeader label="Runs" active={bmSort.field === 'runs'} dir={bmSort.dir} onClick={() => handleBmSort('runs')} className="text-center" />
                  <th className="h-8 px-3 text-left align-middle font-medium text-xs text-muted-foreground bg-background border-b whitespace-nowrap">Last Run</th>
                  <SortHeader label="Score" active={bmSort.field === 'score'} dir={bmSort.dir} onClick={() => handleBmSort('score')} className="text-right" />
                  <SortHeader label="Best" active={bmSort.field === 'best'} dir={bmSort.dir} onClick={() => handleBmSort('best')} className="text-right" />
                  <SortHeader label="Worst" active={bmSort.field === 'worst'} dir={bmSort.dir} onClick={() => handleBmSort('worst')} className="text-right" />
                  <SortHeader label="Trend" active={bmSort.field === 'trend'} dir={bmSort.dir} onClick={() => handleBmSort('trend')} />
                  <th className="h-8 px-3 text-right align-middle font-medium text-xs text-muted-foreground bg-background border-b whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {sortedBenchmarks.length === 0 ? (
                  <tr><td colSpan={9} className="py-16 text-center text-sm text-muted-foreground">No benchmarks found</td></tr>
                ) : (
                  sortedBenchmarks.map(bm => {
                    const stats = benchmarkStats.get(bm.id);
                    const lr = stats?.latestRun;
                    return (
                      <tr key={bm.id} className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/evals3/benchmarks/${bm.id}/runs`)}>
                        <td className="px-3 py-2.5 align-middle">
                          <div className="text-sm font-medium truncate max-w-[240px]">{bm.name}</div>
                          {bm.description && <div className="text-[10px] text-muted-foreground truncate max-w-[240px]">{bm.description}</div>}
                        </td>
                        <td className="px-3 py-2.5 align-middle text-center text-xs">{bm.testCaseIds.length}</td>
                        <td className="px-3 py-2.5 align-middle text-center text-xs">{stats?.runCount || 0}</td>
                        <td className="px-3 py-2.5 align-middle">
                          {lr ? (
                            <button className="text-[11px] text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                              onClick={e => { e.stopPropagation(); navigate(`/evals3/benchmarks/${bm.id}/runs/${lr.id}`); }}>
                              {formatRelativeTime(lr.createdAt)}
                            </button>
                          ) : <span className="text-[11px] text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5 align-middle text-right"><ScoreBadge score={stats?.latestScore ?? null} /></td>
                        <td className="px-3 py-2.5 align-middle text-right"><ScoreBadge score={stats?.bestScore ?? null} /></td>
                        <td className="px-3 py-2.5 align-middle text-right"><ScoreBadge score={stats?.worstScore ?? null} /></td>
                        <td className="px-3 py-2.5 align-middle"><TrendBadge trend={stats?.trend || 'unknown'} /></td>
                        <td className="px-3 py-2.5 align-middle text-right">
                          <button className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-border hover:bg-muted transition-colors"
                            onClick={e => { e.stopPropagation(); navigate(`/evals3/benchmarks/${bm.id}/runs`); }}>
                            <Play size={10} /> Run
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>


        {/* ── Tab 2: Flattened test case results ─────────────────────── */}
        <TabsContent value="runs" className="flex-1 overflow-hidden mt-0">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card">
              <Activity size={16} className="text-purple-500" />
              <div><div className="text-lg font-semibold leading-tight">{totalResults}</div><div className="text-[11px] text-muted-foreground">Test Case Results</div></div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card">
              <CheckCircle2 size={16} className="text-green-500" />
              <div><div className="text-lg font-semibold leading-tight">{passedResults} / {totalResults}</div><div className="text-[11px] text-muted-foreground">Passed</div></div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card">
              <BarChart3 size={16} className="text-blue-500" />
              <div><div className="text-lg font-semibold leading-tight">{resultsPassRate}%</div><div className="text-[11px] text-muted-foreground">Pass Rate</div></div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto rounded-lg border border-border">
            <table className="w-full caption-bottom text-sm">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b">
                  <th className="h-8 w-8 px-2 align-middle bg-background border-b" />
                  <SortHeader label="Test Case" active={runSort.field === 'testCase'} dir={runSort.dir} onClick={() => handleRunSort('testCase')} />
                  <SortHeader label="Benchmark" active={runSort.field === 'benchmark'} dir={runSort.dir} onClick={() => handleRunSort('benchmark')} />
                  <SortHeader label="Run" active={runSort.field === 'run'} dir={runSort.dir} onClick={() => handleRunSort('run')} />
                  <SortHeader label="Agent" active={runSort.field === 'agent'} dir={runSort.dir} onClick={() => handleRunSort('agent')} />
                  <SortHeader label="Timestamp" active={runSort.field === 'timestamp'} dir={runSort.dir} onClick={() => handleRunSort('timestamp')} />
                  <SortHeader label="Result" active={runSort.field === 'result'} dir={runSort.dir} onClick={() => handleRunSort('result')} className="text-right" />
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {sortedResults.length === 0 ? (
                  <tr><td colSpan={7} className="py-16 text-center text-sm text-muted-foreground">
                    {timeRange === 'all' ? 'No results' : `No results in ${TIME_OPTIONS.find(o => o.value === timeRange)?.label}`}
                  </td></tr>
                ) : (
                  sortedResults.map(r => (
                    <tr key={`${r.benchmarkId}-${r.runId}-${r.testCaseId}`}
                      className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => r.reportId && navigate(`/runs/${r.reportId}`)}>
                      <td className="px-2 py-2.5 align-middle text-center">
                        {r.passed === true && <CheckCircle2 size={13} className="text-green-500" />}
                        {r.passed === false && <XCircle size={13} className="text-red-500" />}
                        {r.passed === null && r.resultStatus === 'running' && <Loader2 size={13} className="text-blue-600 dark:text-blue-400 animate-spin" />}
                        {r.passed === null && r.resultStatus !== 'running' && <Clock size={13} className="text-muted-foreground" />}
                      </td>
                      <td className="px-3 py-2.5 align-middle"><div className="text-sm font-medium truncate max-w-[200px]">{r.testCaseName}</div></td>
                      <td className="px-3 py-2.5 align-middle text-[11px] text-muted-foreground truncate max-w-[160px]">{r.benchmarkName}</td>
                      <td className="px-3 py-2.5 align-middle text-[11px] text-muted-foreground truncate max-w-[120px]">{r.runName}</td>
                      <td className="px-3 py-2.5 align-middle text-xs truncate max-w-[100px]">{r.agentName}</td>
                      <td className="px-3 py-2.5 align-middle text-[11px] text-muted-foreground whitespace-nowrap">{formatRelativeTime(r.runCreatedAt)}</td>
                      <td className="px-3 py-2.5 align-middle text-right">
                        {r.passed === true && <span className="text-[11px] font-semibold text-green-500">PASS</span>}
                        {r.passed === false && <span className="text-[11px] font-semibold text-red-500">FAIL</span>}
                        {r.passed === null && <span className="text-[11px] text-muted-foreground">{r.resultStatus === 'running' ? 'RUNNING' : '—'}</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
