/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SpanDetailsPanel
 *
 * Panel showing selected span details including timing, attributes,
 * and LLM request/response data with formatted message display.
 */

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PanelRightClose, Layers, ChevronRight, ChevronDown, Info, MessageSquare, Bot, PieChart, AlertTriangle } from 'lucide-react';
import { Span, CategorizedSpan } from '@/types';
import { formatDuration, getKeyAttributes } from '@/services/traces/utils';
import { checkOTelCompliance } from '@/services/traces/spanCategorization';
import ContextWindowBar from './ContextWindowBar';
import FormattedMessages from './FormattedMessages';
import { ATTR_GEN_AI_USAGE_INPUT_TOKENS } from '@opentelemetry/semantic-conventions/incubating';

interface SpanDetailsPanelProps {
  span: Span;
  onClose: () => void;
  onCollapse?: () => void;
}

const SpanDetailsPanel: React.FC<SpanDetailsPanelProps> = ({ span, onClose, onCollapse }) => {
  // Extract LLM events for prominent display
  const llmRequestEvent = span.events?.find(e => e.name === 'llm.request');
  const llmResponseEvent = span.events?.find(e => e.name === 'llm.response');

  // Extract input/output data from span attributes OR events
  const inputData = span.attributes?.['gen_ai.tool.input'] || 
                    span.attributes?.['input'] ||
                    span.attributes?.['gen_ai.prompt'] ||
                    llmRequestEvent?.attributes?.['llm.prompt'] ||
                    llmRequestEvent?.attributes?.['llm.system_prompt'];
  const outputData = span.attributes?.['gen_ai.tool.output'] || 
                     span.attributes?.['output'] ||
                     span.attributes?.['gen_ai.completion'] ||
                     llmResponseEvent?.attributes?.['llm.completion'];

  const [expandedSections, setExpandedSections] = useState({
    input: !!inputData,  // Auto-open if data exists
    output: !!outputData,  // Auto-open if data exists
    otelCompliance: true,
    contextWindow: true,
    attributes: false
  });

  const [inputViewMode, setInputViewMode] = useState<'pretty' | 'raw'>('pretty');
  const [outputViewMode, setOutputViewMode] = useState<'pretty' | 'raw'>('pretty');

  const spanDuration = new Date(span.endTime).getTime() - new Date(span.startTime).getTime();

  // Extract key attributes based on span type
  const keyAttrs = getKeyAttributes(span);

  // Check OTel compliance for categorized spans
  const otelCompliance = useMemo(() => {
    const categorizedSpan = span as CategorizedSpan;
    if (categorizedSpan.category) {
      return checkOTelCompliance(categorizedSpan);
    }
    return null;
  }, [span]);

  // Get all attributes for the table
  const allAttributes = Object.entries(span.attributes || {});

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Helper to format data for display
  const formatData = (data: any, mode: 'pretty' | 'raw'): string => {
    if (!data) return '';
    
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    
    if (mode === 'raw') {
      return dataStr;
    }
    
    // Pretty mode: try to parse and format JSON
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return JSON.stringify(parsed, null, 2);
    } catch {
      // If not valid JSON, return as-is
      return dataStr;
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-muted/30" data-testid="span-details-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0">
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <h3 className="text-sm font-semibold truncate" data-testid="span-details-name">
            {span.name}
          </h3>
          <span className="text-[10px] font-mono text-muted-foreground truncate hidden sm:inline">
            {span.spanId}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onCollapse || onClose} data-testid="span-details-close">
          <PanelRightClose size={14} />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* INPUT SECTION - Moved to top, auto-open if data exists */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <button
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground"
                onClick={() => toggleSection('input')}
              >
                {expandedSections.input ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                <MessageSquare size={10} /> Input
              </button>
              {expandedSections.input && inputData && (
                <div className="flex items-center gap-1">
                  <Button
                    variant={inputViewMode === 'pretty' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setInputViewMode('pretty')}
                  >
                    Pretty
                  </Button>
                  <Button
                    variant={inputViewMode === 'raw' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setInputViewMode('raw')}
                  >
                    Raw
                  </Button>
                </div>
              )}
            </div>
            {expandedSections.input && (
              inputData ? (
                <pre className="max-h-64 overflow-auto rounded-md border bg-gray-50 dark:bg-slate-900 p-3 text-[11px] font-mono text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words w-full">
                  {formatData(inputData, inputViewMode)}
                </pre>
              ) : (
                <div className="text-xs text-muted-foreground italic p-3 bg-muted/30 rounded-md border border-dashed">
                  No input data available for this span
                </div>
              )
            )}
          </div>

          {/* OUTPUT SECTION - Moved to top, auto-open if data exists */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <button
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground"
                onClick={() => toggleSection('output')}
              >
                {expandedSections.output ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                <Bot size={10} /> Output
              </button>
              {expandedSections.output && outputData && (
                <div className="flex items-center gap-1">
                  <Button
                    variant={outputViewMode === 'pretty' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setOutputViewMode('pretty')}
                  >
                    Pretty
                  </Button>
                  <Button
                    variant={outputViewMode === 'raw' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setOutputViewMode('raw')}
                  >
                    Raw
                  </Button>
                </div>
              )}
            </div>
            {expandedSections.output && (
              outputData ? (
                <pre className="max-h-64 overflow-auto rounded-md border bg-gray-50 dark:bg-slate-900 p-3 text-[11px] font-mono text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words w-full">
                  {formatData(outputData, outputViewMode)}
                </pre>
              ) : (
                <div className="text-xs text-muted-foreground italic p-3 bg-muted/30 rounded-md border border-dashed">
                  No output data available for this span
                </div>
              )
            )}
          </div>

          {/* Timing & Key Info section - Combined */}
          <div className="space-y-3 bg-muted/30 rounded-md p-3 border">
            {/* Duration and Status row */}
            <div className="flex items-center gap-4 text-xs">
              <div className="flex-1 min-w-0">
                <div className="text-muted-foreground text-[10px] uppercase tracking-wide mb-1">Duration</div>
                <div className="font-mono font-medium text-sm">{formatDuration(spanDuration)}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-muted-foreground text-[10px] uppercase tracking-wide mb-1">Status</div>
                <Badge
                  variant={span.status === 'ERROR' ? 'destructive' : span.status === 'OK' ? 'default' : 'secondary'}
                  className="text-[10px]"
                >
                  {span.status || 'UNSET'}
                </Badge>
              </div>
            </div>
            
            {/* Key Info items */}
            {Object.entries(keyAttrs).filter(([_, v]) => v != null).length > 0 && (
              <div className="pt-3 border-t space-y-2">
                {Object.entries(keyAttrs).filter(([_, v]) => v != null).map(([key, value]) => (
                  <div key={key} className="flex items-baseline justify-between gap-3">
                    <div className="text-muted-foreground text-[10px] uppercase tracking-wide shrink-0">{key}</div>
                    <div className="font-mono text-xs font-medium text-right truncate min-w-0" title={String(value)}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* OTEL COMPLIANCE SECTION - show warnings for missing attributes */}
          {otelCompliance && !otelCompliance.isCompliant && (
            <div className="space-y-2">
              <button
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-amber-500 hover:text-amber-400 w-full"
                onClick={() => toggleSection('otelCompliance')}
              >
                {expandedSections.otelCompliance ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                <AlertTriangle size={10} /> OTel Compliance
                <Badge variant="outline" className="ml-auto text-[9px] h-4 px-1 text-amber-400 border-amber-500/50">
                  {otelCompliance.missingAttributes.length} missing
                </Badge>
              </button>
              {expandedSections.otelCompliance && (
                <div className="bg-amber-950/20 rounded-md p-3 space-y-2 border border-amber-900/30">
                  <div className="text-[10px] text-amber-400/80">
                    Missing required OTel GenAI attributes:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {otelCompliance.missingAttributes.map((attr) => (
                      <Badge
                        key={attr}
                        variant="outline"
                        className="text-[9px] font-mono text-amber-400 border-amber-500/50 bg-amber-500/10"
                      >
                        {attr}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-[9px] text-muted-foreground mt-2">
                    <a
                      href="https://opentelemetry.io/docs/specs/semconv/gen-ai/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:underline"
                    >
                      View OTel GenAI Semantic Conventions →
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CONTEXT WINDOW section - for LLM spans */}
          {llmRequestEvent && (
            <div className="space-y-2 pt-4 border-t">
              <button
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-cyan-500 hover:text-cyan-400 w-full"
                onClick={() => toggleSection('contextWindow')}
              >
                {expandedSections.contextWindow ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                <PieChart size={10} /> Context Window
              </button>
              {expandedSections.contextWindow && (
                <ContextWindowBar
                  systemPrompt={llmRequestEvent.attributes?.['llm.system_prompt'] || ''}
                  messages={llmRequestEvent.attributes?.['llm.prompt'] || ''}
                  toolCount={llmRequestEvent.attributes?.['bedrock.tool_count'] || 0}
                  actualInputTokens={span.attributes?.[ATTR_GEN_AI_USAGE_INPUT_TOKENS]}
                />
              )}
            </div>
          )}

          {/* ALL ATTRIBUTES */}
          <div className="space-y-2 pt-4 border-t">
            <button
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground w-full"
              onClick={() => toggleSection('attributes')}
            >
              {expandedSections.attributes ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              <Layers size={10} /> All Attributes ({allAttributes.length})
            </button>
            {expandedSections.attributes && allAttributes.length > 0 && (
              <div className="max-h-[300px] overflow-auto rounded-md border bg-muted/20">
                <table className="w-full text-[10px]">
                  <tbody>
                    {allAttributes.map(([key, value]) => (
                      <tr key={key} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-2 text-muted-foreground font-medium bg-muted/50 border-r max-w-[150px] truncate align-top" title={key}>
                          {key}
                        </td>
                        <td className="p-2 font-mono break-all">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default SpanDetailsPanel;
