export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  attributes: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
  type: string;
}
