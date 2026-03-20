// frontend/app/components/configure/AgentCards.tsx
import type { AgentConfig } from "@/app/types";

export default function AgentCards({ agents }: { agents: AgentConfig[] }) {
  if (agents.length === 0) {
    return <p className="text-text-secondary text-sm">No agents configured. Add agents before launching.</p>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {agents.map((agent, i) => (
        <div key={i} className="border border-border rounded-lg bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-md bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
              {agent.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </div>
            <div>
              <div className="text-sm font-semibold">{agent.name}</div>
              <div className="text-xs text-text-secondary font-mono">{agent.role}</div>
            </div>
          </div>
          <p className="text-xs text-text-secondary line-clamp-3">{agent.persona}</p>
        </div>
      ))}
    </div>
  );
}
