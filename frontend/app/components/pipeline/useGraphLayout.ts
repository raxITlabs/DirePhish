"use client";

import { useMemo, useRef } from "react";
import * as d3 from "d3";
import type { Node, Edge } from "@xyflow/react";
import type { GraphData, GraphNode, GraphEdge } from "@/app/types";
import type { GraphEntityData } from "./nodes/GraphEntityNode";

/**
 * Pure layout computation — builds initial React Flow nodes/edges from graph data.
 * Runs d3-force synchronously to compute initial positions.
 * NO live simulation, NO drag handlers — those are in useForceLayout.ts.
 */
export function useGraphLayout(graphData: GraphData, isSimRunning = false) {
  const prevPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  return useMemo(() => {
    const apiNodes = graphData.nodes;
    const apiEdges = graphData.edges;

    if (apiNodes.length === 0) {
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }

    const prevPositions = prevPositionsRef.current;

    // Build simulation nodes with preserved/random positions
    interface SimNode extends d3.SimulationNodeDatum {
      id: string;
      entityType: string;
    }

    const simNodes: SimNode[] = apiNodes.map((n) => {
      const prev = prevPositions.get(n.id);
      return {
        id: n.id,
        entityType: n.type,
        x: prev?.x ?? (Math.random() - 0.5) * 600,
        y: prev?.y ?? (Math.random() - 0.5) * 600,
      };
    });

    const validNodeIds = new Set(apiNodes.map((n) => n.id));
    const simLinks = apiEdges
      .filter((e) => validNodeIds.has(e.source) && validNodeIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }));

    // Run to equilibrium synchronously — just for initial positions
    const sim = d3
      .forceSimulation<SimNode>(simNodes)
      .force("link", d3.forceLink(simLinks).id((d: any) => d.id).distance(150))
      .force("charge", d3.forceManyBody<SimNode>().strength((d) => {
        if (d.entityType === "threat") return -600;
        if (d.entityType === "org") return -500;
        return -350;
      }))
      .force("center", d3.forceCenter(0, 0))
      .force("collide", d3.forceCollide(70))
      .force("x", d3.forceX(0).strength(0.02))
      .force("y", d3.forceY(0).strength(0.02))
      .stop();

    const iterations = Math.min(300, apiNodes.length * 10);
    for (let i = 0; i < iterations; i++) sim.tick();

    // Save positions for next rebuild
    const newPositions = new Map<string, { x: number; y: number }>();
    for (const sn of simNodes) {
      if (sn.x != null && sn.y != null) {
        newPositions.set(sn.id, { x: sn.x, y: sn.y });
      }
    }
    prevPositionsRef.current = newPositions;

    // Build React Flow nodes
    const flowNodes: Node[] = apiNodes.map((gn: GraphNode) => {
      const sn = simNodes.find((n) => n.id === gn.id);
      const data: GraphEntityData = {
        name: gn.name,
        entityType: gn.type,
        attributes: gn.attributes,
        summary: gn.summary,
        isSimRunning,
      };
      return {
        id: gn.id,
        type: "graphEntity",
        position: { x: sn?.x || 0, y: sn?.y || 0 },
        data: data as unknown as Record<string, unknown>,
      };
    });

    // Build edges with parallel pair detection
    const validEdges = apiEdges.filter(
      (e) => validNodeIds.has(e.source) && validNodeIds.has(e.target),
    );
    const pairMap = new Map<string, number>();
    for (const ge of validEdges) {
      const key = [ge.source, ge.target].sort().join("__");
      pairMap.set(key, (pairMap.get(key) || 0) + 1);
    }
    const pairCounter = new Map<string, number>();

    const flowEdges: Edge[] = validEdges.map((ge: GraphEdge, i: number) => {
      const key = [ge.source, ge.target].sort().join("__");
      const siblingCount = pairMap.get(key) || 1;
      const siblingIndex = pairCounter.get(key) || 0;
      pairCounter.set(key, siblingIndex + 1);

      return {
        id: ge.uuid || `e-${ge.source}-${ge.target}-${i}`,
        source: ge.source,
        target: ge.target,
        type: "knowledge",
        data: {
          label: ge.label,
          isAction: ge.type === "action",
          isSimRunning,
          siblingIndex,
          siblingCount,
          isHighlighted: false,
          isDimmed: false,
          showLabel: false,
        },
      };
    });

    return { nodes: flowNodes, edges: flowEdges };
  }, [graphData, isSimRunning]);
}
