"use client";

import { useCallback, useState, useMemo, useEffect, useRef } from "react";
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
  SelectionMode,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import GraphEntityNode from "./nodes/GraphEntityNode";
import KnowledgeEdge from "./edges/KnowledgeEdge";
import type { GraphData, GraphNode as GNode, AgentAction } from "@/app/types";
import { useGraphLayout } from "./useGraphLayout";
import { useForceLayout } from "./useForceLayout";
import AsciiSpinner from "@/app/components/ascii/AsciiSpinner";

export interface PipelineCanvasProps {
  graphData: GraphData;
  selectedNode: GNode | null;
  onSelectNode: (node: GNode | null) => void;
  error: string | null;
  isSimRunning?: boolean;
  simActions?: AgentAction[];
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
  simActions,
}: PipelineCanvasProps) {
  const [clickPos, setClickPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [showEdgeLabels, setShowEdgeLabels] = useState(false);

  // Track previously seen node IDs for "new node" animation
  const prevNodeIdsRef = useRef<Set<string>>(new Set());

  // Compute active node IDs from the latest round of sim actions
  const activeNodeIds = useMemo(() => {
    if (!simActions?.length || !graphData.nodes.length) return new Set<string>();

    // Build name -> id lookup
    const nameToId = new Map<string, string>();
    for (const node of graphData.nodes) {
      nameToId.set(node.name.toLowerCase(), node.id);
    }

    const active = new Set<string>();

    // Get latest round's actions (highest round number)
    const maxRound = Math.max(...simActions.map(a => a.round || 0));
    const latestActions = simActions.filter(a => a.round === maxRound);

    for (const action of latestActions) {
      // Match agent name to person node
      const agentId = nameToId.get(action.agent?.toLowerCase() || "");
      if (agentId) active.add(agentId);

      // Match system/threat names mentioned in content
      const content = JSON.stringify(action.args || {}).toLowerCase();
      for (const [name, id] of nameToId) {
        if (name.length > 2 && content.includes(name)) {
          active.add(id);
        }
      }
    }

    return active;
  }, [simActions, graphData.nodes]);

  // Compute new node IDs (nodes that weren't in the previous render)
  const newNodeIds = useMemo(() => {
    const currentIds = new Set(graphData.nodes.map(n => n.id));
    const prevIds = prevNodeIdsRef.current;
    const newIds = new Set<string>();

    if (prevIds.size > 0) {
      for (const id of currentIds) {
        if (!prevIds.has(id)) newIds.add(id);
      }
    }

    prevNodeIdsRef.current = currentIds;
    return newIds;
  }, [graphData.nodes]);

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
  const { nodes: layoutNodes, edges: layoutEdges } = useGraphLayout(filteredGraphData, isSimRunning, activeNodeIds, newNodeIds);
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

  // Update node/edge data when active state changes (without resetting positions)
  useEffect(() => {
    if (activeNodeIds.size === 0 && newNodeIds.size === 0) return;
    setRfNodes(prev => prev.map(n => ({
      ...n,
      data: { ...n.data, isActive: activeNodeIds.has(n.id), isNew: newNodeIds.has(n.id) },
    })));
    setRfEdges(prev => prev.map(e => ({
      ...e,
      data: { ...e.data, isActive: activeNodeIds.has(e.source) && activeNodeIds.has(e.target) },
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNodeIds, newNodeIds]);

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
        fitViewOptions={{ padding: 0.2, duration: 300 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        colorMode="light"
        elevateNodesOnSelect
        selectionMode={SelectionMode.Partial}
        panOnScroll
        selectionOnDrag
        nodesFocusable
        edgesFocusable
        disableKeyboardA11y={false}
        aria-label="Company knowledge graph — use Tab to focus nodes, Enter to select, arrow keys to move"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={3} color="var(--color-pitch-black-400)" style={{ opacity: 0.4 }} />
        <Controls position="bottom-left" aria-label="Graph controls" showInteractive />
        {hasGraphNodes && (
          <MiniMap position="bottom-right" pannable zoomable nodeColor={() => "var(--color-pitch-black-400)"} aria-label="Knowledge graph minimap — click to navigate, scroll to zoom" />
        )}

        {/* Interactive filter toolbar */}
        {hasGraphNodes && (
          <Panel position="top-left">
            <div className="flex flex-wrap gap-1 mt-3 ml-3 max-w-[300px]" role="toolbar" aria-label="Filter graph by entity type">
              {entityTypes.map(([type, count]) => {
                const isActive = activeFilters.has(type);
                const label = getTypeLabel(type);
                return (
                  <button
                    key={type}
                    aria-label={`${isActive ? "Hide" : "Show"} ${label} (${count})`}
                    onClick={() => {
                      setActiveFilters(prev => {
                        const next = new Set(prev);
                        if (next.has(type)) next.delete(type);
                        else next.add(type);
                        return next;
                      });
                    }}
                    aria-pressed={isActive}
                    className={`flex items-center gap-1.5 px-2 py-1 min-h-11 rounded-md text-[10px] font-mono transition-all ${
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
                aria-pressed={showEdgeLabels}
                aria-label={`${showEdgeLabels ? "Hide" : "Show"} relationship labels`}
                className={`flex items-center gap-1.5 px-2 py-1 min-h-11 rounded-md text-[10px] font-mono transition-all ${
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
              <AsciiSpinner className="text-4xl text-primary mx-auto block" />
              <p className="text-sm font-mono text-muted-foreground/60">Building knowledge graph{"\u2026"}</p>
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
            top: Math.min(Math.max(clickPos.y - 200, 10), (typeof window !== "undefined" ? window.innerHeight : 900) - 400),
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
              aria-label="Close"
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
  vendor: "Vendor",
  network_zone: "Network Zone",
};

function getTypeLabel(type: string): string {
  if (KNOWN_TYPE_LABELS[type]) return KNOWN_TYPE_LABELS[type];
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
