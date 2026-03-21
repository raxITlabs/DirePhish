import { listSimulations } from "@/app/actions/simulation";
import SimulationCard from "./SimulationCard";

export default async function SimulationHistory() {
  const result = await listSimulations();
  const simulations = "data" in result ? result.data : [];

  if (simulations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No simulations yet. Run a preset or research a company to get started.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {simulations.map((sim) => (
        <SimulationCard key={sim.simId} simulation={sim} />
      ))}
    </div>
  );
}
