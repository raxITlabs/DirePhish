import type { AgentScore } from "@/app/types";
import AgentScorecard from "./AgentScorecard";

export default function AgentScoreGrid({ scores }: { scores: AgentScore[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {scores.map((s, i) => (
        <AgentScorecard key={i} score={s} />
      ))}
    </div>
  );
}
