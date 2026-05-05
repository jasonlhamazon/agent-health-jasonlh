/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * JudgeConfigPage — Agent-as-a-Judge Configuration
 *
 * Replace brittle metric checkboxes with high-level "Judge Persona" configuration.
 * Users define business-specific quality guidelines in natural language.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brain, Plus, Play, Settings2, Pencil, Trash2, Copy,
  CheckCircle2, Shield, ChevronRight, Sparkles, DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Breadcrumbs } from '../evals3/Breadcrumbs';
import { MOCK_PERSONAS, JudgePersona } from './mockData';

export const JudgeConfigPage: React.FC = () => {
  const navigate = useNavigate();
  const [personas, setPersonas] = useState<JudgePersona[]>(MOCK_PERSONAS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newGuidelines, setNewGuidelines] = useState('');

  const editingPersona = personas.find(p => p.id === editingId);

  // Icon + tint per persona — keeps the Evaluator Agents page visually
  // aligned with the dashboard swarm.
  const personaVisual = (id: string): { icon: React.ReactNode } => {
    switch (id) {
      case 'trajectory-judge':
        return { icon: <Sparkles size={16} className="text-purple-400" /> };
      case 'coherence-judge':
        return { icon: <Brain size={16} className="text-purple-500" /> };
      case 'safety-policy-judge':
        return { icon: <Shield size={16} className="text-red-500" /> };
      case 'cost-budget-judge':
        return { icon: <DollarSign size={16} className="text-emerald-500" /> };
      default:
        return { icon: <Brain size={16} className="text-purple-500" /> };
    }
  };

  return (
    <div className="p-4 h-full flex flex-col">
      <Breadcrumbs
        items={[
          { label: 'Evaluations', href: '/evaluations/benchmarks' },
          { label: 'Evaluator Agents' },
        ]}
        actions={
          <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setShowCreate(true)}>
            <Plus size={12} /> New Evaluator
          </Button>
        }
      />

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Brain size={20} className="text-purple-500" />
          <h2 className="text-xl font-bold">Evaluator Agents</h2>
          <Badge className="text-[9px] px-1.5 py-0 bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-500/15 dark:text-purple-400 dark:border-purple-500/30">
            Concept
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Define business-specific quality guidelines instead of brittle metric checkboxes. Each evaluator watches a slice of agent behavior using your criteria.
        </p>
      </div>

      {/* Create Form */}
      {showCreate && (
        <Card className="mb-4 border-purple-500/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold flex items-center gap-2">
                <Sparkles size={14} className="text-purple-500" /> New Evaluator Agent
              </span>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Evaluator Name</label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g., Trajectory Judge" className="h-8 text-sm mt-1" />
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Description</label>
                <Input value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="What does this evaluator watch?" className="h-8 text-sm mt-1" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Guidelines</label>
              <Textarea
                value={newGuidelines}
                onChange={e => setNewGuidelines(e.target.value)}
                placeholder={`Define your quality criteria in natural language...\n\nExample:\nAct as a lead supervisor. Check if the agent:\n- Summarizes discussions with correct sentiment\n- Does not retry tools more than 3 times\n- Maintains professional tone`}
                className="mt-1 min-h-[160px] text-sm font-mono"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700" onClick={() => {
                setPersonas(prev => [...prev, {
                  id: `custom-${Date.now()}`, name: newName || 'Custom Evaluator', description: newDescription,
                  guidelines: newGuidelines, createdAt: new Date().toISOString(), runsCount: 0,
                }]);
                setShowCreate(false); setNewName(''); setNewDescription(''); setNewGuidelines('');
              }}>
                <Plus size={12} className="mr-1" /> Create Evaluator
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Persona Cards */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {personas.map(persona => (
          <Card
            key={persona.id}
            className={`transition-all cursor-pointer hover:border-purple-500/50 ${editingId === persona.id ? 'border-purple-500 ring-1 ring-purple-500/20' : ''}`}
            onClick={() => setEditingId(editingId === persona.id ? null : persona.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {personaVisual(persona.id).icon}
                    <h3 className="font-semibold text-sm">{persona.name}</h3>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">{persona.runsCount} runs</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{persona.description}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={e => { e.stopPropagation(); navigate('/judge/evaluate'); }}>
                    <Play size={10} /> Run
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); setEditingId(persona.id); }}>
                    <Pencil size={12} />
                  </Button>
                </div>
              </div>

              {/* Expanded: show guidelines */}
              {editingId === persona.id && (
                <div className="mt-3 pt-3 border-t">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Guidelines</label>
                  <pre className="text-xs bg-muted/40 rounded-md p-3 border border-border whitespace-pre-wrap font-mono leading-relaxed max-h-[300px] overflow-y-auto">
                    {persona.guidelines}
                  </pre>
                  <div className="flex items-center gap-2 mt-3">
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                      <Copy size={10} /> Duplicate
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10">
                      <Trash2 size={10} /> Delete
                    </Button>
                    <div className="flex-1" />
                    <Button size="sm" className="h-7 gap-1 text-xs bg-purple-600 hover:bg-purple-700" onClick={e => { e.stopPropagation(); navigate('/judge/evaluate'); }}>
                      <Play size={10} /> Run Evaluation
                      <ChevronRight size={10} />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
