/*
 * TestCasesPage4 — Evals 3: Test Cases
 *
 * Agent Traces-style filter bar + sticky table headers + sortable columns.
 * Grouped by benchmark with expand/collapse toggle.
 * Time filter + search + agent filter in header (global, scopes both tabs).
 * Benchmark count as "In N benchmarks" with click-to-expand dropdown.
 * Benchmark name count moved left next to group header.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, ChevronDown, CheckCircle2, XCircle,
  Loader2, Clock, Search, RefreshCw, Activity, BarChart3,
  SlidersHorizontal, Layers, List, ChevronsDownUp, ChevronsUpDown, Upload, Plus,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { asyncTestCaseStorage, asyncRunStorage, asyncBenchmarkStorage } from '@/services/storage';
import { TestCase, TestCaseRun, Benchmark } from '@/types';
import { formatRelativeTime } from '@/lib/utils';
import { TestCaseEditor } from '../TestCaseEditor';
import { validateTestCasesArrayJson } from '@/lib/testCaseValidation';

// ─── Time Filter ─────────────────────────────────────────────────────────────

type TimeRange = '1h' | '6h' | '1d' | '7d' | '30d' | 'all';
const TIME_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '1h', label: 'Last 1h' }, { value: '6h', label: 'Last 6h' },
  { value: '1d', label: 'Last 1d' }, { value: '7d', label: 'Last 7d' },
  { value: '30d', label: 'Last 30d' }, { value: 'all', label: 'All time' },
];
function getTimeThreshold(range: TimeRange): Date | null {
  if (range === 'all') return null;
  const ms: Record<string, number> = { '1h': 3600000, '6h': 21600000, '1d': 86400000, '7d': 604800000, '30d': 2592000000 };
  return new Date(Date.now() - ms[range]);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(s: string | undefined, max: number): string {
  if (!s) return '—';
  return s.length > max ? s.slice(0, max) + '…' : s;
}
function getPassFail(run: TestCaseRun): 'pass' | 'fail' | 'running' | 'unknown' {
  if (run.status === 'running') return 'running';
  if (run.passFailStatus === 'passed') return 'pass';
  if (run.passFailStatus === 'failed') return 'fail';
  if (run.status === 'completed') return run.metrics?.accuracy >= 50 ? 'pass' : 'fail';
  return 'unknown';
}


function PassFailBadge({ result }: { result: 'pass' | 'fail' | 'running' | 'unknown' }) {
  const c = {
    pass: { icon: <CheckCircle2 size={12} />, label: 'Pass', cls: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-500/10 border-green-300 dark:border-green-500/20' },
    fail: { icon: <XCircle size={12} />, label: 'Fail', cls: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-500/10 border-red-300 dark:border-red-500/20' },
    running: { icon: <Loader2 size={12} className="animate-spin" />, label: 'Running', cls: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/20' },
    unknown: { icon: <Clock size={12} />, label: '—', cls: 'text-muted-foreground bg-muted/50 border-border' },
  }[result];
  return <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium border ${c.cls}`}>{c.icon} {c.label}</span>;
}

type SortField = 'name' | 'lastRun' | 'runs';
type SortDir = 'asc' | 'desc';

function SortHeader({ label, active, dir, onClick, className }: {
  label: string; active: boolean; dir: SortDir; onClick: () => void; className?: string;
}) {
  return (
    <th className={`h-8 px-3 text-left align-middle font-medium text-xs text-muted-foreground bg-background border-b cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap ${className || ''}`}
      onClick={onClick}>
      <span className="inline-flex items-center gap-1">{label}{active && <ChevronDown size={10} className={dir === 'asc' ? 'rotate-180' : ''} />}</span>
    </th>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export const TestCasesPage4: React.FC = () => {
  const navigate = useNavigate();
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [runCounts, setRunCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('test-cases');
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('grouped');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import/Editor state
  const [isImporting, setIsImporting] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTestCase, setEditingTestCase] = useState<TestCase | null>(null);

  // Sort
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({ field: 'name', dir: 'asc' });

  // Runs tab — deferred
  const [allRuns, setAllRuns] = useState<TestCaseRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const runsLoadedRef = useRef(false);

  const loadDefinitions = useCallback(async () => {
    try {
      const [tcs, counts, bms] = await Promise.all([
        asyncTestCaseStorage.getAll(), asyncRunStorage.getRunCountsByTestCase(), asyncBenchmarkStorage.getAll(),
      ]);
      setTestCases(tcs as TestCase[]); setRunCounts(counts); setBenchmarks(bms);
    } catch (err) { console.error('Failed:', err); }
    finally { setLoading(false); }
  }, []);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try { const runs = await asyncRunStorage.getAllReports({ limit: 500 }); setAllRuns(runs as unknown as TestCaseRun[]); runsLoadedRef.current = true; }
    catch (err) { console.error('Failed:', err); }
    finally { setRunsLoading(false); }
  }, []);

  useEffect(() => { loadDefinitions(); }, [loadDefinitions]);
  useEffect(() => { if (activeTab === 'runs' && !runsLoadedRef.current && !runsLoading) loadRuns(); }, [activeTab, loadRuns, runsLoading]);

  // Scroll shadow
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const h = () => setIsScrolled(el.scrollTop > 10);
    el.addEventListener('scroll', h); return () => el.removeEventListener('scroll', h);
  }, []);

  const tcMap = useMemo(() => new Map(testCases.map(tc => [tc.id, tc])), [testCases]);

  // Reverse map: tcId → benchmarks
  const tcBenchmarkMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>();
    for (const bm of benchmarks) for (const tcId of bm.testCaseIds) {
      if (!map.has(tcId)) map.set(tcId, []);
      map.get(tcId)!.push({ id: bm.id, name: bm.name });
    }
    return map;
  }, [benchmarks]);

  // Latest run by TC (from all runs)
  const latestRunByTc = useMemo(() => {
    const map: Record<string, string> = {};
    for (const run of allRuns) { const tcId = (run as any).testCaseId; if (tcId && (!map[tcId] || new Date(run.timestamp) > new Date(map[tcId]))) map[tcId] = run.timestamp; }
    return map;
  }, [allRuns]);

  // Filtered test cases
  const filteredTcs = useMemo(() => {
    let list = testCases;
    if (search) { const q = search.toLowerCase(); list = list.filter(tc => tc.name.toLowerCase().includes(q) || tc.initialPrompt?.toLowerCase().includes(q)); }
    return list;
  }, [testCases, search]);

  // Sort test cases within groups (lastRun, runs)
  const sortTcsWithinGroup = useCallback((tcs: TestCase[]): TestCase[] => {
    if (sort.field === 'name') return tcs; // name sorts groups, not TCs within
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...tcs].sort((a, b) => {
      switch (sort.field) {
        case 'lastRun': {
          const aRun = latestRunByTc[a.id] || '';
          const bRun = latestRunByTc[b.id] || '';
          return dir * aRun.localeCompare(bRun);
        }
        case 'runs': return dir * ((runCounts[a.id] || 0) - (runCounts[b.id] || 0));
        default: return 0;
      }
    });
  }, [sort, latestRunByTc, runCounts]);

  // For flat view: sort all test cases by the active sort field
  const sortedTcs = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filteredTcs].sort((a, b) => {
      switch (sort.field) {
        case 'name': return dir * (a.name || '').localeCompare(b.name || '');
        case 'lastRun': {
          const aRun = latestRunByTc[a.id] || '';
          const bRun = latestRunByTc[b.id] || '';
          return dir * aRun.localeCompare(bRun);
        }
        case 'runs': return dir * ((runCounts[a.id] || 0) - (runCounts[b.id] || 0));
        default: return 0;
      }
    });
  }, [filteredTcs, sort, latestRunByTc, runCounts]);

  const handleSort = (field: SortField) => {
    setSort(prev => prev.field === field ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' });
  };

  // Grouped data — Name sort applies to group order, other sorts apply within groups
  const groupedData = useMemo(() => {
    const assignedTcIds = new Set<string>();
    const groups: { id: string; name: string; testCases: TestCase[] }[] = [];
    for (const bm of benchmarks) {
      const tcs = bm.testCaseIds.map(id => filteredTcs.find(tc => tc.id === id)).filter((tc): tc is TestCase => !!tc);
      if (tcs.length > 0) {
        groups.push({ id: bm.id, name: bm.name, testCases: sortTcsWithinGroup(tcs) });
        tcs.forEach(tc => assignedTcIds.add(tc.id));
      }
    }
    const unassigned = filteredTcs.filter(tc => !assignedTcIds.has(tc.id));
    if (unassigned.length > 0) groups.push({ id: '__unassigned__', name: 'Unassigned', testCases: sortTcsWithinGroup(unassigned) });

    // Sort groups by benchmark name when Name column is sorted
    if (sort.field === 'name') {
      const dir = sort.dir === 'asc' ? 1 : -1;
      groups.sort((a, b) => {
        if (a.id === '__unassigned__') return 1;
        if (b.id === '__unassigned__') return -1;
        return dir * a.name.localeCompare(b.name);
      });
    }

    return groups;
  }, [benchmarks, filteredTcs, sort, sortTcsWithinGroup]);

  const toggleGroup = (id: string) => setCollapsedGroups(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Runs tab
  const timeFilteredRuns = useMemo(() => { const t = getTimeThreshold(timeRange); return t ? allRuns.filter(r => new Date(r.timestamp) >= t) : allRuns; }, [allRuns, timeRange]);
  const totalRuns = timeFilteredRuns.length;
  const passCount = timeFilteredRuns.filter(r => getPassFail(r) === 'pass').length;
  const passRate = totalRuns > 0 ? Math.round((passCount / totalRuns) * 100) : 0;
  const filteredRuns = useMemo(() => {
    if (!search) return timeFilteredRuns;
    const q = search.toLowerCase(); const nm = new Map(testCases.map(tc => [tc.id, tc.name]));
    return timeFilteredRuns.filter(r => { const n = nm.get((r as any).testCaseId) || ''; return n.toLowerCase().includes(q) || r.agentName?.toLowerCase().includes(q); });
  }, [timeFilteredRuns, search, testCases]);

  // Import handler
  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const validation = validateTestCasesArrayJson(json);
      if (!validation.valid || !validation.data) return;
      const result = await asyncTestCaseStorage.bulkCreate(validation.data);
      if (result.created > 0) {
        const allTcs = await asyncTestCaseStorage.getAll();
        const createdIds = (allTcs as TestCase[]).filter(tc => validation.data!.some(d => d.name === tc.name)).map(tc => tc.id);
        const bm = await asyncBenchmarkStorage.create({
          name: file.name.replace(/\.json$/i, '') || 'Imported Benchmark',
          description: `Auto-created from import of ${result.created} test case(s)`,
          currentVersion: 1,
          versions: [{ version: 1, createdAt: new Date().toISOString(), testCaseIds: createdIds }],
          testCaseIds: createdIds, runs: [],
        });
        navigate(`/evals3/benchmarks/${bm.id}/runs`);
      }
    } catch (err) { console.error('Import failed:', err); }
    finally { setIsImporting(false); event.target.value = ''; }
  };

  const handleEditorSave = async () => { setShowEditor(false); setEditingTestCase(null); loadDefinitions(); };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>;


  // Render a test case row (shared between grouped and flat)
  const renderTcRow = (tc: TestCase, indent: boolean = false) => {
    const lastRun = latestRunByTc[tc.id];
    const count = runCounts[tc.id] || 0;
    const bmList = tcBenchmarkMap.get(tc.id) || [];
    return (
      <tr key={tc.id} className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
        onClick={() => navigate(`/evals3/test-cases/${tc.id}`)}>
        <td className={`px-3 py-2.5 align-middle ${indent ? 'pl-8' : ''}`}>
          <div className="text-sm font-medium truncate max-w-[280px]">{tc.name}</div>
          <div className="flex items-center gap-1 mt-0.5">
            {tc.labels?.slice(0, 2).map(l => <Badge key={l} variant="outline" className="text-[10px] px-1 py-0">{l}</Badge>)}
          </div>
        </td>
        <td className="px-3 py-2.5 align-middle relative">
          {bmList.length > 0 ? (
            <button className="text-[10px] text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 transition-colors"
              onClick={e => { e.stopPropagation(); setOpenPopoverId(openPopoverId === tc.id ? null : tc.id); }}>
              In {bmList.length} benchmark{bmList.length !== 1 ? 's' : ''}
            </button>
          ) : <span className="text-[10px] text-muted-foreground italic">none</span>}
          {openPopoverId === tc.id && bmList.length > 0 && (
            <div className="absolute top-8 left-3 z-20 bg-popover border border-border rounded-md shadow-lg p-2 min-w-[160px]">
              {bmList.map(bm => (
                <div key={bm.id} className="text-xs px-2 py-1.5 rounded hover:bg-muted cursor-pointer flex items-center gap-1.5"
                  onClick={e => { e.stopPropagation(); navigate(`/evals3/benchmarks/${bm.id}/runs`); }}>
                  <Badge className="text-[8px] px-1 py-0 bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-500/15 dark:text-purple-400 dark:border-purple-500/30 shrink-0">BM</Badge>{bm.name}
                </div>
              ))}
            </div>
          )}
        </td>
        <td className="px-3 py-2.5 align-middle text-[11px] text-muted-foreground truncate max-w-[200px]">{truncate(tc.initialPrompt, 50)}</td>
        <td className="px-3 py-2.5 align-middle text-[11px] text-muted-foreground whitespace-nowrap">{lastRun ? formatRelativeTime(lastRun) : '—'}</td>
        <td className="px-3 py-2.5 align-middle text-right">
          {count > 0 ? <Badge variant="outline" className="text-[10px]">{count}</Badge> : <span className="text-[11px] text-muted-foreground">—</span>}
        </td>
      </tr>
    );
  };

  return (
    <div className="p-4 h-full flex flex-col">
      {/* ── Header with filters ────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">Test Cases</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">Define prompts and expected outcomes to evaluate agent behavior</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-[200px] relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} className="pl-7 h-7 text-xs md:text-xs" />
          </div>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs font-normal">
            <SlidersHorizontal size={12} /> Filter
          </Button>
          <Select value={timeRange} onValueChange={v => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[85px] h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{TIME_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isImporting} className="h-7 gap-1.5 text-xs font-normal">
            <Upload size={12} /> {isImporting ? 'Importing...' : 'Import JSON'}
          </Button>
          <Button size="sm" onClick={() => { setEditingTestCase(null); setShowEditor(true); }} className="h-7 gap-1.5 text-xs">
            <Plus size={12} /> New Test Case
          </Button>
          <Button variant="outline" size="sm" onClick={() => { loadDefinitions(); if (runsLoadedRef.current) loadRuns(); }} disabled={loading} className="h-7">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <TabsList>
            <TabsTrigger value="test-cases" className="text-xs">Test Cases</TabsTrigger>
            <TabsTrigger value="runs" className="text-xs">Runs</TabsTrigger>
          </TabsList>
          {activeTab === 'test-cases' && (
            <div className="flex items-center gap-2">
              {/* Expand/Collapse All — only in grouped mode */}
              {viewMode === 'grouped' && (
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => setCollapsedGroups(new Set())}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Expand all"
                  >
                    <ChevronsUpDown size={14} />
                  </button>
                  <button
                    onClick={() => setCollapsedGroups(new Set(groupedData.map(g => g.id)))}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Collapse all"
                  >
                    <ChevronsDownUp size={14} />
                  </button>
                </div>
              )}
              {/* View mode toggle */}
              <div className="flex items-center border border-border rounded-md overflow-hidden">
                <button onClick={() => setViewMode('grouped')} className={`px-2 py-1 text-xs flex items-center gap-1 transition-colors ${viewMode === 'grouped' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  <Layers size={12} /> Grouped
                </button>
                <button onClick={() => setViewMode('flat')} className={`px-2 py-1 text-xs flex items-center gap-1 transition-colors ${viewMode === 'flat' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  <List size={12} /> Flat
                </button>
              </div>
            </div>
          )}
        </div>


        {/* ── Tab 1: Test Cases ──────────────────────────────────────── */}
        <TabsContent value="test-cases" className="flex-1 overflow-hidden mt-0">
          <div ref={scrollRef} className="h-full overflow-y-auto rounded-lg border border-border">
            <table className="w-full caption-bottom text-sm">
              <thead className={`sticky top-0 z-10 bg-background transition-shadow duration-200 ${isScrolled ? 'shadow-sm' : ''}`}>
                <tr className="border-b">
                  <SortHeader label="Name" active={sort.field === 'name'} dir={sort.dir} onClick={() => handleSort('name')} />
                  <th className="h-8 px-3 text-left align-middle font-medium text-xs text-muted-foreground bg-background border-b whitespace-nowrap"></th>
                  <th className="h-8 px-3 text-left align-middle font-medium text-xs text-muted-foreground bg-background border-b whitespace-nowrap">Input Prompt</th>
                  <SortHeader label="Last Run" active={sort.field === 'lastRun'} dir={sort.dir} onClick={() => handleSort('lastRun')} />
                  <SortHeader label="Runs" active={sort.field === 'runs'} dir={sort.dir} onClick={() => handleSort('runs')} className="text-right" />
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {viewMode === 'grouped' ? (
                  groupedData.length === 0 ? (
                    <tr><td colSpan={5} className="py-16 text-center text-sm text-muted-foreground">No test cases found</td></tr>
                  ) : (
                    groupedData.map(group => {
                      const isCollapsed = collapsedGroups.has(group.id);
                      const isUnassigned = group.id === '__unassigned__';
                      return (
                        <React.Fragment key={group.id}>
                          {/* Group header */}
                          <tr className={`border-b cursor-pointer hover:bg-muted/30 transition-colors ${isUnassigned ? 'bg-muted/10' : 'bg-purple-50 dark:bg-purple-500/5'}`}
                            onClick={() => toggleGroup(group.id)}>
                            <td colSpan={5} className="px-3 py-2 align-middle">
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">{isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>
                                {!isUnassigned && <Badge className="text-[9px] px-1 py-0 bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-500/15 dark:text-purple-400 dark:border-purple-500/30 font-semibold uppercase tracking-wider">Benchmark</Badge>}
                                <span className="text-xs font-semibold">{group.name}</span>
                                <span className="text-[10px] text-muted-foreground">({group.testCases.length} test case{group.testCases.length !== 1 ? 's' : ''})</span>
                              </div>
                            </td>
                          </tr>
                          {!isCollapsed && group.testCases.map(tc => renderTcRow(tc, true))}
                        </React.Fragment>
                      );
                    })
                  )
                ) : (
                  sortedTcs.length === 0 ? (
                    <tr><td colSpan={5} className="py-16 text-center text-sm text-muted-foreground">No test cases found</td></tr>
                  ) : sortedTcs.map(tc => renderTcRow(tc, false))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── Tab 2: Runs ────────────────────────────────────────────── */}
        <TabsContent value="runs" className="flex-1 overflow-hidden mt-0">
          {runsLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-muted-foreground" /><span className="ml-2 text-xs text-muted-foreground">Loading runs...</span></div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card">
                  <Activity size={16} className="text-purple-500" /><div><div className="text-lg font-semibold leading-tight">{totalRuns}</div><div className="text-[11px] text-muted-foreground">Total Runs</div></div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card">
                  <BarChart3 size={16} className="text-green-500" /><div><div className="text-lg font-semibold leading-tight">{passRate}%</div><div className="text-[11px] text-muted-foreground">Pass Rate</div></div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card">
                  <CheckCircle2 size={16} className="text-blue-500" /><div><div className="text-lg font-semibold leading-tight">{passCount} / {totalRuns}</div><div className="text-[11px] text-muted-foreground">Passed</div></div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto rounded-lg border border-border">
                <table className="w-full caption-bottom text-sm">
                  <thead className="sticky top-0 z-10 bg-background">
                    <tr className="border-b">
                      <th className="h-8 w-6 px-2 align-middle bg-background border-b" />
                      <th className="h-8 px-3 text-left align-middle font-medium text-xs text-muted-foreground bg-background border-b">Test Case</th>
                      <th className="h-8 px-3 text-left align-middle font-medium text-xs text-muted-foreground bg-background border-b">Agent</th>
                      <th className="h-8 px-3 text-left align-middle font-medium text-xs text-muted-foreground bg-background border-b">Timestamp</th>
                      <th className="h-8 px-3 text-left align-middle font-medium text-xs text-muted-foreground bg-background border-b">Result</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {filteredRuns.length === 0 ? (
                      <tr><td colSpan={5} className="py-16 text-center text-sm text-muted-foreground">{timeRange === 'all' ? 'No runs found' : `No runs in ${TIME_OPTIONS.find(o => o.value === timeRange)?.label}`}</td></tr>
                    ) : filteredRuns.map(run => {
                      const tc = tcMap.get((run as any).testCaseId);
                      const result = getPassFail(run);
                      const tcId = (run as any).testCaseId;
                      return (
                        <tr key={run.id} className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => tcId && navigate(`/evals3/test-cases/${tcId}`)}>
                          <td className="px-2 py-2.5 align-middle text-center"><ChevronRight size={13} className="text-muted-foreground" /></td>
                          <td className="px-3 py-2.5 align-middle"><div className="text-sm font-medium truncate max-w-[240px]">{tc?.name || tcId}</div></td>
                          <td className="px-3 py-2.5 align-middle text-xs truncate max-w-[120px]">{run.agentName || '—'}</td>
                          <td className="px-3 py-2.5 align-middle text-[11px] text-muted-foreground whitespace-nowrap">{formatRelativeTime(run.timestamp)}</td>
                          <td className="px-3 py-2.5 align-middle"><PassFailBadge result={result} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
      {/* Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
          <div className="fixed inset-4 z-50 overflow-auto bg-background border rounded-lg shadow-lg">
            <TestCaseEditor testCase={editingTestCase} onSave={handleEditorSave} onCancel={() => { setShowEditor(false); setEditingTestCase(null); }} />
          </div>
        </div>
      )}
    </div>
  );
};
