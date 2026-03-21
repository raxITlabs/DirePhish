# Crucible Graph Enhancement Design Spec

**Goal:** Enhance the D3 graph visualization to match the original Vue GraphPanel — curved edges, edge labels, self-loops, rich detail panel, dynamic legend, and improved interactions.

**Sub-project:** 3 of 5 (Foundation ✅ → Report ✅ → **Graph Enhancement** → Sim Dashboard → History)

---

## What We're Adding

### 1. Curved Edges with Labels
- Multiple edges between same node pair render as Bezier curves (spread dynamically)
- Edge labels positioned at curve midpoints with white backgrounds
- Toggle label visibility via button
- Self-loops rendered as arc paths

### 2. Rich Detail Panel
Expand `GraphNodeDetail` into a full side panel:
- **Node details:** name, type badge, UUID (mono), summary, created_at, all attributes as key-value list
- **Edge details:** label, fact, type, source/target names, created_at, valid_at, episodes list
- **Connected edges list** when a node is selected
- **Self-loops section** with collapsible items
- Close button, smooth slide-in animation

### 3. Dynamic Legend
- Bottom-left overlay showing entity type colors + counts
- Colors derived from node types in data
- Clickable to filter (highlight) by type

### 4. Improved D3 Force Simulation
- Collision detection (`forceCollide(50)`)
- X/Y centering forces for clustering
- Dynamic link distance based on edge count
- Better click vs drag distinction (movement threshold)

### 5. Interaction Improvements
- Node hover: stroke highlight
- Edge click: selects edge, shows details
- Click empty area: deselects all
- Window resize handler
- Zoom range: 0.1x to 4x

---

## Files

### Modified Files
- `frontend/app/components/simulation/GraphPanel.tsx` — major rewrite of D3 rendering
- `frontend/app/components/simulation/GraphNodeDetail.tsx` — expand into rich detail panel
- `frontend/app/types/graph.ts` — extend types with optional fields

### New Files
- `frontend/app/components/simulation/GraphLegend.tsx` — dynamic type legend overlay

### Backend
No backend changes needed. The Graphiti `get_graph_data()` already returns node summary, edge fact/name. The graph type classification already happens server-side.

---

## Graph Types Extension

```typescript
export interface GraphNode {
  id: string;
  name: string;
  type: string;
  attributes: Record<string, unknown>;
  // New optional fields (from Graphiti when available)
  summary?: string;
  created_at?: string;
  uuid?: string;
  labels?: string[];
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
  type: string;
  // New optional fields
  fact?: string;
  uuid?: string;
  created_at?: string;
  valid_at?: string;
  episodes?: string[];
}
```

---

## D3 Implementation Details

### Force Simulation Config
```javascript
forceSimulation(nodes)
  .force("link", forceLink(edges).id(d => d.id).distance(d => dynamicDistance(d)))
  .force("charge", forceManyBody().strength(-400))
  .force("center", forceCenter(width/2, height/2))
  .force("collide", forceCollide(50))
  .force("x", forceX(width/2).strength(0.04))
  .force("y", forceY(height/2).strength(0.04))
```

### Edge Rendering
For each pair of nodes with edges between them:
1. Count total edges between pair
2. If 1 edge: straight line
3. If multiple: spread as Bezier curves with increasing curvature
4. Self-loops: arc path (circular) above the node

Edge path generation:
```javascript
// Curved edge
const dx = target.x - source.x;
const dy = target.y - source.y;
const dr = Math.sqrt(dx*dx + dy*dy);
const offset = (edgeIndex - (totalEdges-1)/2) * 40;
return `M${source.x},${source.y} Q${midX + offset*perpX},${midY + offset*perpY} ${target.x},${target.y}`;

// Self-loop
return `M${node.x},${node.y-radius} A${loopRadius},${loopRadius} 0 1,1 ${node.x+1},${node.y-radius}`;
```

### Edge Labels
- `<text>` elements positioned at edge midpoints
- White `<rect>` backgrounds behind labels
- `pointer-events: none` to avoid blocking edge clicks
- Hidden by default, toggle via button

### Node Colors (10 colors matching Vue)
```javascript
const TYPE_COLORS: Record<string, string> = {
  agent: "#3b82f6",     // blue
  org: "#f97316",       // orange (primary)
  threat: "#ef4444",    // red
  compliance: "#a855f7", // purple
  system: "#22c55e",    // green
  event: "#eab308",     // yellow
  location: "#06b6d4",  // cyan
  document: "#ec4899",  // pink
  process: "#8b5cf6",   // violet
  default: "#6b7280",   // gray
};
```

### Click vs Drag
Track mouse movement during drag. If total movement < 5px, treat as click (selection). Otherwise, drag.

---

## Detail Panel Layout

```
┌─ Node Detail ─────────────────────┐
│ [X] Close                         │
│                                   │
│ ● Sarah Chen          [agent]     │
│                                   │
│ UUID: abc123...         (mono)    │
│ Created: 2024-03-20     (mono)    │
│                                   │
│ Summary:                          │
│ SOC Lead responsible for...       │
│                                   │
│ Attributes:                       │
│ ├ role: SOC Lead                  │
│ ├ department: Security            │
│ └ skills: incident response...    │
│                                   │
│ Connected Edges (3):              │
│ ├ → reports_to → Mike Torres      │
│ ├ → manages → SOC Team            │
│ └ → responds_to → Ransomware      │
└───────────────────────────────────┘
```

For edge selection:
```
┌─ Edge Detail ─────────────────────┐
│ [X] Close                         │
│                                   │
│ reports_to              [edge]    │
│ Sarah Chen → Mike Torres          │
│                                   │
│ Fact:                             │
│ Sarah reports directly to Mike... │
│                                   │
│ Type: RELATES_TO                  │
│ Created: 2024-03-20     (mono)    │
│ Valid: 2024-03-20        (mono)   │
└───────────────────────────────────┘
```

---

## Success Criteria

1. Edges render as curves when multiple exist between same node pair
2. Self-loops render as arcs above the node
3. Edge labels toggle on/off
4. Clicking a node shows full detail panel (name, type, UUID, summary, attributes, connected edges)
5. Clicking an edge shows edge detail (label, fact, type, timestamps)
6. Dynamic legend shows all entity types with counts
7. Force simulation uses collision detection
8. Click vs drag works correctly
9. `pnpm build` succeeds
