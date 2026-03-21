import type { AgentAction } from "@/app/types";
import { Badge } from "@/app/components/ui/badge";

interface Props {
  actions: AgentAction[];
}

interface AgentStats {
  name: string;
  role: string;
  count: number;
  lastRound: number;
}

export default function AgentSummary({ actions }: Props) {
  const agentMap = new Map<string, AgentStats>();

  for (const action of actions) {
    const existing = agentMap.get(action.agent);
    if (existing) {
      existing.count++;
      existing.lastRound = Math.max(existing.lastRound, action.round);
    } else {
      agentMap.set(action.agent, {
        name: action.agent,
        role: action.role,
        count: 1,
        lastRound: action.round,
      });
    }
  }

  const agents = Array.from(agentMap.values()).sort(
    (a, b) => b.count - a.count
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      {agents.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-8">
          No agent activity yet...
        </p>
      )}
      {agents.map((agent) => (
        <div
          key={agent.name}
          className="flex items-center justify-between py-2 px-3 rounded-md border border-border"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{agent.name}</span>
            <Badge variant="secondary" className="text-[10px]">
              {agent.role}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono">{agent.count}</span>
            <span className="text-xs text-muted-foreground">
              last R{agent.lastRound}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
