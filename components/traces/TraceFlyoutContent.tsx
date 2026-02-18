/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TraceFlyoutContent - Detailed trace view shown in flyout panel
 *
 * Displays trace visualization with:
 * - Trace overview with metrics
 * - Timeline/Flow view of spans
 * - Span details panel with input/output from OTEL conventions
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Maximize2,
  Hash,
  Server,
  Cpu,
  MessageSquare,
  Wrench,
  Bot,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Span, TimeRange } from '@/types';
import { processSpansIntoTree, calculateTimeRange } from '@/services/traces';
import { formatDuration } from '@/services/traces/utils';
import TraceVisualization from './TraceVisualization';
import TraceTimelineChart from './TraceTimelineChart';
import ViewToggle, { ViewMode } from './ViewToggle';
import TraceFullScreenView from './TraceFullScreenView';
import { SpanInputOutput } from './SpanInputOutput';
import SpanDetailsPanel from './SpanDetailsPanel';
import {
  SummaryStatsGrid,
  ToolsUsedSection,
  TimeDistributionBar,
} from './TraceSummary';
import {
  flattenSpans,
  calculateCategoryStats,
  extractToolStats,
} from '@/services/traces/traceStats';
import { categorizeSpanTree } from '@/services/traces/spanCategorization';

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

interface TraceFlyoutContentProps {
  trace: TraceTableRow;
  onClose: () => void;
}

