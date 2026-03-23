"use client";

import { useEffect, useRef, useMemo } from "react";
import {
  useReactFlow,
  useNodesInitialized,
  type Node,
} from "@xyflow/react";
import * as d3 from "d3";

// ──────────────────────────────────────────────────────────────
// Interactive force-directed layout for React Flow using d3-force.
//
// Based on the official xyflow d3-force integration pattern:
//   Source: https://github.com/xyflow/web/tree/main/apps/example-apps/react/learn/layouting-flow-4-d3-force
//   Docs:   https://reactflow.dev/learn/layouting/layouting
//   Pro:    https://reactflow.dev/examples/layout/force-layout
//
// Force values matched to Vue GraphPanel.vue for consistent feel:
//   charge: -400, collide: 50, centering: 0.04, link distance: 120
//   3px drag threshold before simulation heats (prevents click jiggle)
// ──────────────────────────────────────────────────────────────
const simulation = d3
  .forceSimulation()
  .force("charge", d3.forceManyBody().strength(-400))
  .force("collide", d3.forceCollide().radius(50))
  .force("x", d3.forceX().x(0).strength(0.04))
  .force("y", d3.forceY().y(0).strength(0.04))
  .alphaTarget(0)
  .alphaMin(0.001)
  .alphaDecay(0.0228) // d3 default
  .stop();

export function useForceLayout() {
  const { getNodes, setNodes, getEdges } = useReactFlow();
  const initialized = useNodesInitialized();
  const draggingNodeRef = useRef<Node | null>(null);
  const animationFrameRef = useRef<number>(0);

  // Store in refs to avoid effect re-runs when React Flow recreates these
  const getNodesRef = useRef(getNodes);
  const setNodesRef = useRef(setNodes);
  const getEdgesRef = useRef(getEdges);
  getNodesRef.current = getNodes;
  setNodesRef.current = setNodes;
  getEdgesRef.current = getEdges;

  // Drag handlers with 3px threshold (matches Vue GraphPanel behavior)
  const dragEvents = useMemo(() => {
    let dragStartPos: { x: number; y: number } | null = null;
    let isDragging = false;

    return {
      onNodeDragStart: (_: unknown, node: Node) => {
        dragStartPos = { x: node.position.x, y: node.position.y };
        isDragging = false;
        draggingNodeRef.current = node;
        // DON'T restart simulation yet — wait for 3px movement
      },
      onNodeDrag: (_: unknown, node: Node) => {
        draggingNodeRef.current = node;

        // Only heat simulation after 3px of actual movement
        if (!isDragging && dragStartPos) {
          const dx = node.position.x - dragStartPos.x;
          const dy = node.position.y - dragStartPos.y;
          if (Math.sqrt(dx * dx + dy * dy) > 3) {
            isDragging = true;
            simulation.alphaTarget(0.3).restart();
          }
        }
      },
      onNodeDragStop: () => {
        draggingNodeRef.current = null;
        dragStartPos = null;
        if (isDragging) {
          simulation.alphaTarget(0);
        }
        isDragging = false;
      },
    };
  }, []);

  useEffect(() => {
    if (!initialized) return;

    const nodes = getNodesRef.current();
    const edges = getEdgesRef.current();

    if (nodes.length === 0) return;

    // Feed nodes/edges into singleton simulation
    simulation.nodes(nodes as any);
    simulation.force(
      "link",
      d3
        .forceLink(edges as any)
        .id((d: any) => d.id)
        .distance(120)
        .strength(0.5),
    );

    // Flat charge — Vue uses -400 for all types
    simulation.force("charge", d3.forceManyBody().strength(-400));

    // rAF tick loop
    function tick() {
      const alpha = simulation.alpha();

      // Skip when settled — even during drag, if alpha is zero
      // the forces have nothing to compute (dragged node position
      // is already handled by React Flow internally)
      if (alpha < 0.005) {
        animationFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      const currentNodes = getNodesRef.current();
      simulation.tick();

      const nextNodes = currentNodes.map((node) => {
        const simNode = node as any;

        if (draggingNodeRef.current?.id === node.id) {
          const dragPos = draggingNodeRef.current.position;
          simNode.fx = dragPos.x;
          simNode.fy = dragPos.y;
        } else {
          delete simNode.fx;
          delete simNode.fy;
        }

        return {
          ...node,
          position: {
            x: simNode.x ?? node.position.x,
            y: simNode.y ?? node.position.y,
          },
        };
      });

      setNodesRef.current(nextNodes);
      animationFrameRef.current = requestAnimationFrame(tick);
    }

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [initialized]);

  return dragEvents;
}
