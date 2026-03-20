"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import type { GraphData, GraphNode, GraphEdge } from "@/app/types";
import GraphNodeDetail from "./GraphNodeDetail";

const NODE_COLORS: Record<string, string> = {
  agent: "#3b82f6",
  org: "#ff4500",
  threat: "#ef4444",
  compliance: "#a855f7",
  system: "#4ade80",
};

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
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  label: string;
  type: string;
}

export default function GraphPanel({ data, isLive, onRefresh }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  useEffect(() => {
    if (!svgRef.current || data.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    svg.selectAll("*").remove();

    const g = svg.append("g");

    // Zoom
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 3])
        .on("zoom", (event) => g.attr("transform", event.transform))
    );

    const nodes: SimNode[] = data.nodes.map((n) => ({ ...n }));
    const links: SimLink[] = data.edges.map((e) => ({
      source: e.source,
      target: e.target,
      label: e.label,
      type: e.type,
    }));

    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force("link", d3.forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2));

    // Edges
    const link = g
      .selectAll<SVGLineElement, SimLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", "#e5e5e5")
      .attr("stroke-width", 1.5);

    // Nodes
    const node = g
      .selectAll<SVGCircleElement, SimNode>("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d) => (d.type === "org" ? 18 : 12))
      .attr("fill", (d) => NODE_COLORS[d.type] || "#999")
      .attr("opacity", 0.9)
      .attr("cursor", "pointer")
      .on("click", (_, d) => {
        setSelectedNode({ id: d.id, name: d.name, type: d.type, attributes: d.attributes });
      })
      .call(
        d3.drag<SVGCircleElement, SimNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Labels
    const label = g
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

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as SimNode).x!)
        .attr("y1", (d) => (d.source as SimNode).y!)
        .attr("x2", (d) => (d.target as SimNode).x!)
        .attr("y2", (d) => (d.target as SimNode).y!);
      node.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!);
      label.attr("x", (d) => d.x!).attr("y", (d) => d.y!);
    });

    return () => {
      simulation.stop();
    };
  }, [data]);

  return (
    <div className="h-full relative">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold text-text-secondary">Knowledge Graph</span>
        <div className="flex items-center gap-2">
          {isLive && <span className="text-xs text-severity-high-text">● Updating</span>}
          <button
            onClick={onRefresh}
            className="text-xs px-2 py-0.5 border border-border rounded hover:bg-background"
          >
            Refresh
          </button>
        </div>
      </div>
      <svg ref={svgRef} className="w-full" style={{ height: "calc(100% - 70px)" }} />
      {/* Legend */}
      <div className="flex gap-3 px-3 py-1.5 text-[10px] text-text-secondary">
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
            {type}
          </span>
        ))}
      </div>
      {selectedNode && (
        <GraphNodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />
      )}
    </div>
  );
}
