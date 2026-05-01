/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * InteractionSwarm — a live node map of Target Agents (Actors) and the
 * Evaluator Agents (Judges) that monitor them.
 *
 * - Target Agents sit in an inner ring, Evaluator Agents on an outer ring.
 * - Target↔Target edges "glow" with intensity (proxy for token volume).
 * - Evaluator→Target edges are dashed/subtle "watch" links.
 * - Intensities jitter on a timer so the swarm feels alive.
 *
 * Concept mockup only — data comes from ./mockSwarm.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Brain, Eye, Shield, DollarSign, Sparkles, Bot, Search, ListTree, Wrench, Library, Gavel } from 'lucide-react';
import {
  ALL_AGENTS,
  ALL_LINKS,
  SwarmAgent,
  SwarmLink,
  TARGET_AGENTS,
  EVALUATOR_AGENTS,
  TARGET_LINKS,
  WATCH_LINKS,
} from './mockSwarm';

interface InteractionSwarmProps {
  /** Called when user clicks an agent node; used to drive the side panel. */
  onSelectAgent?: (agent: SwarmAgent | null) => void;
  selectedAgentId?: string | null;
}

// ---------- Layout ----------------------------------------------------------

/**
 * Places Target Agents in an inner ring and Evaluator Agents on a larger outer
 * ring. Coordinates are in React Flow's coordinate space.
 */
function ringLayout(
  agents: SwarmAgent[],
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
): Record<string, { x: number; y: number }> {
  const targets = agents.filter(a => a.kind === 'target');
  const evaluators = agents.filter(a => a.kind === 'evaluator');
  const pos: Record<string, { x: number; y: number }> = {};

  targets.forEach((a, i) => {
    const theta = (i / targets.length) * Math.PI * 2 - Math.PI / 2;
    pos[a.id] = { x: cx + rInner * Math.cos(theta), y: cy + rInner * Math.sin(theta) };
  });
  evaluators.forEach((a, i) => {
    // Offset evaluators so they don't stack on top of target angles
    const theta = (i / evaluators.length) * Math.PI * 2 - Math.PI / 2 + Math.PI / evaluators.length;
    pos[a.id] = { x: cx + rOuter * Math.cos(theta), y: cy + rOuter * Math.sin(theta) };
  });
  return pos;
}

// ---------- Custom nodes ----------------------------------------------------

const ROLE_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  orchestrator: Bot,
  researcher: Search,
  planner: ListTree,
  executor: Wrench,
  retriever: Library,
  critic: Gavel,
  pathfinder: Sparkles,
  coherence: Brain,
  safety: Shield,
  cost: DollarSign,
};

interface SwarmNodeData {
  agent: SwarmAgent;
  selected?: boolean;
  [key: string]: unknown; // index signature for xyflow's generic Node<T>
}

type SwarmNode = Node<SwarmNodeData>;

function TargetAgentNode({ data }: NodeProps<SwarmNode>) {
  const { agent, selected } = data;
  const Icon = ROLE_ICON[agent.role] ?? Bot;
  // Size scales with activity (diameter 56..88px)
  const size = 56 + Math.round(agent.activity * 32);
  // Health-based ring tint
  const ring =
    agent.health > 0.8
      ? 'rgba(34,197,94,0.9)'    // emerald
      : agent.health > 0.6
        ? 'rgba(234,179,8,0.9)'  // amber
        : 'rgba(239,68,68,0.95)'; // red

  return (
    <div
      className="group relative flex flex-col items-center justify-center"
      style={{ width: size, height: size }}
      data-testid={`swarm-node-${agent.id}`}
    >
      {/* Hidden handles so React Flow can wire edges at the center */}
      <Handle type="source" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="target" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />

      {/* Pulsing halo — opacity scales with activity */}
      <div
        className="absolute inset-0 rounded-full animate-pulse"
        style={{
          background: `radial-gradient(circle, ${ring} 0%, transparent 70%)`,
          opacity: 0.15 + agent.activity * 0.35,
        }}
      />
      {/* Core disk */}
      <div
        className="relative rounded-full flex flex-col items-center justify-center text-white shadow-lg transition-transform group-hover:scale-105"
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
          border: `2px solid ${selected ? '#a78bfa' : ring}`,
          boxShadow: selected
            ? '0 0 0 3px rgba(167,139,250,0.35), 0 8px 24px rgba(0,0,0,0.4)'
            : '0 6px 18px rgba(0,0,0,0.35)',
        }}
      >
        <Icon size={Math.round(size * 0.32)} className="text-slate-100" />
        <div className="text-[9px] font-semibold mt-0.5 text-slate-100 leading-none">
          {agent.label}
        </div>
      </div>
    </div>
  );
}

