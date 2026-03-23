"use client";

import { useCallback, useState, useMemo, useEffect } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Panel,
  useNodesState,
  useEdgesState,
  useOnSelectionChange,
  getConnectedEdges,
  useReactFlow,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import GraphEntityNode from "./nodes/GraphEntityNode";
import KnowledgeEdge from "./edges/KnowledgeEdge";
import type { GraphData, GraphNode as GNode } from "@/app/types";
import { useGraphLayout } from "./useGraphLayout";
import { useForceLayout } from "./useForceLayout";

export interface PipelineCanvasProps {
  graphData: GraphData;
  selectedNode: GNode | null;
  onSelectNode: (node: GNode | null) => void;
  error: string | null;
  isSimRunning?: boolean;
}

const nodeTypes = {
  graphEntity: GraphEntityNode,
};

const edgeTypes = {
  knowledge: KnowledgeEdge,
};

// ── Neighborhood Highlighter (inside ReactFlow) ──
function NeighborhoodHighlighter() {
  const { getNodes, getEdges, setNodes, setEdges } = useReactFlow();

  useOnSelectionChange({
    onChange: ({ nodes: selectedNodes }) => {
      const allEdges = getEdges();
      const allNodes = getNodes();

      if (selectedNodes.length === 0) {
        setNodes(allNodes.map(n => ({
          ...n,
          data: { ...n.data, isDimmed: false, isHighlighted: false },
        })));
        setEdges(allEdges.map(e => ({
          ...e,
          data: { ...e.data, isDimmed: false, isHighlighted: false },
        })));
        return;
      }

      const connected = getConnectedEdges(selectedNodes, allEdges);
      const connectedEdgeIds = new Set(connected.map(e => e.id));
      const neighborIds = new Set<string>();
      connected.forEach(e => {
        neighborIds.add(e.source);
        neighborIds.add(e.target);
      });
      selectedNodes.forEach(n => neighborIds.add(n.id));

      setNodes(allNodes.map(n => ({
        ...n,
        data: {
          ...n.data,
          isHighlighted: neighborIds.has(n.id),
          isDimmed: !neighborIds.has(n.id),
        },
      })));

      setEdges(allEdges.map(e => ({
        ...e,
        data: {
          ...e.data,
          isHighlighted: connectedEdgeIds.has(e.id),
          isDimmed: !connectedEdgeIds.has(e.id),
        },
      })));
    },
  });

  return null;
}

