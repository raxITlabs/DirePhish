"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as d3 from "d3";
import type { GraphData, GraphNode, GraphEdge } from "@/app/types";
import GraphNodeDetail from "./GraphNodeDetail";
import GraphLegend, { TYPE_COLORS } from "./GraphLegend";
import GraphToolbar from "./GraphToolbar";

interface Props {
  data: GraphData;
  isLive: boolean;
  isPushing?: boolean;
  onRefresh: () => void;
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: string;
  attributes: Record<string, unknown>;
  summary?: string;
  created_at?: string;
  uuid?: string;
  labels?: string[];
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  label: string;
  type: string;
  fact?: string;
  uuid?: string;
  created_at?: string;
  valid_at?: string;
  episodes?: string[];
  _originalEdge: GraphEdge;
}

function nodeRadius(d: SimNode): number {
  return d.type === "org" ? 18 : 12;
}

function nodeColor(d: SimNode): string {
  return TYPE_COLORS[d.type] || TYPE_COLORS.default;
}

function nodeInitials(d: SimNode): string {
  const words = d.name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function truncateName(name: string, maxLen = 14): string {
  return name.length > maxLen ? name.substring(0, maxLen - 1) + "\u2026" : name;
}

/** Build edge key for grouping parallel edges */
function edgePairKey(source: string, target: string): string {
  return [source, target].sort().join("||");
}

const getCSSVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export default function GraphPanel({ data, isLive, isPushing, onRefresh }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  // Filter state
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set()); // empty = all active
  const [searchQuery, setSearchQuery] = useState("");
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [edgeFilter, setEdgeFilter] = useState("all");

  // Resize handler
  useEffect(() => {
    function updateSize() {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    }
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Initialize activeTypes when data changes
  useEffect(() => {
    const types = new Set(data.nodes.map((n) => n.type));
    setActiveTypes(types);
  }, [data.nodes.length]);

  // Toggle a node type on/off
  const handleToggleType = useCallback((type: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  // Escape key clears focus mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusNodeId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Compute filtered data
  const filteredData = useMemo(() => {
    let nodes = data.nodes;
    let edges = data.edges;

    // Type filter
    if (activeTypes.size > 0) {
      const visibleIds = new Set(
        nodes.filter((n) => activeTypes.has(n.type)).map((n) => n.id)
      );
      nodes = nodes.filter((n) => visibleIds.has(n.id));
      edges = edges.filter(
        (e) => visibleIds.has(e.source) && visibleIds.has(e.target)
      );
    }

    // Focus mode — show only 1-hop neighborhood
    if (focusNodeId) {
      const neighborIds = new Set<string>([focusNodeId]);
      edges.forEach((e) => {
        if (e.source === focusNodeId) neighborIds.add(e.target);
        if (e.target === focusNodeId) neighborIds.add(e.source);
      });
      nodes = nodes.filter((n) => neighborIds.has(n.id));
      edges = edges.filter(
        (e) => neighborIds.has(e.source) && neighborIds.has(e.target)
      );
    }

    // Edge type filter
    if (edgeFilter !== "all") {
      const patterns: Record<string, RegExp> = {
        communication:
          /COMMUNICAT|SENT_EMAIL|ADVISES|DIRECTS|ORDERED|REQUESTED|ACKNOWLEDGED/i,
        hierarchy:
          /REPORTS_TO|WORKS_IN|HAS_TITLE|HOLDS_POSITION|HOLDS_TITLE/i,
        risk: /AFFECTS|POSES_RISK|IMPACTS|MITIGAT|DISRUPTS/i,
        action:
          /ISOLATES|MONITORS|CONTAINED|AUTHORIZED|MANAGES|INITIATED/i,
      };
      const pattern = patterns[edgeFilter];
      if (pattern) {
        edges = edges.filter((e) => pattern.test(e.label));
        // Keep only nodes that have at least one visible edge
        const connectedIds = new Set<string>();
        edges.forEach((e) => {
          connectedIds.add(e.source);
          connectedIds.add(e.target);
        });
        nodes = nodes.filter((n) => connectedIds.has(n.id));
      }
    }

    return { nodes, edges };
  }, [data, activeTypes, focusNodeId, edgeFilter]);

  const connectedEdges = selectedNode
    ? data.edges.filter(
        (e) => e.source === selectedNode.id || e.target === selectedNode.id
      )
    : [];

  const handleClose = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);

  // D3 rendering
  useEffect(() => {
    if (!svgRef.current || filteredData.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    const { width, height } = dimensions;

    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height);

    const g = svg.append("g");

    // Zoom — adaptive label visibility based on zoom level
    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => {
          g.attr("transform", event.transform);
          const k = event.transform.k;
          g.select(".node-labels").attr("opacity", k > 1.5 ? 1 : 0);
          g.select(".node-initials").attr("opacity", k > 0.8 ? 1 : 0);
          g.select(".edge-labels").attr("opacity", k > 2 ? 1 : 0);
        })
    );

    // Click on background to deselect
    svg.on("click", (event) => {
      if (event.target === svgRef.current) {
        setSelectedNode(null);
        setSelectedEdge(null);
      }
    });

    const nodes: SimNode[] = filteredData.nodes.map((n) => ({ ...n }));
    const links: SimLink[] = filteredData.edges.map((e) => ({
      source: e.source,
      target: e.target,
      label: e.label,
      type: e.type,
      fact: e.fact,
      uuid: e.uuid,
      created_at: e.created_at,
      valid_at: e.valid_at,
      episodes: e.episodes,
      _originalEdge: e,
    }));

    // Group edges by pair for curve computation
    const pairCounts = new Map<string, number>();
    const pairIndices = new Map<string, number>();
    for (const link of links) {
      const srcId =
        typeof link.source === "string"
          ? link.source
          : (link.source as SimNode).id;
      const tgtId =
        typeof link.target === "string"
          ? link.target
          : (link.target as SimNode).id;
      const key = edgePairKey(srcId, tgtId);
      pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
    }
    for (const link of links) {
      const srcId =
        typeof link.source === "string"
          ? link.source
          : (link.source as SimNode).id;
      const tgtId =
        typeof link.target === "string"
          ? link.target
          : (link.target as SimNode).id;
      const key = edgePairKey(srcId, tgtId);
      const idx = pairIndices.get(key) || 0;
      pairIndices.set(key, idx + 1);
      (link as SimLink & { _pairIndex: number; _pairTotal: number })._pairIndex = idx;
      (link as SimLink & { _pairIndex: number; _pairTotal: number })._pairTotal = pairCounts.get(key) || 1;
    }

    // Dynamic link distance
    function dynamicDistance(d: SimLink): number {
      const srcId = (d.source as SimNode).id || (d.source as string);
      const tgtId = (d.target as SimNode).id || (d.target as string);
      const key = edgePairKey(srcId, tgtId);
      const total = pairCounts.get(key) || 1;
      return 100 + total * 20;
    }

    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((d) => dynamicDistance(d))
      )
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(60))
      .force("x", d3.forceX(width / 2).strength(0.04))
      .force("y", d3.forceY(height / 2).strength(0.04));

    // Edge paths
    const edgeGroup = g.append("g").attr("class", "edges");
    const edgePaths = edgeGroup
      .selectAll<SVGPathElement, SimLink>("path")
      .data(links)
      .join("path")
      .attr("fill", "none")
      .attr("stroke", (d) => {
        if (/AFFECTS|POSES_RISK|DISRUPTS|IMPACTS/i.test(d.label))
          return getCSSVar('--color-burnt-peach-400');
        return getCSSVar('--border');
      })
      .attr("stroke-width", 0.8)
      .attr("opacity", 0.15)
      .attr("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        setSelectedEdge(d._originalEdge);
        setSelectedNode(null);
      });

    // Edge label backgrounds + text
    const edgeLabelGroup = g.append("g").attr("class", "edge-labels");

    const edgeLabelBg = edgeLabelGroup
      .selectAll<SVGRectElement, SimLink>("rect")
      .data(links)
      .join("rect")
      .attr("fill", getCSSVar('--background'))
      .attr("rx", 2)
      .attr("opacity", 0.9)
      .attr("pointer-events", "none");

    const edgeLabelText = edgeLabelGroup
      .selectAll<SVGTextElement, SimLink>("text")
      .data(links)
      .join("text")
      .text((d) => truncateName(d.label, 20))
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("fill", getCSSVar('--muted-foreground'))
      .attr("font-size", 10)
      .attr("pointer-events", "none");

    edgeLabelText.append("title").text((d) => d.label);

    // Nodes
    const nodeGroup = g.append("g").attr("class", "nodes");
    const nodeCircles = nodeGroup
      .selectAll<SVGCircleElement, SimNode>("circle")
      .data(nodes)
      .join("circle")
      .attr("r", nodeRadius)
      .attr("fill", nodeColor)
      .attr("opacity", 0.9)
      .attr("stroke", "transparent")
      .attr("stroke-width", 2)
      .attr("cursor", "pointer")
      .on("mouseover", function () {
        d3.select(this).attr("stroke", getCSSVar('--color-royal-azure-400'));
      })
      .on("mouseout", function (_, d) {
        const isSelected = selectedNode && (d as SimNode).id === selectedNode.id;
        d3.select(this).attr("stroke", isSelected ? getCSSVar('--color-royal-azure-400') : "transparent");
      })
      .on("dblclick", (event, d) => {
        event.stopPropagation();
        setFocusNodeId(d.id);
      });

    // Apply search highlighting
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      nodeCircles
        .attr("opacity", (d) =>
          d.name.toLowerCase().includes(q) ? 1 : 0.15
        )
        .attr("stroke", (d) =>
          d.name.toLowerCase().includes(q) ? getCSSVar('--color-royal-azure-400') : "transparent"
        )
        .attr("stroke-width", (d) =>
          d.name.toLowerCase().includes(q) ? 3 : 2
        );
    }

    // Click vs drag tracking
    let dragMoved = 0;

    nodeCircles.call(
      d3
        .drag<SVGCircleElement, SimNode>()
        .on("start", (event, d) => {
          dragMoved = 0;
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          dragMoved += Math.abs(event.dx) + Math.abs(event.dy);
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
          if (dragMoved < 5) {
            // Treat as click
            setSelectedNode({
              id: d.id,
              name: d.name,
              type: d.type,
              attributes: d.attributes,
              summary: d.summary,
              created_at: d.created_at,
              uuid: d.uuid,
              labels: d.labels,
            });
            setSelectedEdge(null);
          }
        })
    );

    // In-circle initials — always visible
    const nodeInitialsText = g
      .append("g")
      .attr("class", "node-initials")
      .selectAll<SVGTextElement, SimNode>("text")
      .data(nodes)
      .join("text")
      .text((d) => nodeInitials(d))
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("fill", "white")
      .attr("font-size", (d) => (d.type === "org" ? 9 : 7))
      .attr("font-weight", 700)
      .attr("pointer-events", "none");

    // External node labels — positioned below circles
    const nodeLabelGroup = g.append("g").attr("class", "node-labels");

    const nodeLabelBg = nodeLabelGroup
      .selectAll<SVGRectElement, SimNode>("rect")
      .data(nodes)
      .join("rect")
      .attr("fill", (() => {
        const v = getCSSVar('--color-pitch-black-950');
        // Insert alpha into oklch value: "oklch(L C H)" -> "oklch(L C H / 0.6)"
        return v.replace(/\)$/, ' / 0.6)');
      })())
      .attr("rx", 3)
      .attr("pointer-events", "none");

    const nodeLabels = nodeLabelGroup
      .selectAll<SVGTextElement, SimNode>("text")
      .data(nodes)
      .join("text")
      .text((d) => truncateName(d.name))
      .attr("text-anchor", "middle")
      .attr("fill", getCSSVar('--color-pitch-black-200'))
      .attr("font-size", 10)
      .attr("font-weight", 500)
      .attr("pointer-events", "none");

    nodeLabels.append("title").text((d) => d.name);

    // Path generator
    function computePath(d: SimLink & { _pairIndex?: number; _pairTotal?: number }): string {
      const source = d.source as SimNode;
      const target = d.target as SimNode;
      const sx = source.x ?? 0;
      const sy = source.y ?? 0;
      const tx = target.x ?? 0;
      const ty = target.y ?? 0;
      const pairIndex = d._pairIndex ?? 0;
      const pairTotal = d._pairTotal ?? 1;

      // Self-loop
      if (source.id === target.id) {
        const r = nodeRadius(source);
        const lr = 25 + pairIndex * 10;
        return `M${sx},${sy - r} A${lr},${lr} 0 1,1 ${sx + 1},${sy - r}`;
      }

      // All edges use Bezier curves for visual consistency
      const dx = tx - sx;
      const dy = ty - sy;
      const dr = Math.sqrt(dx * dx + dy * dy) || 1;
      const perpX = -dy / dr;
      const perpY = dx / dr;
      const mx = (sx + tx) / 2;
      const my = (sy + ty) / 2;

      // Single edge: subtle curve; parallel edges: offset curve
      const offset = pairTotal === 1
        ? dr * 0.08
        : (pairIndex - (pairTotal - 1) / 2) * 40;

      return `M${sx},${sy} Q${mx + offset * perpX},${my + offset * perpY} ${tx},${ty}`;
    }

    function edgeMidpoint(d: SimLink & { _pairIndex?: number; _pairTotal?: number }): [number, number] {
      const source = d.source as SimNode;
      const target = d.target as SimNode;
      const sx = source.x ?? 0;
      const sy = source.y ?? 0;
      const tx = target.x ?? 0;
      const ty = target.y ?? 0;
      const pairIndex = d._pairIndex ?? 0;
      const pairTotal = d._pairTotal ?? 1;

      if (source.id === target.id) {
        const lr = 25 + pairIndex * 10;
        return [sx, sy - nodeRadius(source) - lr];
      }

      const dx = tx - sx;
      const dy = ty - sy;
      const dr = Math.sqrt(dx * dx + dy * dy) || 1;
      const perpX = -dy / dr;
      const perpY = dx / dr;
      const mx = (sx + tx) / 2;
      const my = (sy + ty) / 2;

      // Match computePath: single edges also have a subtle curve
      const offset = pairTotal === 1
        ? dr * 0.08
        : (pairIndex - (pairTotal - 1) / 2) * 40;
      // Quadratic bezier midpoint is at t=0.5: lerp between control and endpoints
      return [
        mx + (offset * perpX) / 2,
        my + (offset * perpY) / 2,
      ];
    }

    // Tick
    simulation.on("tick", () => {
      edgePaths.attr("d", (d) => computePath(d as SimLink & { _pairIndex: number; _pairTotal: number }));

      nodeCircles.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!);
      nodeInitialsText.attr("x", (d) => d.x!).attr("y", (d) => d.y!);
      nodeLabels
        .attr("x", (d) => d.x!)
        .attr("y", (d) => d.y! + nodeRadius(d) + 14);

      nodeLabelBg.each(function (d, i) {
        const textEl = nodeLabels.nodes()[i];
        if (!textEl) return;
        const bbox = textEl.getBBox();
        d3.select(this)
          .attr("x", bbox.x - 3)
          .attr("y", bbox.y - 1)
          .attr("width", bbox.width + 6)
          .attr("height", bbox.height + 2);
      });

      // Edge labels
      edgeLabelText.each(function (d) {
        const [mx, my] = edgeMidpoint(d as SimLink & { _pairIndex: number; _pairTotal: number });
        d3.select(this).attr("x", mx).attr("y", my);
      });

      edgeLabelBg.each(function (d, i) {
        const textEl = edgeLabelText.nodes()[i];
        if (!textEl) return;
        const bbox = textEl.getBBox();
        d3.select(this)
          .attr("x", bbox.x - 3)
          .attr("y", bbox.y - 2)
          .attr("width", bbox.width + 6)
          .attr("height", bbox.height + 4);
      });
    });

    return () => {
      simulation.stop();
    };
  }, [filteredData, dimensions, selectedNode, searchQuery]);

  // When "Show Labels" is toggled ON, force labels visible (overrides zoom-adaptive)
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    if (showLabels) {
      svg.selectAll(".edge-labels").attr("visibility", "visible").attr("opacity", 1);
      svg.selectAll(".node-labels").attr("visibility", "visible").attr("opacity", 1);
    } else {
      svg.selectAll(".edge-labels").attr("visibility", "visible");
      svg.selectAll(".node-labels").attr("visibility", "visible");
      // Zoom handler will manage opacity; just ensure they're not forced hidden
    }
  }, [showLabels]);

  // Update selected edge highlight
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg
      .selectAll<SVGPathElement, SimLink>(".edges path")
      .attr("stroke", (d) => {
        if (
          selectedEdge &&
          d._originalEdge.source === selectedEdge.source &&
          d._originalEdge.target === selectedEdge.target &&
          d._originalEdge.label === selectedEdge.label
        ) {
          return getCSSVar('--color-royal-azure-400');
        }
        if (
          selectedNode &&
          ((d.source as SimNode).id === selectedNode.id ||
            (d.target as SimNode).id === selectedNode.id)
        ) {
          return getCSSVar('--color-pitch-black-400');
        }
        if (/AFFECTS|POSES_RISK|DISRUPTS|IMPACTS/i.test(d.label))
          return getCSSVar('--color-burnt-peach-400');
        return getCSSVar('--border');
      })
      .attr("opacity", (d) => {
        if (
          selectedEdge &&
          d._originalEdge.source === selectedEdge.source &&
          d._originalEdge.target === selectedEdge.target &&
          d._originalEdge.label === selectedEdge.label
        ) {
          return 0.8;
        }
        if (
          selectedNode &&
          ((d.source as SimNode).id === selectedNode.id ||
            (d.target as SimNode).id === selectedNode.id)
        ) {
          return 0.6;
        }
        return 0.15;
      })
      .attr("stroke-width", (d) => {
        if (
          selectedEdge &&
          d._originalEdge.source === selectedEdge.source &&
          d._originalEdge.target === selectedEdge.target &&
          d._originalEdge.label === selectedEdge.label
        ) {
          return 2.5;
        }
        if (
          selectedNode &&
          ((d.source as SimNode).id === selectedNode.id ||
            (d.target as SimNode).id === selectedNode.id)
        ) {
          return 1.5;
        }
        return 0.8;
      });
  }, [selectedEdge, selectedNode]);

  return (
    <div className="h-full relative" ref={containerRef}>
      <GraphToolbar
        nodes={data.nodes}
        edges={data.edges}
        activeTypes={activeTypes}
        onToggleType={handleToggleType}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        focusNodeId={focusNodeId}
        onClearFocus={() => setFocusNodeId(null)}
        edgeFilter={edgeFilter}
        onEdgeFilterChange={setEdgeFilter}
        showLabels={showLabels}
        onToggleLabels={() => setShowLabels((v) => !v)}
      />
      {(isLive || isPushing) && (
        <div className="absolute top-10 right-3 flex items-center gap-2 z-10">
          {isLive && (
            <span className="text-xs text-severity-high">● Live</span>
          )}
          {isPushing && (
            <span className="text-xs text-muted-foreground animate-pulse">Processing graph...</span>
          )}
        </div>
      )}
      <svg
        ref={svgRef}
        className="w-full"
        style={{ height: "calc(100% - 40px)" }}
      />
      <GraphLegend nodes={data.nodes} />
      {(selectedNode || selectedEdge) && (
        <GraphNodeDetail
          node={selectedNode}
          edge={selectedEdge}
          connectedEdges={connectedEdges}
          allNodes={data.nodes}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