function EvaluatorAgentNode({ data }: NodeProps<SwarmNode>) {
  const { agent, selected } = data;
  const Icon = ROLE_ICON[agent.role] ?? Eye;
  const size = 54;

  return (
    <div
      className="group relative flex flex-col items-center justify-center"
      style={{ width: size, height: size }}
      data-testid={`swarm-node-${agent.id}`}
    >
      <Handle type="source" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="target" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />

      {/* Hex-ish squircle with dashed purple ring to distinguish evaluators */}
      <div
        className="relative flex items-center justify-center transition-transform group-hover:scale-105"
        style={{
          width: size,
          height: size,
          borderRadius: 14,
          background: 'linear-gradient(145deg, #2e1065 0%, #1e1b4b 100%)',
          border: `1.5px dashed ${selected ? '#f0abfc' : '#a78bfa'}`,
          boxShadow: selected
            ? '0 0 0 3px rgba(240,171,252,0.3), 0 6px 18px rgba(124,58,237,0.35)'
            : '0 4px 14px rgba(124,58,237,0.25)',
        }}
      >
        <Icon size={18} className="text-purple-200" />
      </div>
      <div className="absolute -bottom-4 text-[9px] font-medium text-purple-300 whitespace-nowrap">
        {agent.label}
      </div>
    </div>
  );
}

const nodeTypes = {
  target: TargetAgentNode,
  evaluator: EvaluatorAgentNode,
};

// ---------- Edges -----------------------------------------------------------

/** Build React Flow edges from our swarm links + current intensities. */
function buildEdges(
  links: SwarmLink[],
  intensities: Record<string, number>,
): Edge[] {
  return links.map(l => {
    const i = intensities[l.id] ?? l.intensity;
    if (l.watch) {
      return {
        id: l.id,
        source: l.source,
        target: l.target,
        animated: false,
        style: {
          stroke: '#a78bfa',
          strokeWidth: 1,
          strokeDasharray: '4 4',
          opacity: 0.4 + i * 0.3,
        },
      } satisfies Edge;
    }
    // Target↔Target: color by intensity, glow via filter
    const width = 1 + i * 5;
    const hue = 200 - i * 40; // cyan → magenta as intensity rises
    const stroke = `hsl(${hue}, 90%, ${55 + i * 10}%)`;
    return {
      id: l.id,
      source: l.source,
      target: l.target,
      animated: i > 0.55,
      style: {
        stroke,
        strokeWidth: width,
        opacity: 0.5 + i * 0.45,
        filter: i > 0.5 ? `drop-shadow(0 0 ${4 + i * 6}px ${stroke})` : undefined,
      },
    } satisfies Edge;
  });
}

// ---------- Component -------------------------------------------------------

export const InteractionSwarm: React.FC<InteractionSwarmProps> = ({
  onSelectAgent,
  selectedAgentId,
}) => {
  // Jittered intensities per edge, updated on a timer to bring the swarm alive
  const [intensities, setIntensities] = useState<Record<string, number>>(() => {
    const base: Record<string, number> = {};
    ALL_LINKS.forEach(l => (base[l.id] = l.intensity));
    return base;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setIntensities(prev => {
        const next: Record<string, number> = {};
        ALL_LINKS.forEach(l => {
          const current = prev[l.id] ?? l.intensity;
          // Drift toward baseline with ±0.15 jitter, clamped
          const drift = (l.intensity - current) * 0.25;
          const jitter = (Math.random() - 0.5) * 0.3;
          next[l.id] = Math.max(0.05, Math.min(1, current + drift + jitter));
        });
        return next;
      });
    }, 1400);
    return () => clearInterval(timer);
  }, []);

  // Layout is stable across renders
  const positions = useMemo(
    () => ringLayout(ALL_AGENTS, 420, 300, 180, 320),
    [],
  );

  const nodes: SwarmNode[] = useMemo(
    () =>
      ALL_AGENTS.map(a => ({
        id: a.id,
        type: a.kind, // 'target' | 'evaluator'
        position: positions[a.id],
        data: { agent: a, selected: a.id === selectedAgentId },
        draggable: true,
        selectable: true,
      })),
    [positions, selectedAgentId],
  );

  const edges = useMemo(() => buildEdges(ALL_LINKS, intensities), [intensities]);

  const handleNodeClick = useCallback(
    (_e: React.MouseEvent, node: SwarmNode) => {
      onSelectAgent?.(node.data.agent);
    },
    [onSelectAgent],
  );

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden border bg-[#0b1120] dark:bg-[#0b1120]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onPaneClick={() => onSelectAgent?.(null)}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        panOnDrag
        zoomOnScroll
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1e293b" />
        <Controls showInteractive={false} className="!bg-slate-900/80 !border-slate-700" />
      </ReactFlow>

      {/* Legend */}
      <div className="absolute top-2 left-2 flex items-center gap-3 px-2.5 py-1.5 rounded-md bg-slate-900/80 border border-slate-700 text-[10px] text-slate-200 backdrop-blur">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" />
          Target Agent
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-[3px] border border-dashed border-purple-400" />
          Evaluator Agent
        </span>
        <span className="flex items-center gap-1.5 text-slate-400">
          <span className="inline-block w-4 h-0.5 bg-cyan-400" />
          Active traffic
        </span>
      </div>

      {/* Counts */}
      <div className="absolute top-2 right-2 flex items-center gap-2 text-[10px]">
        <span className="px-2 py-1 rounded-md bg-slate-900/80 border border-slate-700 text-slate-200">
          {TARGET_AGENTS.length} Actors · {TARGET_LINKS.length} links
        </span>
        <span className="px-2 py-1 rounded-md bg-purple-950/70 border border-purple-700/60 text-purple-200">
          {EVALUATOR_AGENTS.length} Judges · {WATCH_LINKS.length} watches
        </span>
      </div>
    </div>
  );
};
