/*
 * TestCaseInspectorPanel — Evals 3: Right panel for test case inspection
 *
 * Shows everything needed to answer "Did my agent behave as expected?"
 * Layout:
 *   1. Compact summary header (status, accuracy, steps, timestamp, agent, model)
 *   2. LLM Judge evaluation (collapsible, always visible by default)
 *   3. Tabs: Conversation | Traces | LLM Judge | Annotations
 */

import React from 'react';
import {
  CheckCircle2, XCircle, Clock, MessageSquare, Target,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EvaluationReport, TestCase } from '@/types';
import { formatDate, getModelName } from '@/lib/utils';
import { RunDetailsContent } from '../RunDetailsContent';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ResultStatus = 'passed' | 'failed' | 'running' | 'pending';

interface TestCaseInspectorPanelProps {
  report: EvaluationReport;
  testCase: TestCase | null;
  status: ResultStatus;
  onClose?: () => void;
}


export const TestCaseInspectorPanel: React.FC<TestCaseInspectorPanelProps> = ({
  report,
  testCase,
  status,
  onClose,
}) => {
  const isPassed = report.passFailStatus === 'passed';
  const accuracy = report.metrics?.accuracy;
  const faithfulness = report.metrics?.faithfulness;
  const modelName = getModelName(report.modelName);
  const conversationSteps = report.trajectory?.length || 0;

  return (
    <div className="h-full flex flex-col">
      {/* ── Compact Summary Bar ────────────────────────────────────── */}
      <div className="px-4 py-2.5 border-b bg-card shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            {isPassed
              ? <CheckCircle2 size={16} className="text-green-500 shrink-0" />
              : <XCircle size={16} className="text-red-500 shrink-0" />}
            <span className="text-base font-semibold truncate">{testCase?.name || report.testCaseId}</span>
            <Badge className={`text-[9px] px-1.5 py-0 shrink-0 ${
              isPassed ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-500/15 dark:text-green-500 dark:border-green-500/30' : 'bg-red-100 text-red-700 border-red-300 dark:bg-red-500/15 dark:text-red-500 dark:border-red-500/30'
            }`}>
              {isPassed ? 'PASSED' : 'FAILED'}
            </Badge>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={onClose} title="Close">
              <X size={14} />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
          <Badge className="text-[10px] px-2 py-0.5 bg-muted text-muted-foreground border-border font-medium uppercase tracking-widest rounded shrink-0">
            Test Case Run
          </Badge>
          {accuracy != null && (
            <span className="flex items-center gap-1">
              <Target size={10} />
              Accuracy: <span className={`font-medium ${accuracy >= 50 ? 'text-green-500' : 'text-red-500'}`}>{accuracy}%</span>
            </span>
          )}
          {faithfulness != null && (
            <span className="flex items-center gap-1">
              Faithfulness: <span className="font-medium text-blue-600 dark:text-blue-400">{faithfulness}%</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <MessageSquare size={10} /> {conversationSteps} steps
          </span>
          <span className="flex items-center gap-1">
            <Clock size={10} /> {formatDate(report.timestamp)}
          </span>
          <span>Agent: {report.agentName}</span>
          <span>Model: {modelName}</span>
        </div>
      </div>

      {/* ── Tabs: Conversation, Traces, Judge, Annotations ─────────── */}
      <div className="flex-1 overflow-hidden">
        <RunDetailsContent report={report} compact />
      </div>
    </div>
  );
};
