"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import type { GraphData, GraphNode, GraphEdge } from "@/app/types";
import { Button } from "@/app/components/ui/button";
import GraphNodeDetail from "./GraphNodeDetail";
import GraphLegend, { TYPE_COLORS } from "./GraphLegend";

interface Props {
  data: GraphData;
  isLive: boolean;
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

/** Build edge key for grouping parallel edges */
function edgePairKey(source: string, target: string): string {
  return [source, target].sort().join("||");
}

export default function GraphPanel({ data, isLive, onRefresh }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

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
    if (!svgRef.current || data.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    const { width, height } = dimensions;

    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height);

    const g = svg.append("g");

    // Zoom
    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => g.attr("transform", event.transform))
    );

    // Click on background to deselect
    svg.on("click", (event) => {
      if (event.target === svgRef.current) {
        setSelectedNode(null);
        setSelectedEdge(null);
      }
    });

    const nodes: SimNode[] = data.nodes.map((n) => ({ ...n }));
    const links: SimLink[] = data.edges.map((e) => ({
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
      .force("collide", d3.forceCollide(50))
      .force("x", d3.forceX(width / 2).strength(0.04))
      .force("y", d3.forceY(height / 2).strength(0.04));

    // Edge paths
    const edgeGroup = g.append("g").attr("class", "edges");
    const edgePaths = edgeGroup
      .selectAll<SVGPathElement, SimLink>("path")
      .data(links)
      .join("path")
      .attr("fill", "none")
      .attr("stroke", "#d4d4d4")
      .attr("stroke-width", 1.5)
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
      .attr("fill", "white")
      .attr("rx", 2)
      .attr("opacity", 0.9)
      .attr("pointer-events", "none");

    const edgeLabelText = edgeLabelGroup
      .selectAll<SVGTextElement, SimLink>("text")
      .data(links)
      .join("text")
      .text((d) => d.label)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("fill", "#737373")
      .attr("font-size", 8)
      .attr("pointer-events", "none");

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
        d3.select(this).attr("stroke", "#f97316");
      })
      .on("mouseout", function (_, d) {
        const isSelected = selectedNode && (d as SimNode).id === selectedNode.id;
        d3.select(this).attr("stroke", isSelected ? "#f97316" : "transparent");
      });

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

    // Node labels
    const nodeLabels = g
      .append("g")
      .attr("class", "node-labels")
      .selectAll<SVGTextElement, SimNode>("text")
      .data(nodes)
      .join("text")
      .text((d) => d.name)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => (d.type === "org" ? 4 : 3))
      .attr("fill", "white")
      .attr("font-size", (d) => (d.type === "org" ? 7 : 6))
      .attr("font-weight", 600)
      .attr("pointer-events", "none");

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

      // Single edge: straight line
      if (pairTotal === 1) {
        return `M${sx},${sy} L${tx},${ty}`;
      }

      // Multiple edges: Bezier curves
      const dx = tx - sx;
      const dy = ty - sy;
      const dr = Math.sqrt(dx * dx + dy * dy) || 1;
      const perpX = -dy / dr;
      const perpY = dx / dr;
      const offset = (pairIndex - (pairTotal - 1) / 2) * 40;
      const mx = (sx + tx) / 2;
      const my = (sy + ty) / 2;

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

      if (pairTotal === 1) return [mx, my];

      const offset = (pairIndex - (pairTotal - 1) / 2) * 40;
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
      nodeLabels.attr("x", (d) => d.x!).attr("y", (d) => d.y!);

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
          .attr("x", bbox.x - 2)
          .attr("y", bbox.y - 1)
          .attr("width", bbox.width + 4)
          .attr("height", bbox.height + 2);
      });
    });

    return () => {
      simulation.stop();
    };
  }, [data, dimensions, selectedNode]);

  // Update edge label visibility separately to avoid full re-render
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll(".edge-labels").attr("visibility", showLabels ? "visible" : "hidden");
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
          return "#f97316";
        }
        if (
          selectedNode &&
          ((d.source as SimNode).id === selectedNode.id ||
            (d.target as SimNode).id === selectedNode.id)
        ) {
          return "#a3a3a3";
        }
        return "#d4d4d4";
      })
      .attr("stroke-width", (d) => {
        if (
          selectedEdge &&
          d._originalEdge.source === selectedEdge.source &&
          d._originalEdge.target === selectedEdge.target &&
          d._originalEdge.label === selectedEdge.label
        ) {
          return 3;
        }
        return 1.5;
      });
  }, [selectedEdge, selectedNode]);

  return (
    <div className="h-full relative" ref={containerRef}>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold text-muted-foreground">
          Knowledge Graph
        </span>
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="text-xs text-severity-high">● Updating</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLabels((v) => !v)}
            className="h-6 text-xs"
          >
            {showLabels ? "Hide Labels" : "Show Labels"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="h-6 text-xs"
          >
            Refresh
          </Button>
        </div>
      </div>
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
