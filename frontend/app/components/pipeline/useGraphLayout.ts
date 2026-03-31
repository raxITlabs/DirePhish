"use client";

import { useMemo, useRef } from "react";
import * as d3 from "d3";
import type { Node, Edge } from "@xyflow/react";
import type { GraphData, GraphNode, GraphEdge } from "@/app/types";
import type { GraphEntityData } from "./nodes/GraphEntityNode";

/**
 * Type-clustered zone map — each entity type is pulled toward a spatial zone.
 * Zones arranged so related types are adjacent:
 *
 *        [threat]          [event]
 *           top-left          top-right
 *
 *   [person]     [organization]     [system]
 *     left          center            right
 *
 *        [compliance]      [vendor]
 *          bottom-left       bottom-right
 *
 *              [network_zone]
 *                 bottom
 */
const TYPE_ZONES: Record<string, { x: number; y: number }> = {
  person:       { x: -1,   y: 0 },
  organization: { x: 0,    y: 0 },
  system:       { x: 1,    y: 0 },
  threat:       { x: -0.6, y: -1 },
  event:        { x: 0.6,  y: -1 },
  compliance:   { x: -0.6, y: 1 },
  vendor:       { x: 0.6,  y: 1 },
  network_zone: { x: 0,    y: 1.2 },
};

const DEFAULT_ZONE = { x: 0, y: 0 };

/**
 * Pure layout computation — builds initial React Flow nodes/edges from graph data.
 * Runs d3-force synchronously with type-based clustering to create structured zones.
 * NO live simulation, NO drag handlers — those are in useForceLayout.ts.
 */
export function useGraphLayout(graphData: GraphData, isSimRunning = false, activeNodeIds: Set<string> = new Set(), newNodeIds: Set<string> = new Set()) {
  const prevPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  return useMemo(() => {
    const apiNodes = graphData.nodes;
    const apiEdges = graphData.edges;

    if (apiNodes.length === 0) {
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }

    const prevPositions = prevPositionsRef.current;

    // Scale spacing with graph size — more nodes = wider spread
    const nodeCount = apiNodes.length;
    const spread = Math.max(400, Math.sqrt(nodeCount) * 80);

    // Build simulation nodes with preserved/random positions
    interface SimNode extends d3.SimulationNodeDatum {
      id: string;
      entityType: string;
    }

    const simNodes: SimNode[] = apiNodes.map((n) => {
      const prev = prevPositions.get(n.id);
      const zone = TYPE_ZONES[n.type] || DEFAULT_ZONE;
      return {
        id: n.id,
        entityType: n.type,
        // Seed near zone center if no previous position
        x: prev?.x ?? zone.x * spread + (Math.random() - 0.5) * spread * 0.4,
        y: prev?.y ?? zone.y * spread + (Math.random() - 0.5) * spread * 0.4,
      };
    });

    const validNodeIds = new Set(apiNodes.map((n) => n.id));
    const simLinks = apiEdges
      .filter((e) => validNodeIds.has(e.source) && validNodeIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }));

    // Cluster pull strength — strong enough to group, weak enough for edges to pull across
    const clusterStrength = 0.15;

    // Run to equilibrium synchronously — just for initial positions
    const sim = d3
      .forceSimulation<SimNode>(simNodes)
      .force("link", d3.forceLink(simLinks).id((d: any) => d.id).distance(120).strength(0.3))
      .force("charge", d3.forceManyBody<SimNode>().strength((d) => {
        if (d.entityType === "threat") return -500;
        if (d.entityType === "organization") return -400;
        return -300;
      }))
      .force("center", d3.forceCenter(0, 0).strength(0.05))
      .force("collide", d3.forceCollide(55))
      // Type-based clustering — pull each node toward its zone
      .force("clusterX", d3.forceX<SimNode>((d) => {
        const zone = TYPE_ZONES[d.entityType] || DEFAULT_ZONE;
        return zone.x * spread;
      }).strength(clusterStrength))
      .force("clusterY", d3.forceY<SimNode>((d) => {
        const zone = TYPE_ZONES[d.entityType] || DEFAULT_ZONE;
        return zone.y * spread;
      }).strength(clusterStrength))
      .stop();

    const iterations = Math.min(300, nodeCount * 10);
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
        isActive: activeNodeIds.has(gn.id),
        isNew: newNodeIds.has(gn.id),
      };
      const typeLabel = gn.type.replace(/_/g, " ");
      return {
        id: gn.id,
        type: "graphEntity",
        position: { x: sn?.x || 0, y: sn?.y || 0 },
        data: data as unknown as Record<string, unknown>,
        ariaLabel: `${typeLabel}: ${gn.name}${gn.summary ? ` — ${gn.summary}` : ""}`,
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
          isActive: activeNodeIds.has(ge.source) && activeNodeIds.has(ge.target),
          siblingIndex,
          siblingCount,
          isHighlighted: false,
          isDimmed: false,
          showLabel: false,
        },
      };
    });

    return { nodes: flowNodes, edges: flowEdges };
  }, [graphData, isSimRunning, activeNodeIds, newNodeIds]);
}
