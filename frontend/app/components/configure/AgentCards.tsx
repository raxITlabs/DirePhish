// frontend/app/components/configure/AgentCards.tsx
import type { AgentConfig } from "@/app/types";
import { Card, CardContent } from "@/app/components/ui/card";

export default function AgentCards({ agents }: { agents: AgentConfig[] }) {
  if (agents.length === 0) {
    return <p className="text-muted-foreground text-sm">No agents configured. Add agents before launching.</p>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {agents.map((agent, i) => (
        <Card key={i} size="sm">
          <CardContent>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                {agent.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </div>
              <div>
                <div className="text-sm font-semibold">{agent.name}</div>
                <div className="text-xs text-muted-foreground font-mono">{agent.role}</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-3">{agent.persona}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
