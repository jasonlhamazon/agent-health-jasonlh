/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mock data for the Trajectory Deviation Overlay page.
 */

export type StepType = 'user-prompt' | 'llm-reasoning' | 'tool-call' | 'tool-result' | 'llm-response' | 'user-reply' | 'complete';
export type MatchStatus = 'matched' | 'deviation' | 'added';

export interface TrajectoryStep {
  step: number;
  type: StepType;
  label: string;
  content: string;
  durationMs?: number;
  tokens?: number;
  annotation?: string; // green annotation like "Direct call", "Final answer"
  warningAnnotation?: string; // red annotation like "Unnecessary clarification"
}

export interface DeviationRow {
  id: string;
  status: MatchStatus;
  left?: TrajectoryStep;
  right?: TrajectoryStep;
  judgeAnnotation?: {
    title: string;
    detail: string;
    highlightTerms: string[]; // terms to bold in the detail
  };
}

export interface RunSummary {
  id: string;
  label: string;
  version: string;
  steps: number;
  durationMs: number;
  tokens: number;
  passed: boolean;
}

export const BASELINE_RUN: RunSummary = {
  id: 'run-5',
  label: 'Baseline',
  version: 'v0',
  steps: 5,
  durationMs: 843,
  tokens: 384,
  passed: true,
};

export const CANDIDATE_RUN: RunSummary = {
  id: 'run-6',
  label: 'Candidate',
  version: 'v1',
  steps: 7,
  durationMs: 1810,
  tokens: 896,
  passed: false,
};

export const TEST_CASE_NAME = "What's the weather in Paris?";

export const DEVIATION_ROWS: DeviationRow[] = [
  {
    id: 'row-1',
    status: 'matched',
    left: {
      step: 1, type: 'user-prompt', label: 'User Prompt',
      content: '"What\'s the weather in Paris?"',
      durationMs: 0,
    },
    right: {
      step: 1, type: 'user-prompt', label: 'User Prompt',
      content: '"What\'s the weather in Paris?"',
      durationMs: 0,
    },
  },
  {
    id: 'row-2',
    status: 'deviation',
    left: {
      step: 2, type: 'llm-reasoning', label: 'LLM Reasoning',
      content: 'User wants weather data. I should use the Weather Tool with city="Paris".',
      durationMs: 340, tokens: 128,
    },
    right: {
      step: 2, type: 'llm-reasoning', label: 'LLM Reasoning',
      content: 'User wants weather information. Let me think about what they need...',
      durationMs: 520, tokens: 256,
    },
    judgeAnnotation: {
      title: 'AGENTIC JUDGE — INTENT DEVIATION DETECTED',
      detail: "Regressed here: Version 1 prioritized 'General Reasoning' over the 'Weather Tool' because the user didn't specify a city explicitly enough for the updated model's confidence threshold, causing a 3-turn clarification loop. Version 0 correctly inferred \"Paris\" from context and called the tool directly.",
      highlightTerms: ['General Reasoning', 'Weather Tool', '3-turn clarification loop'],
    },
  },
  {
    id: 'row-3',
    status: 'deviation',
    left: {
      step: 3, type: 'tool-call', label: 'Tool Call — weather_api',
      content: 'weather_api({ city: "Paris", units: "celsius" })',
      durationMs: 180,
      annotation: 'Direct call',
    },
    right: {
      step: 3, type: 'llm-reasoning', label: 'General Reasoning',
      content: '"I\'d be happy to help with weather! Could you confirm — do you mean Paris, France or Paris, Texas?"',
      durationMs: 410,
      warningAnnotation: 'Unnecessary clarification',
    },
  },
  {
    id: 'row-4',
    status: 'deviation',
    left: {
      step: 4, type: 'tool-result', label: 'Tool Result',
      content: '{ temp: 18°C, condition: "Partly cloudy", humidity: 65% }',
      durationMs: 45,
    },
    right: {
      step: 4, type: 'user-reply', label: 'User Reply (Extra Turn)',
      content: '"Paris, France obviously"',
      warningAnnotation: 'Added turn',
    },
  },
  {
    id: 'row-5',
    status: 'deviation',
    left: {
      step: 5, type: 'llm-response', label: 'LLM Response',
      content: '"The weather in Paris is 18°C and partly cloudy with 65% humidity."',
      durationMs: 280,
      annotation: 'Final answer',
    },
    right: {
      step: 5, type: 'llm-reasoning', label: 'LLM Reasoning',
      content: 'OK, they mean Paris, France. Now I\'ll call the weather tool.',
      durationMs: 380,
      warningAnnotation: 'Added turn',
    },
  },
  {
    id: 'row-6',
    status: 'added',
    right: {
      step: 6, type: 'tool-call', label: 'Tool Call — weather_api',
      content: 'weather_api({ city: "Paris", country: "FR", units: "celsius" })',
      durationMs: 190,
      warningAnnotation: 'Delayed call',
    },
  },
  {
    id: 'row-7',
    status: 'added',
    right: {
      step: 7, type: 'llm-response', label: 'LLM Response',
      content: '"The current weather in Paris, France is 18°C with partly cloudy skies."',
      durationMs: 310,
      annotation: 'Same answer, 3 extra turns',
    },
  },
];

export const COMPARISON_STATS = {
  extraTurns: 2,
  latencyIncrease: 114, // percent
};
