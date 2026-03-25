/*
 * BenchmarksPage V3 — Runs-table-centric benchmark home
 *
 * Core view: a flat table of all benchmark runs across all benchmarks.
 * Each row = one run (benchmark × agent × timestamp).
 * Summary cards at top. Filters for agent, benchmark, search.
 * Uses V1's real data model + backend (asyncBenchmarkStorage).
 * Dense layout inspired by V2's UX patterns.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FlaskConical, Search, X, RefreshCw, Activity, BarChart3, Layers,
  CheckCircle2, XCircle, Loader2, Clock, Ban, ChevronDown
} from 'lucide-react';
import { asyncBenchmarkStorage } from '@/services/storage';
import { Benchmark, BenchmarkRun, BenchmarkRunStatus } from '@/types';
import { DEFAULT_CONFIG } from '@/lib/constants';
import { formatRelativeTime, getModelName } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Flattened row: one run with its parent benchmark info */
interface RunRow {
  benchmarkId: string;
  benchmarkName: string;
  run: BenchmarkRun;
  passRate: number | null; // null if no stats
  agentName: string;
  modelName: string;
}

type SortField = 'timestamp' | 'benchmark' | 'agent' | 'passRate' | 'status';
type SortDir = 'asc' | 'desc';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveAgentName(agentKey: string): string {
  const agent = DEFAULT_CONFIG.agents.find(a => a.key === agentKey);
  return agent?.name || agentKey || 'Unknown';
}

function getEffectiveStatus(run: BenchmarkRun): BenchmarkRunStatus {
  if (run.status) return run.status;
  const results = Object.values(run.results || {});
  if (results.some(r => r.status === 'running')) return 'running';
  if (results.length === 0) return 'pending';
  return results.some(r => r.status === 'completed') ? 'completed' : 'failed';
}

function computePassRate(run: BenchmarkRun): number | null {
  if (run.stats && run.stats.total > 0) {
    return Math.round((run.stats.passed / run.stats.total) * 100);
  }
  // Fallback: derive from results
  const results = Object.values(run.results || {});
  if (results.length === 0) return null;
  const completed = results.filter(r => r.status === 'completed').length;
  return Math.round((completed / results.length) * 100);
}

