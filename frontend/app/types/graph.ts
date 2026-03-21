export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  attributes: Record<string, unknown>;
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
  fact?: string;
  uuid?: string;
  created_at?: string;
  valid_at?: string;
  episodes?: string[];
}
