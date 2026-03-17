/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MetricsOverview - Compact metrics visualization with latency, errors, and requests
 * 
 * Displays three minimal charts in a single collapsible card:
 * - Latency distribution histogram
 * - Error count over time
 * - Request count over time
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatDuration, formatCompact } from '@/services/traces/utils';

interface LatencyBucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

interface TimeSeriesPoint {
  timestamp: Date;
  value: number;
}

interface MetricsOverviewProps {
  latencyDistribution: LatencyBucket[];
  errorTimeSeries: TimeSeriesPoint[];
  requestTimeSeries: TimeSeriesPoint[];
  totalRequests: number;
  totalSpans: number;
  totalErrors: number;
  avgLatency: number;
}

export const MetricsOverview: React.FC<MetricsOverviewProps> = ({
  latencyDistribution,
  errorTimeSeries,
  requestTimeSeries,
  totalRequests,
  totalSpans,
  totalErrors,
  avgLatency,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Get max values for scaling
  const maxLatencyCount = Math.max(...latencyDistribution.map(b => b.count), 1);
  const maxErrors = Math.max(...errorTimeSeries.map(p => p.value), 1);
  const maxRequests = Math.max(...requestTimeSeries.map(p => p.value), 1);

  // Get color for latency bucket
  const getLatencyColor = (bucket: LatencyBucket) => {
    if (bucket.max <= 100) return 'bg-green-500';
    if (bucket.max <= 500) return 'bg-blue-500';
    if (bucket.max <= 1000) return 'bg-yellow-500';
    if (bucket.max <= 5000) return 'bg-orange-500';
    return 'bg-red-500';
  };

  // Generate smooth cubic bezier SVG path from data points
  const smoothPath = (data: number[], maxVal: number, w: number, h: number): string => {
    if (data.length < 2) return '';
    const pts = data.map((v, i) => ({
      x: (i / (data.length - 1)) * w,
      y: h - (v / maxVal) * (h - 2) - 1,
    }));
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const tension = (pts[i + 1].x - pts[i].x) * 0.4;
      d += ` C ${pts[i].x + tension},${pts[i].y} ${pts[i + 1].x - tension},${pts[i + 1].y} ${pts[i + 1].x},${pts[i + 1].y}`;
    }
    return d;
  };

  return (
    <Card className="mb-4">
      <CardHeader 
        className="py-3 px-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Metrics
          </CardTitle>
          <div className="flex items-center gap-3 text-xs">
            {/* Traces + Spans with request sparkline (mirrors Trace Count chart) */}
            <div className="flex items-center gap-1.5">
              <span className="font-semibold">{formatCompact(totalRequests)}</span>
              <span className="text-muted-foreground">traces</span>
              <span className="text-muted-foreground/50">/</span>
              <span className="font-semibold">{formatCompact(totalSpans)}</span>
              <span className="text-muted-foreground">spans</span>
              {!isExpanded && requestTimeSeries.length > 0 && (
                <svg width="44" height="16" className="ml-0.5" aria-hidden="true">
                  <path
                    d={smoothPath(requestTimeSeries.map(p => p.value), maxRequests, 44, 16)}
                    fill="none"
                    stroke="currentColor"
                    className="text-muted-foreground"
                    strokeWidth="1.5"
                  />
                </svg>
              )}
            </div>
            <span className="text-muted-foreground/50">·</span>
            {/* Errors with sparkline (mirrors Error Count chart) */}
            <div className="flex items-center gap-1.5">
              <span className={cn("font-semibold", totalErrors > 0 ? "text-red-500" : "")}>{totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(1) : 0}%</span>
              <span className="text-muted-foreground">errors</span>
              {!isExpanded && errorTimeSeries.length > 0 && totalErrors > 0 && (
                <svg width="44" height="16" className="ml-0.5" aria-hidden="true">
                  <path
                    d={smoothPath(errorTimeSeries.map(p => p.value), maxErrors, 44, 16)}
                    fill="none"
                    stroke="rgb(239, 68, 68)"
                    strokeWidth="1.5"
                  />
                </svg>
              )}
            </div>
            <span className="text-muted-foreground/50">·</span>
            {/* Avg Latency with sparkline (mirrors Latency Distribution chart) */}
            <div className="flex items-center gap-1.5">
              <span className="font-semibold">{formatDuration(avgLatency)}</span>
              <span className="text-muted-foreground">avg latency</span>
              {!isExpanded && latencyDistribution.length > 0 && (
                <svg width="44" height="16" className="ml-0.5" aria-hidden="true">
                  {latencyDistribution.map((b, i) => {
                    const barW = 44 / latencyDistribution.length;
                    const barH = (b.count / maxLatencyCount) * 13;
                    return (
                      <rect
                        key={i}
                        x={i * barW + 0.5}
                        y={15 - barH}
                        width={barW - 1}
                        height={barH}
                        rx={1}
                        fill="currentColor"
                        className="text-muted-foreground"
                      />
                    );
                  })}
                  <line x1="0" y1="15.5" x2="44" y2="15.5" stroke="currentColor" className="text-muted-foreground" strokeWidth="1" />
                </svg>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-3 gap-6 divide-x divide-dashed divide-border">
            {/* Trace Count - Outlined Bars (mirrors traces/spans sparkline) */}
            <div className="space-y-2 pr-6">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">Trace Count</span>
                <span className="text-[10px] text-muted-foreground">{formatCompact(totalRequests)} total</span>
              </div>
              <div className="h-24 flex items-end gap-0.5">
                {requestTimeSeries.map((point, idx) => (
                  <div key={idx} className="flex-1 relative group">
                    <div
                      className="w-full rounded-t transition-all bg-muted-foreground/20"
                      style={{
                        height: `${(point.value / maxRequests) * 80}px`,
                        minHeight: point.value > 0 ? '4px' : '0px',
                      }}
                    />
                    {point.value > 0 && (
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-background px-1 rounded">
                        {point.value}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>Earlier</span>
                <span>Now</span>
              </div>
            </div>

            {/* Error Count - Line Chart with Area Fill (mirrors errors sparkline) */}
            <div className="space-y-2 px-6">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">Error Count</span>
                <span className="text-[10px] font-semibold text-red-500">{formatCompact(totalErrors)} total</span>
              </div>
              <div className="h-24 relative">
                <svg className="w-full h-full" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="errorGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="rgb(239, 68, 68)" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="rgb(239, 68, 68)" stopOpacity="0.05" />
                    </linearGradient>
                  </defs>
                  <path
                    d={(() => {
                      const width = 100 / errorTimeSeries.length;
                      const points = errorTimeSeries.map((point, idx) => {
                        const x = idx * width;
                        const y = 100 - (point.value / maxErrors) * 100;
                        return `${x},${y}`;
                      }).join(' ');
                      return `M 0,100 L ${points} L 100,100 Z`;
                    })()}
                    fill="url(#errorGradient)"
                  />
                  <polyline
                    points={errorTimeSeries.map((point, idx) => {
                      const x = (idx / (errorTimeSeries.length - 1)) * 100;
                      const y = 100 - (point.value / maxErrors) * 100;
                      return `${x},${y}`;
                    }).join(' ')}
                    fill="none"
                    stroke="rgb(239, 68, 68)"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                  {errorTimeSeries.map((point, idx) => {
                    if (point.value === 0) return null;
                    const x = (idx / (errorTimeSeries.length - 1)) * 100;
                    const y = 100 - (point.value / maxErrors) * 100;
                    return (
                      <g key={idx}>
                        <circle
                          cx={`${x}%`}
                          cy={`${y}%`}
                          r="3"
                          fill="rgb(239, 68, 68)"
                          className="opacity-0 hover:opacity-100 transition-opacity"
                        />
                        <title>{point.value}</title>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>Earlier</span>
                <span>Now</span>
              </div>
            </div>

            {/* Latency Distribution (mirrors latency sparkline) */}
            <div className="space-y-2 pl-6">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">Latency Distribution</span>
                <span className="text-[10px] text-muted-foreground">{formatDuration(avgLatency)} avg</span>
              </div>
              <div className="h-24 flex items-end gap-1">
                {latencyDistribution.map((bucket, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full relative group">
                      <div
                        className={cn(
                          'w-full rounded-t transition-all',
                          getLatencyColor(bucket)
                        )}
                        style={{
                          height: `${(bucket.count / maxLatencyCount) * 80}px`,
                          minHeight: bucket.count > 0 ? '4px' : '0px',
                        }}
                      />
                      {bucket.count > 0 && (
                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          {bucket.count}
                        </div>
                      )}
                    </div>
                    <span className="text-[9px] text-muted-foreground text-center leading-tight">
                      {bucket.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default MetricsOverview;
