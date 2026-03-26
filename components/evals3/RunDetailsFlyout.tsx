/*
 * RunDetailsFlyout — Evals 3: Test Case Run detail flyout
 *
 * Slides in from the right (same pattern as TraceFlyoutContent in Agent Traces).
 * Shows RunDetailsContent inside a resizable flyout panel.
 * Triggered from BenchmarkRunDetailPage when clicking a test case result row.
 */

import React from 'react';
import { X, Maximize2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { EvaluationReport, TestCase } from '@/types';
import { TestCaseInspectorPanel } from './TestCaseInspectorPanel';

type ResultStatus = 'passed' | 'failed' | 'running' | 'pending';

function getResultStatus(report: EvaluationReport): ResultStatus {
  if (report.passFailStatus === 'passed') return 'passed';
  if (report.passFailStatus === 'failed') return 'failed';
  if (report.status === 'running') return 'running';
  return 'pending';
}

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
            {/* ── Minimal flyout chrome: close button ────────────── */}
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 border-border hover:bg-muted bg-card/80 backdrop-blur-sm"
                onClick={onClose}
                title="Close"
              >
                <X size={14} />
              </Button>
            </div>

            {/* ── Body — TestCaseInspectorPanel ───────────────────── */}
            <div className="flex-1 overflow-hidden">
              <TestCaseInspectorPanel
                report={report}
                testCase={testCase}
                status={getResultStatus(report)}
              />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};