export const TraceFlyoutContent: React.FC<TraceFlyoutContentProps> = ({
  trace,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState('tree');
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null);
  const [expandedSpans, setExpandedSpans] = useState<Set<string>>(new Set());
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [copiedTraceId, setCopiedTraceId] = useState(false);

  // Process spans into tree
  const spanTree = useMemo(() => processSpansIntoTree(trace.spans), [trace.spans]);
  const timeRange = useMemo(() => calculateTimeRange(trace.spans), [trace.spans]);

  // Categorize spans for summary stats
  const categorizedTree = useMemo(
    () => categorizeSpanTree(spanTree),
    [spanTree]
  );

  // Flatten all spans for analysis
  const allSpans = useMemo(
    () => flattenSpans(categorizedTree),
    [categorizedTree]
  );

  // Calculate statistics for Info tab
  const categoryStats = useMemo(
    () => calculateCategoryStats(allSpans, timeRange.duration),
    [allSpans, timeRange.duration]
  );

  // Extract tool information for Info tab
  const toolStats = useMemo(
    () => extractToolStats(allSpans),
    [allSpans]
  );

  // Auto-select first span when switching tabs
  useEffect(() => {
    if ((activeTab === 'tree' || activeTab === 'graph' || activeTab === 'timeline') && !selectedSpan && spanTree.length > 0) {
      setSelectedSpan(spanTree[0]);
    }
  }, [activeTab, selectedSpan, spanTree]);

  // Auto-expand root spans
  useEffect(() => {
    const rootIds = new Set(spanTree.map(s => s.spanId));
    setExpandedSpans(rootIds);
  }, [spanTree]);

  // Handle expand toggle
  const handleToggleExpand = (spanId: string) => {
    setExpandedSpans(prev => {
      const next = new Set(prev);
      if (next.has(spanId)) {
        next.delete(spanId);
      } else {
        next.add(spanId);
      }
      return next;
    });
  };

  // Copy trace ID to clipboard
  const handleCopyTraceId = async () => {
    try {
      await navigator.clipboard.writeText(trace.traceId);
      setCopiedTraceId(true);
      setTimeout(() => setCopiedTraceId(false), 2000);
    } catch (err) {
      console.error('Failed to copy trace ID to clipboard:', err);
    }
  };

  // Calculate span stats
  const spanStats = useMemo(() => {
    const byStatus = trace.spans.reduce(
      (acc, span) => {
        if (span.status === 'ERROR') acc.error++;
        else if (span.status === 'OK') acc.ok++;
        else acc.unset++;
        return acc;
      },
      { ok: 0, error: 0, unset: 0 }
    );

    // Count by category based on span attributes
    const byCategory = trace.spans.reduce(
      (acc, span) => {
        const name = span.name.toLowerCase();
        if (name.includes('llm') || name.includes('bedrock') || name.includes('converse')) {
          acc.llm++;
        } else if (name.includes('tool') || span.attributes?.['gen_ai.tool.name']) {
          acc.tool++;
        } else if (name.includes('agent')) {
          acc.agent++;
        } else {
          acc.other++;
        }
        return acc;
      },
      { agent: 0, llm: 0, tool: 0, other: 0 }
    );

    return { byStatus, byCategory };
  }, [trace.spans]);

  return (
    <div className="h-full flex flex-col">
      {/* Compact Header */}
      <div className="px-4 py-3 border-b bg-card">
        {/* Title Row with Trace ID */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {trace.hasErrors ? (
              <XCircle size={18} className="text-red-700 dark:text-red-400 flex-shrink-0" />
            ) : (
              <CheckCircle2 size={18} className="text-green-700 dark:text-green-400 flex-shrink-0" />
            )}
            <h2 className="text-base font-semibold truncate">{trace.rootSpanName}</h2>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-mono">trace-{trace.traceId.slice(0, 8)}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleCopyTraceId}
                title="Copy full trace ID"
              >
                {copiedTraceId ? (
                  <Check size={12} className="text-green-700 dark:text-green-400" />
                ) : (
                  <Copy size={12} />
                )}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button 
              variant="outline" 
              size="icon" 
              className="h-8 w-8 border-border hover:bg-muted hover:border-muted-foreground/30" 
              onClick={() => setFullscreenOpen(true)}
              title="Fullscreen"
            >
              <Maximize2 size={14} />
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-8 w-8 border-border hover:bg-muted hover:border-muted-foreground/30" 
              onClick={onClose}
              title="Close"
            >
              <X size={14} />
            </Button>
          </div>
        </div>

        {/* Primary Metrics Row - Compact design with status icon */}
        <div className="flex items-center gap-3 text-sm mb-3">
          {/* Status icon + metrics in one line */}
          <div className="flex items-center gap-2">
            {trace.hasErrors ? (
              <XCircle size={16} className="text-red-700 dark:text-red-400 flex-shrink-0" />
            ) : (
              <CheckCircle2 size={16} className="text-green-700 dark:text-green-400 flex-shrink-0" />
            )}
            <span className="font-medium">{trace.spanCount} spans</span>
            <span className="text-muted-foreground">•</span>
            <span className="font-medium text-amber-700 dark:text-amber-400">{formatDuration(trace.duration)}</span>
            {trace.hasErrors && (
              <>
                <span className="text-muted-foreground">•</span>
                <span className="text-red-700 dark:text-red-400 font-medium">
                  {spanStats.byStatus.error} {spanStats.byStatus.error === 1 ? 'error' : 'errors'}
                </span>
              </>
            )}
          </div>
          
          {/* Divider */}
          <div className="h-4 w-px bg-border" />
          
          {/* Service and timestamp - more compact */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{trace.serviceName}</span>
            <span>•</span>
            <span>{trace.startTime.toLocaleString()}</span>
          </div>
        </div>

        {/* Secondary Info: Categories */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Categories:</span>
          {spanStats.byCategory.agent > 0 && (
            <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
              <Bot size={10} className="mr-1" />
              Agent: {spanStats.byCategory.agent}
            </Badge>
          )}
          {spanStats.byCategory.llm > 0 && (
            <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800">
              <MessageSquare size={10} className="mr-1" />
              LLM: {spanStats.byCategory.llm}
            </Badge>
          )}
          {spanStats.byCategory.tool > 0 && (
            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
              <Wrench size={10} className="mr-1" />
              Tool: {spanStats.byCategory.tool}
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full justify-start rounded-none border-b bg-card h-auto p-0">
          <TabsTrigger
            value="tree"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-opensearch-blue data-[state=active]:text-opensearch-blue"
          >
            <Activity size={14} className="mr-2" />
            Trace tree
          </TabsTrigger>
          <TabsTrigger
            value="graph"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-opensearch-blue data-[state=active]:text-opensearch-blue"
          >
            <ArrowRight size={14} className="mr-2" />
            Agent graph
          </TabsTrigger>
          <TabsTrigger
            value="timeline"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-opensearch-blue data-[state=active]:text-opensearch-blue"
          >
            <Clock size={14} className="mr-2" />
            Timeline
          </TabsTrigger>
          <TabsTrigger
            value="info"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-opensearch-blue data-[state=active]:text-opensearch-blue"
          >
            <MessageSquare size={14} className="mr-2" />
            Info
          </TabsTrigger>
        </TabsList>

        {/* Trace Tree Tab */}
        <TabsContent value="tree" className="flex-1 mt-0 overflow-hidden">
          <TraceVisualization
            spanTree={spanTree}
            timeRange={timeRange}
            initialViewMode="timeline"
            onViewModeChange={setViewMode}
            showViewToggle={false}
            selectedSpan={selectedSpan}
            onSelectSpan={setSelectedSpan}
            expandedSpans={expandedSpans}
            onToggleExpand={handleToggleExpand}
            showSpanDetailsPanel={true}
          />
        </TabsContent>

        {/* Agent Graph Tab - Service map on left, span details on right */}
        <TabsContent value="graph" className="flex-1 mt-0 overflow-hidden">
          <TraceVisualization
            spanTree={spanTree}
            timeRange={timeRange}
            initialViewMode="flow"
            onViewModeChange={setViewMode}
            showViewToggle={false}
            selectedSpan={selectedSpan}
            onSelectSpan={setSelectedSpan}
            expandedSpans={expandedSpans}
            onToggleExpand={handleToggleExpand}
            showSpanDetailsPanel={true}
          />
        </TabsContent>

        {/* Timeline Tab - Shows Gantt chart */}
        <TabsContent value="timeline" className="flex-1 mt-0 overflow-hidden">
          <div className="flex h-full">
            <div className="flex-1 overflow-auto p-4">
              <TraceTimelineChart
                spanTree={spanTree}
                timeRange={timeRange}
                selectedSpan={selectedSpan}
                onSelectSpan={setSelectedSpan}
                expandedSpans={expandedSpans}
                onToggleExpand={handleToggleExpand}
              />
            </div>
            {selectedSpan && (
              <div className="w-[400px] border-l shrink-0">
                <SpanDetailsPanel
                  span={selectedSpan}
                  onClose={() => setSelectedSpan(null)}
                />
              </div>
            )}
          </div>
        </TabsContent>

        {/* Info Tab - Summary stats, tools, time distribution */}
        <TabsContent value="info" className="flex-1 mt-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              <SummaryStatsGrid categoryStats={categoryStats} toolStats={toolStats} />
              <ToolsUsedSection toolStats={toolStats} />
              <TimeDistributionBar stats={categoryStats} totalDuration={timeRange.duration} />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Fullscreen View */}
      <TraceFullScreenView
        open={fullscreenOpen}
        onOpenChange={setFullscreenOpen}
        title={trace.rootSpanName}
        subtitle={`Trace ID: ${trace.traceId.slice(0, 16)}...`}
        spanTree={spanTree}
        timeRange={timeRange}
        selectedSpan={selectedSpan}
        onSelectSpan={setSelectedSpan}
        initialViewMode={viewMode}
        onViewModeChange={setViewMode}
        spanCount={trace.spanCount}
      />
    </div>
  );
};

export default TraceFlyoutContent;
