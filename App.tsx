/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { refreshConfig, subscribeConfigChange } from '@/lib/constants';
import { initializeTheme } from '@/lib/theme';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { BenchmarksPage } from './components/BenchmarksPage';
import { SettingsPage } from './components/SettingsPage';
import { BenchmarkRunsPage } from './components/BenchmarkRunsPage';
import { RunDetailsPage } from './components/RunDetailsPage';
import { TestCasesPage } from './components/TestCasesPage';
import { TestCaseRunsPage } from './components/TestCaseRunsPage';
import { ComparisonPage } from './components/comparison/ComparisonPage';
import { TracesPage } from './components/traces/TracesPage';
import { AgentTracesPage } from './components/traces/AgentTracesPage';
import { BenchmarksPage4 } from './components/BenchmarksPage4';
import { BenchmarksPage4 as Evals3Benchmarks } from './components/evals3/BenchmarksPage';
import { TestCasesPage4 as Evals3TestCases } from './components/evals3/TestCasesPage';
import { BenchmarkRunsPage2 as Evals3BenchmarkRuns } from './components/evals3/BenchmarkRunsPage';
import { TestCaseDetailPage as Evals3TestCaseDetail } from './components/evals3/TestCaseDetailPage';
import { EvalRunsPage as Evals3EvalRuns } from './components/evals3/EvalRunsPage';
import { RunInspectorPage as Evals3RunInspector } from './components/evals3/RunInspectorPage';

function ExperimentRunsRedirect() {
  const { experimentId } = useParams();
  return <Navigate to={`/benchmarks/${experimentId}/runs`} replace />;
}

function App() {
  // Initialize theme on mount
  useEffect(() => {
    initializeTheme();
  }, []);

  // Fetch server config on mount so custom agents/models appear in the UI.
  // Subscribe to config changes so that any later refreshConfig() call
  // (e.g., from SettingsPage after adding a custom endpoint) re-renders
  // the entire tree, making updated agents visible in all dropdowns.
  const [, setConfigVersion] = useState(0);
  useEffect(() => {
    refreshConfig();
    return subscribeConfigChange(() => setConfigVersion(v => v + 1));
  }, []);

  return (
    <Router>
      <Layout>
        <Routes>
          {/* Primary routes */}
          <Route path="/" element={<Dashboard />} />
          <Route path="/test-cases" element={<TestCasesPage />} />
          <Route path="/test-cases/:testCaseId/runs" element={<TestCaseRunsPage />} />
          <Route path="/benchmarks" element={<BenchmarksPage />} />
          <Route path="/benchmarks/:benchmarkId/runs" element={<BenchmarkRunsPage />} />

          {/* Unified run details page - works for both test case and benchmark runs */}
          <Route path="/runs/:runId" element={<RunDetailsPage />} />

          {/* Backwards compatibility - redirect old benchmark run route to new unified route */}
          <Route path="/benchmarks/:benchmarkId/runs/:runId" element={<RunDetailsPage />} />

          {/* Settings */}
          <Route path="/settings" element={<SettingsPage />} />

          {/* Comparison */}
          <Route path="/compare/:benchmarkId" element={<ComparisonPage />} />

          {/* Live Traces */}
          <Route path="/traces" element={<TracesPage />} />

          {/* Agent Traces - Table View */}
          <Route path="/agent-traces" element={<AgentTracesPage />} />

          {/* Evals 3 → Evaluations */}
          <Route path="/evals3/benchmarks" element={<Evals3Benchmarks />} />
          <Route path="/evals3/test-cases" element={<Evals3TestCases />} />
          <Route path="/evals3/test-cases/:testCaseId" element={<Evals3TestCaseDetail />} />
          <Route path="/evals3/runs" element={<Evals3EvalRuns />} />
          <Route path="/evals3/benchmarks/:benchmarkId/runs" element={<Evals3BenchmarkRuns />} />
          <Route path="/evals3/benchmarks/:benchmarkId/runs/:runId" element={<Navigate to="inspect" replace />} />
          <Route path="/evals3/benchmarks/:benchmarkId/runs/:runId/inspect" element={<Evals3RunInspector />} />

          {/* Redirects for deprecated routes */}
          <Route path="/evals" element={<Navigate to="/test-cases" replace />} />
          <Route path="/run" element={<Navigate to="/test-cases" replace />} />
          <Route path="/reports" element={<Navigate to="/benchmarks" replace />} />
          <Route path="/experiments" element={<Navigate to="/benchmarks" replace />} />
          <Route path="/experiments/:experimentId/runs" element={<ExperimentRunsRedirect />} />

          {/* Catch-all: redirect unknown sub-paths to their parent list pages */}
          <Route path="/benchmarks/*" element={<Navigate to="/benchmarks" replace />} />
          <Route path="/test-cases/*" element={<Navigate to="/test-cases" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;