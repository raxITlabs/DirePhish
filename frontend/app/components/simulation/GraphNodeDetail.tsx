"use client";

import type { GraphNode, GraphEdge } from "@/app/types";
import { Card, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Separator } from "@/app/components/ui/separator";

interface GraphNodeDetailProps {
  node: GraphNode | null;
  edge: GraphEdge | null;
  connectedEdges: GraphEdge[];
  allNodes: GraphNode[];
  onClose: () => void;
}

function findNodeName(id: string, allNodes: GraphNode[]): string {
  return allNodes.find((n) => n.id === id)?.name ?? id;
}

function NodeView({
  node,
  connectedEdges,
  allNodes,
}: {
  node: GraphNode;
  connectedEdges: GraphEdge[];
  allNodes: GraphNode[];
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-semibold">{node.name}</div>
        <Badge variant="secondary" className="text-[10px] mt-1">
          {node.type}
        </Badge>
      </div>

      {node.uuid && (
        <div className="text-[11px] text-muted-foreground">
          <span className="font-medium">UUID:</span>{" "}
          <span className="font-mono text-[10px]">{node.uuid}</span>
        </div>
      )}

      {node.created_at && (
        <div className="text-[11px] text-muted-foreground">
          <span className="font-medium">Created:</span>{" "}
          <span className="font-mono text-[10px]">{node.created_at}</span>
        </div>
      )}

      {node.summary && (
        <>
          <Separator />
          <div>
            <div className="text-[11px] font-medium text-muted-foreground mb-1">
              Summary
            </div>
            <p className="text-xs text-foreground leading-relaxed">
              {node.summary}
            </p>
          </div>
        </>
      )}

      {Object.keys(node.attributes).length > 0 && (
        <>
          <Separator />
          <div>
            <div className="text-[11px] font-medium text-muted-foreground mb-1">
              Attributes
            </div>
            <div className="space-y-0.5">
              {Object.entries(node.attributes).map(([k, v]) => (
                <div key={k} className="text-[11px] text-muted-foreground">
                  <span className="font-medium">{k}:</span>{" "}
                  <span>{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {connectedEdges.length > 0 && (
        <>
          <Separator />
          <div>
            <div className="text-[11px] font-medium text-muted-foreground mb-1">
              Connected Edges ({connectedEdges.length})
            </div>
            <div className="space-y-0.5">
              {connectedEdges.map((e, i) => {
                const isSource = e.source === node.id;
                const otherName = isSource
                  ? findNodeName(e.target, allNodes)
                  : findNodeName(e.source, allNodes);
                return (
                  <div
                    key={`${e.source}-${e.target}-${e.label}-${i}`}
                    className="text-[11px] text-muted-foreground"
                  >
                    {isSource ? (
                      <>
                        → {e.label} → {otherName}
                      </>
                    ) : (
                      <>
                        {otherName} → {e.label} →
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EdgeView({
  edge,
  allNodes,
}: {
  edge: GraphEdge;
  allNodes: GraphNode[];
}) {
  const sourceName = findNodeName(edge.source, allNodes);
  const targetName = findNodeName(edge.target, allNodes);

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-semibold">{edge.label}</div>
        <Badge variant="secondary" className="text-[10px] mt-1">
          edge
        </Badge>
      </div>

      <div className="text-xs text-foreground">
        {sourceName} → {targetName}
      </div>

      {edge.fact && (
        <>
          <Separator />
          <div>
            <div className="text-[11px] font-medium text-muted-foreground mb-1">
              Fact
            </div>
            <p className="text-xs text-foreground leading-relaxed">
              {edge.fact}
            </p>
          </div>
        </>
      )}

      <Separator />
      <div className="space-y-0.5 text-[11px] text-muted-foreground">
        <div>
          <span className="font-medium">Type:</span> {edge.type}
        </div>
        {edge.uuid && (
          <div>
            <span className="font-medium">UUID:</span>{" "}
            <span className="font-mono text-[10px]">{edge.uuid}</span>
          </div>
        )}
        {edge.created_at && (
          <div>
            <span className="font-medium">Created:</span>{" "}
            <span className="font-mono text-[10px]">{edge.created_at}</span>
          </div>
        )}
        {edge.valid_at && (
          <div>
            <span className="font-medium">Valid:</span>{" "}
            <span className="font-mono text-[10px]">{edge.valid_at}</span>
          </div>
        )}
      </div>

      {edge.episodes && edge.episodes.length > 0 && (
        <>
          <Separator />
          <div>
            <div className="text-[11px] font-medium text-muted-foreground mb-1">
              Episodes ({edge.episodes.length})
            </div>
            <div className="space-y-0.5">
              {edge.episodes.map((ep, i) => (
                <div
                  key={i}
                  className="text-[10px] font-mono text-muted-foreground truncate"
                >
                  {ep}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function GraphNodeDetail({
  node,
  edge,
  connectedEdges,
  allNodes,
  onClose,
}: GraphNodeDetailProps) {
  return (
    <Card className="absolute right-3 top-12 z-10 max-w-xs w-72 max-h-[calc(100%-60px)] overflow-y-auto shadow-lg">
      <CardContent>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {node ? "Node Detail" : "Edge Detail"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close"
            className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground text-xs"
          >
            ✕
          </Button>
        </div>

        {node && (
          <NodeView
            node={node}
            connectedEdges={connectedEdges}
            allNodes={allNodes}
          />
        )}

        {edge && !node && <EdgeView edge={edge} allNodes={allNodes} />}
      </CardContent>
    </Card>
  );
}