// ── Inner canvas (inside ReactFlowProvider, has access to useReactFlow) ──
function PipelineCanvasInner({
  graphData,
  selectedNode,
  onSelectNode,
  error,
  isSimRunning = false,
}: PipelineCanvasProps) {
  const [clickPos, setClickPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [showEdgeLabels, setShowEdgeLabels] = useState(false);

  // Compute available types from graphData
  const entityTypes = useMemo(() => {
    const types = new Map<string, number>();
    for (const n of graphData.nodes) {
      const t = n.type || "default";
      types.set(t, (types.get(t) || 0) + 1);
    }
    return Array.from(types.entries()).sort((a, b) => b[1] - a[1]);
  }, [graphData.nodes]);

  // Initialize filters to "all visible" when graph data first loads
  useEffect(() => {
    if (entityTypes.length > 0 && activeFilters.size === 0) {
      setActiveFilters(new Set(entityTypes.map(([t]) => t)));
    }
  }, [entityTypes]);

  // Filter nodes and edges based on active type filters
  const filteredGraphData = useMemo(() => {
    if (activeFilters.size === 0 || activeFilters.size === entityTypes.length) {
      return graphData;
    }
    const filteredNodes = graphData.nodes.filter(n => activeFilters.has(n.type || "default"));
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = graphData.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
    return { nodes: filteredNodes, edges: filteredEdges };
  }, [graphData, activeFilters, entityTypes.length]);

  // Pure synchronous layout for initial positions
  const { nodes: layoutNodes, edges: layoutEdges } = useGraphLayout(filteredGraphData, isSimRunning);
  const hasGraphNodes = graphData.nodes.length > 0;

  // Stable identity key — only changes when the actual node set changes
  const graphKey = useMemo(
    () => filteredGraphData.nodes.map(n => n.id).sort().join(","),
    [filteredGraphData.nodes],
  );

  // Controlled mode — useNodesState/useEdgesState
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(layoutNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(layoutEdges);

  // Sync ONLY when graph structure changes (new/removed nodes), NOT on position changes
  useEffect(() => {
    console.log("[canvas] syncing nodes — graph structure changed:", layoutNodes.length);
    setRfNodes(layoutNodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphKey]);

  // Sync edges when graph structure changes or label toggle changes
  useEffect(() => {
    if (showEdgeLabels) {
      setRfEdges(layoutEdges.map(e => ({ ...e, data: { ...e.data, showLabel: true } })));
    } else {
      setRfEdges(layoutEdges);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphKey, showEdgeLabels]);

  // Force layout hook — returns drag event handlers
  // Uses useReactFlow() internally (we're inside ReactFlowProvider)
  const dragEvents = useForceLayout();

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (node.type === "graphEntity") {
        const gn = graphData.nodes.find((n) => n.id === node.id);
        setClickPos({ x: event.clientX, y: event.clientY });
        onSelectNode(gn || null);
      }
    },
    [graphData.nodes, onSelectNode]
  );

  const onPaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  return (
    <div style={{ width: "100%", height: "100%" }} className="relative">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onNodeDragStart={dragEvents.onNodeDragStart}
        onNodeDrag={dragEvents.onNodeDrag}
        onNodeDragStop={dragEvents.onNodeDragStop}
        onPaneClick={onPaneClick}
        fitView
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={3} color="var(--color-pitch-black-400)" style={{ opacity: 0.4 }} />
        <Controls position="bottom-right" />
        {hasGraphNodes && (
          <MiniMap position="bottom-right" style={{ marginBottom: 50 }} nodeColor={() => "var(--color-pitch-black-400)"} />
        )}

        {/* Interactive filter toolbar */}
        {hasGraphNodes && (
          <Panel position="top-left">
            <div className="flex flex-wrap gap-1 mt-3 ml-3 max-w-[300px]">
              {entityTypes.map(([type, count]) => {
                const isActive = activeFilters.has(type);
                return (
                  <button
                    key={type}
                    onClick={() => {
                      setActiveFilters(prev => {
                        const next = new Set(prev);
                        if (next.has(type)) next.delete(type);
                        else next.add(type);
                        return next;
                      });
                    }}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono transition-all ${
                      isActive
                        ? "bg-card border border-border/30 text-foreground/80 shadow-sm"
                        : "bg-card/50 border border-border/10 text-muted-foreground/40 line-through"
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: getTypeColor(type), opacity: isActive ? 1 : 0.3 }}
                    />
                    {getTypeLabel(type)}
                    <span className="text-muted-foreground/40">{count}</span>
                  </button>
                );
              })}
              <button
                onClick={() => setShowEdgeLabels(prev => !prev)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono transition-all ${
                  showEdgeLabels
                    ? "bg-card border border-primary/30 text-primary shadow-sm"
                    : "bg-card/50 border border-border/10 text-muted-foreground/40"
                }`}
              >
                Labels {showEdgeLabels ? "on" : "off"}
              </button>
            </div>
          </Panel>
        )}

        {error && (
          <Panel position="top-center">
            <div className="mt-4 px-4 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-mono">
              {error}
            </div>
          </Panel>
        )}

        {!hasGraphNodes && (
          <Panel position="top-center">
            <div className="mt-20 text-center space-y-3">
              <div className="w-10 h-10 mx-auto rounded-full border-2 border-primary/30 border-t-transparent animate-spin" />
              <p className="text-sm font-mono text-muted-foreground/60">Building knowledge graph...</p>
            </div>
          </Panel>
        )}

        <NeighborhoodHighlighter />
      </ReactFlow>

      {/* Node detail tooltip */}
      {selectedNode && (
        <div
          className="absolute z-30 w-[280px] bg-card rounded-xl border border-border/30 shadow-xl p-4"
          style={{
            left: Math.min(clickPos.x - 140, (typeof window !== "undefined" ? window.innerWidth : 1400) - 300),
            top: Math.max(clickPos.y - 200, 10),
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-mono text-sm font-semibold">{selectedNode.name}</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: getTypeColor(selectedNode.type) }}
                />
                <span className="text-[10px] font-mono text-muted-foreground uppercase">
                  {getTypeLabel(selectedNode.type)}
                </span>
              </div>
            </div>
            <button
              onClick={() => onSelectNode(null)}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              ✕
            </button>
          </div>
          {selectedNode.summary && (
            <p className="text-xs font-mono text-muted-foreground mb-3 leading-relaxed">{selectedNode.summary}</p>
          )}
          {Object.keys(selectedNode.attributes).length > 0 && (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {Object.entries(selectedNode.attributes).map(([k, v]) => (
                <div key={k} className="text-[10px] font-mono">
                  <span className="text-muted-foreground/60">{k}</span>
                  <p className="text-foreground/80 mt-0.5 leading-relaxed">{String(v)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Outer wrapper — provides ReactFlowProvider ──
export default function PipelineCanvas(props: PipelineCanvasProps) {
  return (
    <ReactFlowProvider>
      <PipelineCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

/* ── Constants ── */

// Known types with assigned colors
const KNOWN_TYPE_COLORS: Record<string, string> = {
  person: "var(--color-royal-azure-500)",
  organization: "var(--color-sandy-brown-500)",
  org: "var(--color-sandy-brown-500)",
  agent: "var(--color-royal-azure-500)",
  threat: "var(--color-burnt-peach-500)",
  compliance: "var(--color-tuscan-sun-500)",
  system: "var(--color-verdigris-500)",
  event: "var(--color-tuscan-sun-600)",
  default: "var(--color-pitch-black-400)",
};

// Palette for unknown types — cycles through design system colors
const DYNAMIC_PALETTE = [
  "var(--color-royal-azure-400)",
  "var(--color-tuscan-sun-600)",
  "var(--color-burnt-peach-400)",
  "var(--color-verdigris-400)",
  "var(--color-sandy-brown-400)",
  "var(--color-royal-azure-300)",
];

const _dynamicColorCache: Record<string, string> = {};

function getTypeColor(type: string): string {
  if (KNOWN_TYPE_COLORS[type]) return KNOWN_TYPE_COLORS[type];
  if (_dynamicColorCache[type]) return _dynamicColorCache[type];
  const idx = Object.keys(_dynamicColorCache).length % DYNAMIC_PALETTE.length;
  _dynamicColorCache[type] = DYNAMIC_PALETTE[idx];
  return _dynamicColorCache[type];
}

// Known labels — unknown types get auto-capitalized
const KNOWN_TYPE_LABELS: Record<string, string> = {
  person: "Person",
  organization: "Organization",
  org: "Organization",
  agent: "Person",
  threat: "Threat",
  compliance: "Compliance",
  system: "System",
  event: "Event",
};

function getTypeLabel(type: string): string {
  return KNOWN_TYPE_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1);
}