function flattenRuns(benchmarks: Benchmark[]): RunRow[] {
  const rows: RunRow[] = [];
  for (const bench of benchmarks) {
    for (const run of bench.runs || []) {
      const passRate = computePassRate(run);
      rows.push({
        benchmarkId: bench.id,
        benchmarkName: bench.name,
        run,
        passRate,
        agentName: resolveAgentName(run.agentKey),
        modelName: getModelName(run.modelId),
      });
    }
  }
  return rows;
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BenchmarkRunStatus }) {
  const config: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    completed: {
      icon: <CheckCircle2 size={12} />,
      label: 'Completed',
      cls: 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20',
    },
    running: {
      icon: <Loader2 size={12} className="animate-spin" />,
      label: 'Running',
      cls: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
    },
    failed: {
      icon: <XCircle size={12} />,
      label: 'Failed',
      cls: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20',
    },
    cancelled: {
      icon: <Ban size={12} />,
      label: 'Cancelled',
      cls: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
    },
    pending: {
      icon: <Clock size={12} />,
      label: 'Pending',
      cls: 'text-muted-foreground bg-muted/50 border-border',
    },
  };
  const c = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium border ${c.cls}`}>
      {c.icon} {c.label}
    </span>
  );
}

// ─── Pass Rate Badge ─────────────────────────────────────────────────────────

function PassRateBadge({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-xs text-muted-foreground">—</span>;
  const cls =
    rate >= 80 ? 'text-green-700 dark:text-green-400' :
    rate >= 50 ? 'text-amber-700 dark:text-amber-400' :
    'text-red-700 dark:text-red-400';
  return <span className={`text-xs font-semibold tabular-nums ${cls}`}>{rate}%</span>;
}


// ─── Summary Cards ───────────────────────────────────────────────────────────

function SummaryCards({ benchmarks, rows }: { benchmarks: Benchmark[]; rows: RunRow[] }) {
  const totalBenchmarks = benchmarks.length;
  const totalRuns = rows.length;
  const avgPassRate = rows.length > 0
    ? Math.round(rows.reduce((sum, r) => sum + (r.passRate ?? 0), 0) / rows.filter(r => r.passRate !== null).length) || 0
    : 0;
  const uniqueAgents = new Set(rows.map(r => r.run.agentKey)).size;

  const cards = [
    { label: 'Benchmarks', value: totalBenchmarks, icon: <Layers size={16} className="text-blue-500" /> },
    { label: 'Total Runs', value: totalRuns, icon: <Activity size={16} className="text-purple-500" /> },
    { label: 'Avg Pass Rate', value: `${avgPassRate}%`, icon: <BarChart3 size={16} className="text-green-500" /> },
    { label: 'Agents', value: uniqueAgents, icon: <FlaskConical size={16} className="text-cyan-500" /> },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 mb-4">
      {cards.map(c => (
        <div key={c.label} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card">
          {c.icon}
          <div>
            <div className="text-lg font-semibold leading-tight">{c.value}</div>
            <div className="text-[11px] text-muted-foreground">{c.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Filter Bar ──────────────────────────────────────────────────────────────

function FilterBar({
  search, onSearchChange,
  agentFilter, onAgentChange,
  benchmarkFilter, onBenchmarkChange,
  agents, benchmarkNames,
}: {
  search: string; onSearchChange: (v: string) => void;
  agentFilter: string; onAgentChange: (v: string) => void;
  benchmarkFilter: string; onBenchmarkChange: (v: string) => void;
  agents: { key: string; name: string }[];
  benchmarkNames: { id: string; name: string }[];
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search runs..."
          className="w-full pl-8 pr-8 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
        {search && (
          <button onClick={() => onSearchChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={12} />
          </button>
        )}
      </div>

      {/* Agent filter */}
      <select
        value={agentFilter}
        onChange={e => onAgentChange(e.target.value)}
        className="text-xs px-2 py-1.5 bg-background border border-border rounded-md"
      >
        <option value="all">All Agents</option>
        {agents.map(a => <option key={a.key} value={a.key}>{a.name}</option>)}
      </select>

      {/* Benchmark filter */}
      <select
        value={benchmarkFilter}
        onChange={e => onBenchmarkChange(e.target.value)}
        className="text-xs px-2 py-1.5 bg-background border border-border rounded-md max-w-[200px]"
      >
        <option value="all">All Benchmarks</option>
        {benchmarkNames.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </div>
  );
}

// ─── Column Header ───────────────────────────────────────────────────────────

function ColHeader({ label, field, sortField, sortDir, onSort, className }: {
  label: string; field: SortField;
  sortField: SortField; sortDir: SortDir;
  onSort: (f: SortField) => void;
  className?: string;
}) {
  const active = sortField === field;
  return (
    <button
      onClick={() => onSort(field)}
      className={`flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium hover:text-foreground transition-colors ${
        active ? 'text-foreground' : 'text-muted-foreground'
      } ${className || ''}`}
    >
      {label}
      {active && <ChevronDown size={10} className={sortDir === 'asc' ? 'rotate-180' : ''} />}
    </button>
  );
}


// ─── Main Page Component ─────────────────────────────────────────────────────

export const BenchmarksPage3: React.FC = () => {
  const navigate = useNavigate();
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState('all');
  const [benchmarkFilter, setBenchmarkFilter] = useState('all');

  // Sort
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Pagination (simple load-more)
  const PAGE_SIZE = 50;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const loadBenchmarks = useCallback(async () => {
    try {
      const data = await asyncBenchmarkStorage.getAll();
      setBenchmarks(data);
    } catch (err) {
      console.error('Failed to load benchmarks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBenchmarks(); }, [loadBenchmarks]);

  // Flatten all runs
  const allRows = useMemo(() => flattenRuns(benchmarks), [benchmarks]);

  // Unique agents that appear in runs (for filter dropdown)
  const runAgents = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of allRows) {
      if (!seen.has(r.run.agentKey)) seen.set(r.run.agentKey, r.agentName);
    }
    return Array.from(seen, ([key, name]) => ({ key, name }));
  }, [allRows]);

  // Benchmark names for filter
  const benchmarkNames = useMemo(
    () => benchmarks.map(b => ({ id: b.id, name: b.name })),
    [benchmarks]
  );

  // Filter
  const filtered = useMemo(() => {
    let rows = allRows;
    if (agentFilter !== 'all') rows = rows.filter(r => r.run.agentKey === agentFilter);
    if (benchmarkFilter !== 'all') rows = rows.filter(r => r.benchmarkId === benchmarkFilter);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.benchmarkName.toLowerCase().includes(q) ||
        r.agentName.toLowerCase().includes(q) ||
        r.run.name.toLowerCase().includes(q) ||
        r.modelName.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [allRows, agentFilter, benchmarkFilter, search]);

  // Sort
  const sorted = useMemo(() => {
    const copy = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      switch (sortField) {
        case 'timestamp':
          return dir * (new Date(a.run.createdAt).getTime() - new Date(b.run.createdAt).getTime());
        case 'benchmark':
          return dir * a.benchmarkName.localeCompare(b.benchmarkName);
        case 'agent':
          return dir * a.agentName.localeCompare(b.agentName);
        case 'passRate':
          return dir * ((a.passRate ?? -1) - (b.passRate ?? -1));
        case 'status': {
          const order: Record<string, number> = { running: 0, pending: 1, completed: 2, failed: 3, cancelled: 4 };
          return dir * ((order[getEffectiveStatus(a.run)] ?? 5) - (order[getEffectiveStatus(b.run)] ?? 5));
        }
        default: return 0;
      }
    });
    return copy;
  }, [filtered, sortField, sortDir]);

  // Visible slice
  const visible = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // Reset visible count on filter change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, agentFilter, benchmarkFilter]);

  const handleRowClick = (row: RunRow) => {
    navigate(`/benchmarks3/${row.benchmarkId}/runs`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Benchmark Runs</h2>
          <p className="text-[11px] text-muted-foreground">
            {sorted.length} run{sorted.length !== 1 ? 's' : ''} across {benchmarks.length} benchmark{benchmarks.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={loadBenchmarks}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <SummaryCards benchmarks={benchmarks} rows={allRows} />

      {/* Filters */}
      <FilterBar
        search={search} onSearchChange={setSearch}
        agentFilter={agentFilter} onAgentChange={setAgentFilter}
        benchmarkFilter={benchmarkFilter} onBenchmarkChange={setBenchmarkFilter}
        agents={runAgents}
        benchmarkNames={benchmarkNames}
      />

      {/* Table */}
      <div className="flex-1 overflow-y-auto border border-border rounded-lg">
        {/* Column headers */}
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border sticky top-0 z-10">
          <ColHeader label="Benchmark" field="benchmark" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="flex-1 min-w-0" />
          <ColHeader label="Agent" field="agent" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="w-32 shrink-0" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-28 shrink-0">Model</span>
          <ColHeader label="Pass Rate" field="passRate" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="w-20 shrink-0 justify-end" />
          <ColHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="w-24 shrink-0" />
          <ColHeader label="Time" field="timestamp" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="w-24 shrink-0 text-right" />
        </div>

        {/* Rows */}
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FlaskConical size={32} className="mb-2 opacity-30" />
            <p className="text-sm">
              {allRows.length === 0 ? 'No benchmark runs yet' : 'No runs match your filters'}
            </p>
            {(search || agentFilter !== 'all' || benchmarkFilter !== 'all') && (
              <button
                onClick={() => { setSearch(''); setAgentFilter('all'); setBenchmarkFilter('all'); }}
                className="mt-2 text-xs text-blue-500 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            {visible.map((row, i) => {
              const status = getEffectiveStatus(row.run);
              return (
                <div
                  key={`${row.benchmarkId}-${row.run.id}-${i}`}
                  onClick={() => handleRowClick(row)}
                  className="flex items-center gap-2 px-3 py-2 border-b border-border/40 hover:bg-muted/20 cursor-pointer transition-colors"
                >
                  {/* Benchmark name + run name */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{row.benchmarkName}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{row.run.name}</div>
                  </div>

                  {/* Agent */}
                  <div className="w-32 shrink-0 text-xs truncate">{row.agentName}</div>

                  {/* Model */}
                  <div className="w-28 shrink-0 text-[11px] text-muted-foreground truncate">{row.modelName}</div>

                  {/* Pass Rate */}
                  <div className="w-20 shrink-0 text-right">
                    <PassRateBadge rate={row.passRate} />
                  </div>

                  {/* Status */}
                  <div className="w-24 shrink-0">
                    <StatusBadge status={status} />
                  </div>

                  {/* Timestamp */}
                  <div className="w-24 shrink-0 text-right text-[11px] text-muted-foreground">
                    {formatRelativeTime(row.run.createdAt)}
                  </div>
                </div>
              );
            })}

            {/* Load more */}
            {hasMore && (
              <button
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                className="w-full py-2 text-xs text-blue-500 hover:bg-muted/30 transition-colors"
              >
                Load more ({sorted.length - visibleCount} remaining)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
