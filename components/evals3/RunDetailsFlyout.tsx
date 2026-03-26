/*
 * RunDetailsFlyout — Evals 3: Test Case Run detail flyout
 *
 * Slides in from the right (same pattern as TraceFlyoutContent in Agent Traces).
 * Shows RunDetailsContent inside a resizable flyout panel.
 * Triggered from BenchmarkRunDetailPage when clicking a test case result row.
 */

import React from 'react';
import { X, Maximize2, CheckCircle2, XCircle, Calendar, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { EvaluationReport, TestCase } from '@/types';
import { DEFAULT_CONFIG } from '@/lib/constants';
import { formatDate, formatRelativeTime, getModelName } from '@/lib/utils';
import { RunDetailsContent } from '../RunDetailsContent';

interface RunDetailsFlyoutProps {
  report: EvaluationReport;
  testCase: TestCase | null;
  onClose: () => void;
}

export const RunDetailsFlyout: React.FC<RunDetailsFlyoutProps> = ({
  report,
  testCase,
  onClose,
}) => {
  const navigate = useNavigate();
  const isPassed = report.passFailStatus === 'passed';
  const modelName = getModelName(report.modelName);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <ResizablePanelGroup direction="horizontal" className="h-full pointer-events-none">
        {/* Left invisible panel — click-through to page below */}
        <ResizablePanel
          defaultSize={30}
          minSize={5}
          maxSize={60}
          className="pointer-events-none"
          onClick={onClose}
        />

        <ResizableHandle withHandle className="pointer-events-auto" />

        {/* Right panel — flyout content */}
        <ResizablePanel
          defaultSize={70}
          minSize={40}
          maxSize={95}
          className="bg-background border-l shadow-2xl pointer-events-auto"
        >
          <div className="h-full flex flex-col">
            {/* ── Flyout Header ──────────────────────────────────── */}
            <div className="px-4 py-3 border-b bg-card shrink-0">
              {/* Title row */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  {isPassed ? (
                    <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                  ) : (
                    <XCircle size={18} className="text-red-500 shrink-0" />
                  )}
                  <h2 className="text-base font-semibold truncate">
                    {testCase?.name || report.testCaseId}
                  </h2>
                  <Badge
                    className={`text-[10px] px-1.5 py-0 shrink-0 ${
                      isPassed
                        ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-500/15 dark:text-green-500 dark:border-green-500/30'
                        : 'bg-red-100 text-red-700 border-red-300 dark:bg-red-500/15 dark:text-red-500 dark:border-red-500/30'
                    }`}
                  >
                    {isPassed ? 'PASSED' : 'FAILED'}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 border-border hover:bg-muted"
                    onClick={() => navigate(`/runs/${report.id}`)}
                    title="Open full page"
                  >
                    <Maximize2 size={14} />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 border-border hover:bg-muted"
                    onClick={onClose}
                    title="Close"
                  >
                    <X size={14} />
                  </Button>
                </div>
              </div>

              {/* Metrics row */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar size={11} />
                  {formatRelativeTime(report.timestamp)}
                </span>
                <span className="text-muted-foreground/40">·</span>
                <span>Agent: {report.agentName}</span>
                <span className="text-muted-foreground/40">·</span>
                <span>Model: {modelName}</span>
                {report.metrics?.accuracy != null && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="font-medium">
                      Accuracy: <span className={report.metrics.accuracy >= 50 ? 'text-green-500' : 'text-red-500'}>
                        {report.metrics.accuracy}%
                      </span>
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* ── Flyout Body — RunDetailsContent ────────────────── */}
            <div className="flex-1 overflow-hidden">
              <RunDetailsContent report={report} />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};
