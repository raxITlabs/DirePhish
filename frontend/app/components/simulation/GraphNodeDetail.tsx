import type { GraphNode } from "@/app/types";

interface Props {
  node: GraphNode;
  onClose: () => void;
}

export default function GraphNodeDetail({ node, onClose }: Props) {
  return (
    <div className="absolute bottom-3 right-3 bg-card border border-border rounded-lg p-3 shadow-lg w-48 z-10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">{node.name}</span>
        <button onClick={onClose} className="text-text-tertiary hover:text-foreground text-xs">
          ✕
        </button>
      </div>
      <div className="text-xs space-y-1 text-text-secondary">
        <div>Type: {node.type}</div>
        {Object.entries(node.attributes).map(([k, v]) => (
          <div key={k}>
            {k}: {String(v)}
          </div>
        ))}
      </div>
    </div>
  );
}
