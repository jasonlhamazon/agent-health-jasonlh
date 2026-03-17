/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AgentTracesPage - Agent Traces Table View
 *
 * Table-based view showing agent traces from OTEL data with:
 * - Table format with trace summaries
 * - Latency histogram distribution
 * - Flyout panel for detailed trace view
 * - Input/output display for spans following OTEL conventions
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  Activity,
  CheckCircle2,
  XCircle,
  ChevronRight,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Span } from '@/types';
import { DEFAULT_CONFIG } from '@/lib/constants';
import {
  fetchRecentTraces,
  groupSpansByTrace,
} from '@/services/traces';
import { formatDuration, formatCompact } from '@/services/traces/utils';
import { TraceFlyoutContent } from './TraceFlyoutContent';
import MetricsOverview from './MetricsOverview';
import { useSidebarCollapse } from '../Layout';

// ==================== Types ====================

interface TraceTableRow {
  traceId: string;
  rootSpanName: string;
  serviceName: string;
  startTime: Date;
  duration: number;
  spanCount: number;
  hasErrors: boolean;
  spans: Span[];
}

// ==================== Sub-Components ====================

interface TraceRowProps {
  trace: TraceTableRow;
  onSelect: () => void;
  isSelected: boolean;
}

const TraceRow: React.FC<TraceRowProps> = ({ trace, onSelect, isSelected }) => {
  return (
    <tr
      className={`border-b transition-colors cursor-pointer hover:bg-muted/50 ${isSelected ? 'bg-muted/70' : ''}`}
      onClick={onSelect}
    >
      <td className="p-4 align-middle text-xs text-muted-foreground w-[180px]">
        {trace.startTime.toLocaleString()}
      </td>
      <td className="p-4 align-middle font-mono text-xs">
        <div className="flex items-center gap-2">
          {trace.hasErrors ? (
            <XCircle size={14} className="text-red-700 dark:text-red-400" />
          ) : (
            <CheckCircle2 size={14} className="text-green-700 dark:text-green-400" />
          )}
          <span title={trace.traceId}>
            {trace.traceId}
          </span>
        </div>
      </td>
      <td className="p-4 align-middle">
        <span title={trace.rootSpanName}>
          {trace.rootSpanName}
        </span>
      </td>
      <td className="p-4 align-middle">
        <Badge variant="outline" className="text-xs">
          {trace.serviceName || 'unknown'}
        </Badge>
      </td>
      <td className="p-4 align-middle">
        <span className={`font-mono text-xs ${trace.duration > 5000 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
          {formatDuration(trace.duration)}
        </span>
      </td>
      <td className="p-4 align-middle text-center">
        <Badge variant="secondary" className="text-xs">
          {formatCompact(trace.spanCount)}
        </Badge>
      </td>
      <td className="p-4 align-middle">
        <ChevronRight size={16} className="text-muted-foreground" />
      </td>
    </tr>
  );
};

// ==================== Main Component ====================

export const AgentTracesPage: React.FC = () => {
  // Sidebar collapse control
  const { isCollapsed, setIsCollapsed } = useSidebarCollapse();
  
  // Filter state
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [textSearch, setTextSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [timeRange, setTimeRange] = useState<string>('1440'); // Default to 1 day

  // Advanced filter state
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [rootSpanSuggestOpen, setRootSpanSuggestOpen] = useState(false);
  const [filters, setFilters] = useState<{
    status: string;
    rootSpan: string;
    traceId: string;
    durationRange: string;
    durationMin: string;
    durationMax: string;
    spanCountRange: string;
    spanCountMin: string;
    spanCountMax: string;
  }>({
    status: 'all',
    rootSpan: '',
    traceId: '',
    durationRange: 'all',
    durationMin: '',
    durationMax: '',
    spanCountRange: 'all',
    spanCountMin: '',
    spanCountMax: '',
  });

  // Loading state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Trace data
  const [spans, setSpans] = useState<Span[]>([]);
  const [allTraces, setAllTraces] = useState<TraceTableRow[]>([]); // All fetched traces
  const [displayedTraces, setDisplayedTraces] = useState<TraceTableRow[]>([]); // Currently displayed traces
  const [displayCount, setDisplayCount] = useState(100); // Number of traces to display

  // Flyout state
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [selectedTrace, setSelectedTrace] = useState<TraceTableRow | null>(null);

  // Scroll state for hiding container header
  const [isScrolled, setIsScrolled] = useState(false);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Intersection observer ref for lazy loading
  const loadMoreRef = React.useRef<HTMLTableRowElement>(null);

  // Get unique service names from agents config (no memo — recomputes when
  // parent App re-renders after refreshConfig(), keeping custom agents visible)
  const agentOptions = (() => {
    const agents = DEFAULT_CONFIG.agents
      .filter(a => a.enabled !== false)
      .map(a => ({ value: a.name, label: a.name }));
    return [{ value: 'all', label: 'All Agents' }, ...agents];
  })();

  // Time range options
  const timeRangeOptions = [
    { value: '15', label: 'Last 15m' },
    { value: '60', label: 'Last 1hr' },
    { value: '180', label: 'Last 3hr' },
    { value: '360', label: 'Last 6hr' },
    { value: '720', label: 'Last 12hr' },
    { value: '1440', label: 'Last 1d' },
    { value: '4320', label: 'Last 3d' },
    { value: '10080', label: 'Last 7d' },
  ];

  // Debounce text search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(textSearch);
    }, 500);
    return () => clearTimeout(timer);
  }, [textSearch]);

  // Convert spans to trace table rows
  const processSpansToTraces = useCallback((allSpans: Span[]): TraceTableRow[] => {
    const traceGroups = groupSpansByTrace(allSpans);

    return traceGroups.map(group => {
      const rootSpan = group.spans.find(s => !s.parentSpanId) || group.spans[0];
      const hasErrors = group.spans.some(s => s.status === 'ERROR');

      // Calculate duration from time range
      const times = group.spans.map(s => ({
        start: new Date(s.startTime).getTime(),
        end: new Date(s.endTime).getTime(),
      }));
      const minStart = Math.min(...times.map(t => t.start));
      const maxEnd = Math.max(...times.map(t => t.end));

      return {
        traceId: group.traceId,
        rootSpanName: rootSpan.name,
        serviceName: rootSpan.attributes?.['service.name'] || 'unknown',
        startTime: new Date(minStart),
        duration: maxEnd - minStart,
        spanCount: group.spans.length,
        hasErrors,
        spans: group.spans,
      };
    }).sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }, []);

  // Fetch traces
  const fetchTraces = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchRecentTraces({
        minutesAgo: parseInt(timeRange),
        serviceName: selectedAgent !== 'all' ? selectedAgent : undefined,
        textSearch: debouncedSearch || undefined,
        size: 1000,
      });

      if (result.warning) {
        setError(`Trace query warning: ${result.warning}`);
      }

      setSpans(result.spans);
      const processedTraces = processSpansToTraces(result.spans);
      setAllTraces(processedTraces);
      setDisplayedTraces(processedTraces.slice(0, 100));
      setDisplayCount(100);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch traces');
    } finally {
      setIsLoading(false);
    }
  }, [selectedAgent, debouncedSearch, timeRange, processSpansToTraces]);

  // Initial fetch and refetch on filter change
  useEffect(() => {
    fetchTraces();
  }, [fetchTraces]);

  // Handle scroll to hide/show container header
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      // Hide header when scrolled more than 10px
      setIsScrolled(scrollContainer.scrollTop > 10);
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle trace selection
  const handleSelectTrace = (trace: TraceTableRow) => {
    // If flyout is already open, just update the selected trace (no close/reopen flash)
    // If flyout is closed, open it with the selected trace and collapse the sidebar
    setSelectedTrace(trace);
    if (!flyoutOpen) {
      setFlyoutOpen(true);
      // Collapse sidebar when opening flyout for more screen space
      setIsCollapsed(true);
    }
  };

  // Close flyout
  const handleCloseFlyout = () => {
    setFlyoutOpen(false);
    setSelectedTrace(null);
  };

  // Calculate latency distribution for histogram
  const latencyDistribution = useMemo(() => {
    if (allTraces.length === 0) return [];

    // Create buckets for histogram
    const buckets = [
      { label: '<100ms', min: 0, max: 100, count: 0 },
      { label: '100-500ms', min: 100, max: 500, count: 0 },
      { label: '500ms-1s', min: 500, max: 1000, count: 0 },
      { label: '1-5s', min: 1000, max: 5000, count: 0 },
      { label: '5-10s', min: 5000, max: 10000, count: 0 },
      { label: '>10s', min: 10000, max: Infinity, count: 0 },
    ];

    allTraces.forEach(trace => {
      const bucket = buckets.find(b => trace.duration >= b.min && trace.duration < b.max);
      if (bucket) bucket.count++;
    });

    return buckets;
  }, [allTraces]);

  // Calculate time series data for errors and requests
  const { errorTimeSeries, requestTimeSeries } = useMemo(() => {
    if (allTraces.length === 0) {
      return {
        errorTimeSeries: [],
        requestTimeSeries: [],
      };
    }

    // Create 20 time buckets for the selected time range
    const numBuckets = 20;
    const now = Date.now();
    const timeRangeMs = parseInt(timeRange) * 60 * 1000;
    const bucketSize = timeRangeMs / numBuckets;

    const errorBuckets = Array(numBuckets).fill(0);
    const requestBuckets = Array(numBuckets).fill(0);

    allTraces.forEach(trace => {
      const traceTime = trace.startTime.getTime();
      const bucketIndex = Math.floor((now - traceTime) / bucketSize);
      const reversedIndex = numBuckets - 1 - bucketIndex;

      if (reversedIndex >= 0 && reversedIndex < numBuckets) {
        requestBuckets[reversedIndex]++;
        if (trace.hasErrors) {
          errorBuckets[reversedIndex]++;
        }
      }
    });

    return {
      errorTimeSeries: errorBuckets.map((count, idx) => ({
        timestamp: new Date(now - (numBuckets - idx) * bucketSize),
        value: count,
      })),
      requestTimeSeries: requestBuckets.map((count, idx) => ({
        timestamp: new Date(now - (numBuckets - idx) * bucketSize),
        value: count,
      })),
    };
  }, [allTraces, timeRange]);

  // Calculate stats
  const stats = useMemo(() => {
    if (allTraces.length === 0) return { total: 0, totalSpans: 0, errors: 0, avgDuration: 0 };

    const errors = allTraces.filter(t => t.hasErrors).length;
    const avgDuration = allTraces.reduce((sum, t) => sum + t.duration, 0) / allTraces.length;
    const totalSpans = allTraces.reduce((sum, t) => sum + t.spanCount, 0);

    return {
      total: allTraces.length,
      totalSpans,
      errors,
      avgDuration,
    };
  }, [allTraces]);

  // Unique root span names for autosuggest (derived from in-memory data, zero cost)
  const uniqueRootSpans = useMemo(() => {
    const names = new Set(allTraces.map(t => t.rootSpanName));
    return Array.from(names).sort();
  }, [allTraces]);

  // Filtered suggestions based on current input
  const rootSpanSuggestions = useMemo(() => {
    if (!filters.rootSpan) return uniqueRootSpans.slice(0, 10);
    const q = filters.rootSpan.toLowerCase();
    return uniqueRootSpans.filter(n => n.toLowerCase().includes(q)).slice(0, 10);
  }, [uniqueRootSpans, filters.rootSpan]);

  // Client-side filtering
  const filteredTraces = useMemo(() => {
    let result = allTraces;

    // Status filter
    if (filters.status === 'success') result = result.filter(t => !t.hasErrors);
    if (filters.status === 'error') result = result.filter(t => t.hasErrors);

    // Root span filter
    if (filters.rootSpan) {
      const q = filters.rootSpan.toLowerCase();
      result = result.filter(t => t.rootSpanName.toLowerCase().includes(q));
    }

    // Trace ID filter
    if (filters.traceId) {
      const q = filters.traceId.toLowerCase();
      result = result.filter(t => t.traceId.toLowerCase().includes(q));
    }

    // Duration filter (values in ms)
    if (filters.durationRange !== 'all') {
      if (filters.durationRange === 'custom') {
        const min = filters.durationMin ? parseFloat(filters.durationMin) : 0;
        const max = filters.durationMax ? parseFloat(filters.durationMax) : Infinity;
        result = result.filter(t => t.duration >= min && t.duration <= max);
      } else if (filters.durationRange === '>10000') {
        result = result.filter(t => t.duration > 10000);
      } else {
        const [min, max] = filters.durationRange.split('-').map(Number);
        result = result.filter(t => t.duration >= min && t.duration < max);
      }
    }

    // Span count filter
    if (filters.spanCountRange !== 'all') {
      if (filters.spanCountRange === 'custom') {
        const min = filters.spanCountMin ? parseInt(filters.spanCountMin) : 0;
        const max = filters.spanCountMax ? parseInt(filters.spanCountMax) : Infinity;
        result = result.filter(t => t.spanCount >= min && t.spanCount <= max);
      } else if (filters.spanCountRange === '>1000') {
        result = result.filter(t => t.spanCount > 1000);
      } else {
        const [min, max] = filters.spanCountRange.split('-').map(Number);
        result = result.filter(t => t.spanCount >= min && t.spanCount <= max);
      }
    }

    // Text search as filter
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(t =>
        t.traceId.toLowerCase().includes(q) ||
        t.rootSpanName.toLowerCase().includes(q) ||
        t.serviceName.toLowerCase().includes(q)
      );
    }

    return result;
  }, [allTraces, filters, debouncedSearch]);

  // Active filter chips
  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    if (filters.status !== 'all') chips.push({ key: 'status', label: `Status: ${filters.status}` });
    if (filters.rootSpan) chips.push({ key: 'rootSpan', label: `Root span: ${filters.rootSpan}` });
    if (filters.traceId) chips.push({ key: 'traceId', label: `Trace ID: ${filters.traceId}` });
    if (filters.durationRange !== 'all') {
      const durationLabels: Record<string, string> = {
        '0-10': '0–10ms', '10-50': '10–50ms', '50-100': '50–100ms',
        '100-1000': '100ms–1s', '1000-5000': '1–5s', '5000-10000': '5–10s',
        '>10000': '>10s',
      };
      const label = filters.durationRange === 'custom'
        ? `Duration: ${filters.durationMin || '0'}–${filters.durationMax || '∞'}ms`
        : `Duration: ${durationLabels[filters.durationRange] || filters.durationRange}`;
      chips.push({ key: 'durationRange', label });
    }
    if (filters.spanCountRange !== 'all') {
      const label = filters.spanCountRange === 'custom'
        ? `Spans: ${filters.spanCountMin || '0'}–${filters.spanCountMax || '∞'}`
        : `Spans: ${filters.spanCountRange}`;
      chips.push({ key: 'spanCountRange', label });
    }
    if (textSearch) chips.push({ key: 'textSearch', label: `Keyword: ${textSearch}` });
    return chips;
  }, [filters, textSearch]);

  // Remove a single filter chip
  const removeFilterChip = (key: string) => {
    if (key === 'textSearch') {
      setTextSearch('');
      return;
    }
    setFilters(prev => {
      const next = { ...prev };
      if (key === 'status') next.status = 'all';
      if (key === 'rootSpan') next.rootSpan = '';
      if (key === 'traceId') next.traceId = '';
      if (key === 'durationRange') {
        next.durationRange = 'all';
        next.durationMin = '';
        next.durationMax = '';
      }
      if (key === 'spanCountRange') {
        next.spanCountRange = 'all';
        next.spanCountMin = '';
        next.spanCountMax = '';
      }
      return next;
    });
  };

  // Clear all filters
  const clearAllFilters = () => {
    setTextSearch('');
    setFilters({
      status: 'all',
      rootSpan: '',
      traceId: '',
      durationRange: 'all',
      durationMin: '',
      durationMax: '',
      spanCountRange: 'all',
      spanCountMin: '',
      spanCountMax: '',
    });
  };

  // Lazy loading with intersection observer
  useEffect(() => {
    const currentRef = loadMoreRef.current;
    if (!currentRef || displayCount >= filteredTraces.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting && displayCount < filteredTraces.length) {
          const nextCount = Math.min(displayCount + 100, filteredTraces.length);
          setDisplayedTraces(filteredTraces.slice(0, nextCount));
          setDisplayCount(nextCount);
        }
      },
      {
        root: null,
        rootMargin: '200px',
        threshold: 0.1,
      }
    );

    observer.observe(currentRef);

    return () => {
      observer.unobserve(currentRef);
    };
  }, [displayCount, filteredTraces]);

  // Reset displayed traces when filteredTraces changes
  useEffect(() => {
    setDisplayedTraces(filteredTraces.slice(0, 100));
    setDisplayCount(100);
  }, [filteredTraces]);

  return (
    <div className="h-full flex flex-col">
      {/* Compact Header with Inline Stats and Filters */}
      <div className="px-6 pt-6 pb-4 border-b">
        {/* Single Row: Title + Stats + Filters */}
        <div className="flex items-start justify-between gap-4">
          {/* Left: Title and Description */}
          <div className="flex-shrink-0">
            <h2 className="text-2xl font-bold">Agent Traces</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Analyze agent execution traces from OTEL
            </p>
          </div>

          {/* Right: Stats and Filters with Last Updated below */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <div className="flex items-center gap-3">
              {/* Search Bar */}
              <div className="w-[220px]">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search"
                    value={textSearch}
                    onChange={(e) => setTextSearch(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
              </div>

              {/* Filter Button */}
              <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
                <PopoverTrigger>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-sm font-normal"
                  >
                    <SlidersHorizontal size={14} />
                    Filter
                    {activeFilterChips.length > 0 && (
                      <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px] rounded-full">
                        {activeFilterChips.length}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[320px] p-0">
                  <div className="p-3 border-b">
                    <div className="text-sm font-medium">Filters</div>
                  </div>
                  <div className="p-3 space-y-3 max-h-[400px] overflow-y-auto">
                    {/* Status */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Status</label>
                      <Select value={filters.status} onValueChange={(v) => setFilters(prev => ({ ...prev, status: v }))}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="success">Success</SelectItem>
                          <SelectItem value="error">Error</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Root Span */}
                    <div className="space-y-1 relative">
                      <label className="text-xs font-medium text-muted-foreground">Root Span</label>
                      <Input
                        placeholder="Filter by root span name"
                        value={filters.rootSpan}
                        onChange={(e) => {
                          setFilters(prev => ({ ...prev, rootSpan: e.target.value }));
                          setRootSpanSuggestOpen(true);
                        }}
                        onFocus={() => setRootSpanSuggestOpen(true)}
                        onBlur={() => setTimeout(() => setRootSpanSuggestOpen(false), 150)}
                        className="h-8 text-sm"
                      />
                      {rootSpanSuggestOpen && rootSpanSuggestions.length > 0 && (
                        <div className="absolute z-50 top-full mt-1 left-0 right-0 max-h-[160px] overflow-y-auto rounded-md border bg-popover shadow-md">
                          {rootSpanSuggestions.map(name => (
                            <button
                              key={name}
                              className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50 truncate"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setFilters(prev => ({ ...prev, rootSpan: name }));
                                setRootSpanSuggestOpen(false);
                              }}
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Trace ID */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Trace ID</label>
                      <Input
                        placeholder="Filter by trace ID"
                        value={filters.traceId}
                        onChange={(e) => setFilters(prev => ({ ...prev, traceId: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>

                    {/* Duration */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Duration</label>
                      <Select
                        value={filters.durationRange}
                        onValueChange={(v) => setFilters(prev => ({
                          ...prev,
                          durationRange: v,
                          ...(v !== 'custom' ? { durationMin: '', durationMax: '' } : {}),
                        }))}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="0-10">0 – 10ms</SelectItem>
                          <SelectItem value="10-50">10 – 50ms</SelectItem>
                          <SelectItem value="50-100">50 – 100ms</SelectItem>
                          <SelectItem value="100-1000">100ms – 1s</SelectItem>
                          <SelectItem value="1000-5000">1 – 5s</SelectItem>
                          <SelectItem value="5000-10000">5 – 10s</SelectItem>
                          <SelectItem value=">10000">&gt; 10s</SelectItem>
                          <SelectItem value="custom">Custom range</SelectItem>
                        </SelectContent>
                      </Select>
                      {filters.durationRange === 'custom' && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <Input
                            placeholder="Min (ms)"
                            type="number"
                            value={filters.durationMin}
                            onChange={(e) => setFilters(prev => ({ ...prev, durationMin: e.target.value }))}
                            className="h-8 text-sm"
                          />
                          <span className="text-xs text-muted-foreground">to</span>
                          <Input
                            placeholder="Max (ms)"
                            type="number"
                            value={filters.durationMax}
                            onChange={(e) => setFilters(prev => ({ ...prev, durationMax: e.target.value }))}
                            className="h-8 text-sm"
                          />
                        </div>
                      )}
                    </div>

                    {/* Span Count */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Number of Spans</label>
                      <Select
                        value={filters.spanCountRange}
                        onValueChange={(v) => setFilters(prev => ({
                          ...prev,
                          spanCountRange: v,
                          ...(v !== 'custom' ? { spanCountMin: '', spanCountMax: '' } : {}),
                        }))}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="0-10">0 – 10</SelectItem>
                          <SelectItem value="10-50">10 – 50</SelectItem>
                          <SelectItem value="50-100">50 – 100</SelectItem>
                          <SelectItem value="100-1000">100 – 1000</SelectItem>
                          <SelectItem value=">1000">&gt; 1000</SelectItem>
                          <SelectItem value="custom">Custom range</SelectItem>
                        </SelectContent>
                      </Select>
                      {filters.spanCountRange === 'custom' && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <Input
                            placeholder="Min"
                            type="number"
                            value={filters.spanCountMin}
                            onChange={(e) => setFilters(prev => ({ ...prev, spanCountMin: e.target.value }))}
                            className="h-8 text-sm"
                          />
                          <span className="text-xs text-muted-foreground">to</span>
                          <Input
                            placeholder="Max"
                            type="number"
                            value={filters.spanCountMax}
                            onChange={(e) => setFilters(prev => ({ ...prev, spanCountMax: e.target.value }))}
                            className="h-8 text-sm"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Footer */}
                  <div className="p-3 border-t flex justify-between">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAllFilters}>
                      Clear all
                    </Button>
                    <Button size="sm" className="h-7 text-xs" onClick={() => setFilterPopoverOpen(false)}>
                      Done
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Agent Filter */}
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger className="w-[110px] h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agentOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Time Range */}
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-[90px] h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeRangeOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Refresh Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={fetchTraces}
                disabled={isLoading}
                className="h-8"
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              </Button>
            </div>
            
            {/* Last Updated - Below stats and filters */}
            {lastRefresh && (
              <span className="text-xs text-muted-foreground">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filter Chips */}
      {activeFilterChips.length > 0 && (
        <div className="px-6 pt-3 flex items-center gap-2 flex-wrap justify-end">
          {activeFilterChips.map(chip => (
            <Badge
              key={chip.key}
              variant="secondary"
              className="gap-1 pr-1 text-xs font-normal"
            >
              {chip.label}
              <button
                onClick={() => removeFilterChip(chip.key)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                aria-label={`Remove ${chip.label} filter`}
              >
                <X size={12} />
              </button>
            </Badge>
          ))}
          <button
            onClick={clearAllFilters}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Metrics Overview - Trends */}
      <div className="px-6 pt-4">
        {allTraces.length > 0 && (
          <MetricsOverview
            latencyDistribution={latencyDistribution}
            errorTimeSeries={errorTimeSeries}
            requestTimeSeries={requestTimeSeries}
            totalRequests={stats.total}
            totalSpans={stats.totalSpans}
            totalErrors={stats.errors}
            avgLatency={stats.avgDuration}
          />
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="px-6 pt-4">
          <Card className="bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/30">
            <CardContent className="p-4 text-sm text-red-700 dark:text-red-400">
              {error}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Traces Table */}
      <Card className="flex-1 flex flex-col overflow-hidden mx-6 mt-4 mb-6">
        <div ref={scrollContainerRef} className="relative flex-1 overflow-auto">
          {allTraces.length === 0 && !isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-12">
              <Activity size={48} className="mb-4 opacity-20" />
              <p>No traces found</p>
              <p className="text-sm mt-1">
                {selectedAgent !== 'all' || textSearch
                  ? 'Try adjusting your filters'
                  : 'Traces will appear here as agents execute'}
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Card Header - fades out on scroll, positioned above table */}
              <div 
                className={`sticky top-0 z-20 bg-background border-b py-2 px-4 transition-all duration-200 ${
                  isScrolled ? 'opacity-0 h-0 py-0 border-0 overflow-hidden' : 'opacity-100'
                }`}
              >
                <div className="text-sm font-medium flex items-center gap-2 whitespace-nowrap">
                  <Activity size={14} />
                  Traces
                  <Badge variant="secondary" className="ml-2">{formatCompact(filteredTraces.length)}</Badge>
                  {filteredTraces.length < allTraces.length && (
                    <span className="text-xs text-muted-foreground ml-2">
                      (filtered from {formatCompact(allTraces.length)})
                    </span>
                  )}
                  {displayedTraces.length < filteredTraces.length && (
                    <span className="text-xs text-muted-foreground ml-2">
                      (showing {formatCompact(displayedTraces.length)})
                    </span>
                  )}
                </div>
              </div>

              {/* Table with sticky header */}
              <div className="relative">
                <table className="w-full caption-bottom text-sm">
                  <thead className={`sticky top-0 z-10 bg-background transition-shadow duration-200 ${
                    isScrolled ? 'shadow-sm' : ''
                  }`}>
                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[180px] bg-background border-b">
                        Start Time
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background border-b">
                        Trace ID
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background border-b">
                        Root Span
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background border-b">
                        Service
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background border-b">
                        Duration
                      </th>
                      <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground bg-background border-b">
                        Spans
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background border-b"></th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {displayedTraces.map((trace) => (
                      <TraceRow
                        key={trace.traceId}
                        trace={trace}
                        onSelect={() => handleSelectTrace(trace)}
                        isSelected={selectedTrace?.traceId === trace.traceId}
                      />
                    ))}
                    {/* Intersection observer target for lazy loading */}
                    {displayedTraces.length < filteredTraces.length && (
                      <tr ref={loadMoreRef} className="hover:bg-transparent border-b transition-colors">
                        <td colSpan={7} className="p-4 align-middle text-center py-8">
                          <div className="flex items-center justify-center gap-2 text-muted-foreground">
                            <RefreshCw size={16} className="animate-spin" />
                            <span className="text-sm">Loading more traces...</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Trace Detail Flyout - Resizable Panel */}
      {flyoutOpen && selectedTrace && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          <ResizablePanelGroup direction="horizontal" className="h-full pointer-events-none">
            {/* Left invisible panel - allows content below to be interactive */}
            <ResizablePanel 
              defaultSize={40}
              minSize={10}
              maxSize={70}
              className="pointer-events-none"
            />
            
            <ResizableHandle withHandle className="pointer-events-auto" />
            
            {/* Right panel - Flyout content */}
            <ResizablePanel 
              defaultSize={60}
              minSize={30}
              maxSize={90}
              className="bg-background border-l shadow-2xl pointer-events-auto"
            >
              <TraceFlyoutContent
                trace={selectedTrace}
                onClose={handleCloseFlyout}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}
    </div>
  );
};

export default AgentTracesPage;
