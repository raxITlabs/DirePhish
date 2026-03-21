import type { GraphNode } from "@/app/types";
import { Card } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";

interface Props {
  node: GraphNode;
  onClose: () => void;
}

export default function GraphNodeDetail({ node, onClose }: Props) {
  return (
    <Card className="absolute bottom-3 right-3 p-3 shadow-lg w-48 z-10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">{node.name}</span>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground text-xs">
          ✕
        </Button>
      </div>
      <div className="text-xs space-y-1 text-muted-foreground">
        <div>Type: <Badge variant="secondary" className="text-[10px]">{node.type}</Badge></div>
        {Object.entries(node.attributes).map(([k, v]) => (
          <div key={k}>
            {k}: {String(v)}
          </div>
        ))}
      </div>
    </Card>
  );
}
