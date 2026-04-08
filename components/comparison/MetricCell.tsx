/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CheckCircle2, XCircle, Minus, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TestCaseRunResult } from '@/types';

/** Which evaluator metrics to show in the cell */
export type EvaluatorType = 'accuracy' | 'faithfulness' | 'trajectory' | 'latency' | 'annotations';

interface MetricCellProps {
  result: TestCaseRunResult;
  isReference?: boolean;
  baselineAccuracy?: number;
  baselineFaithfulness?: number;
  annotationCount?: number;
  visibleEvaluators?: Set<EvaluatorType>;
}

function DeltaValue({ value, baseline, label }: { value?: number; baseline?: number; label: string }) {
  if (value === undefined) return null;
  const delta = baseline !== undefined ? value - baseline : undefined;
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-muted-foreground">{label}</span>
      <span>
        <span className="font-medium">{value}%</span>
        {delta !== undefined && delta !== 0 && (
          <span className={cn('ml-0.5', delta > 0 ? 'text-opensearch-blue' : 'text-red-400')}>
            ({delta > 0 ? '+' : ''}{delta})
          </span>
        )}
      </span>
    </div>
  );
}

export const MetricCell: React.FC<MetricCellProps> = ({
  result,
  isReference = false,
  baselineAccuracy,
  baselineFaithfulness,
  annotationCount = 0,
  visibleEvaluators,
}) => {
  // Default: show all
  const show = (type: EvaluatorType) => !visibleEvaluators || visibleEvaluators.has(type);

  if (result.status === 'missing') {
    return (
      <div className="text-center py-2 text-muted-foreground">
        <Minus size={16} className="mx-auto mb-1 opacity-50" />
        <span className="text-xs">Not run</span>
      </div>
    );
  }

  const isPassed = result.passFailStatus === 'passed';
  const accuracy = result.accuracy ?? 0;
  const accDelta = !isReference && baselineAccuracy !== undefined ? accuracy - baselineAccuracy : undefined;

  return (
    <div className="py-2 px-2.5 group relative">
      {/* Pass/Fail + Accuracy (primary row) */}
      <div className="flex items-center justify-center gap-1.5">
        <div className={cn('inline-flex items-center gap-1 text-xs font-medium', isPassed ? 'text-opensearch-blue' : 'text-red-400')}>
          {isPassed ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
          <span>{isPassed ? 'Passed' : 'Failed'}</span>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="mt-1 space-y-0.5">
        {/* Accuracy — always shown */}
        {show('accuracy') && (
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Acc</span>
          <span>
            <span className="font-medium">{accuracy}%</span>
            {accDelta !== undefined && accDelta !== 0 && (
              <span className={cn('ml-0.5', accDelta > 0 ? 'text-opensearch-blue' : 'text-red-400')}>
                ({accDelta > 0 ? '+' : ''}{accDelta})
              </span>
            )}
          </span>
        </div>
        )}

        {/* Faithfulness — show if available and visible */}
        {show('faithfulness') && (
        <DeltaValue
          value={result.faithfulness}
          baseline={!isReference ? baselineFaithfulness : undefined}
          label="Faith"
        />
        )}

        {/* Trajectory Alignment — show if available and visible */}
        {show('trajectory') && result.trajectoryAlignment !== undefined && (
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Traj</span>
            <span className="font-medium">{result.trajectoryAlignment}%</span>
          </div>
        )}

        {/* Latency Score — show if available and visible */}
        {show('latency') && result.latencyScore !== undefined && (
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Lat</span>
            <span className="font-medium">{result.latencyScore}%</span>
          </div>
        )}
      </div>

      {/* Annotation indicator */}
      {show('annotations') && annotationCount > 0 && (
        <div className="flex items-center justify-center gap-1 mt-1.5 text-[9px] text-amber-500">
          <MessageSquare size={10} />
          <span>{annotationCount} annotation{annotationCount > 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
};
