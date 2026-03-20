// frontend/app/components/configure/LaunchBar.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { launchSimulation } from "@/app/actions/simulation";
import type { SimulationConfig } from "@/app/types";

export default function LaunchBar({ config }: { config: SimulationConfig }) {
  const router = useRouter();
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLaunch = async () => {
    setLaunching(true);
    setError(null);
    const result = await launchSimulation(config);
    if ("error" in result) {
      setError(result.error);
      setLaunching(false);
      return;
    }
    router.push(`/simulation/${result.data.simId}`);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-card px-6 py-3 flex items-center justify-between z-50">
      <div className="text-sm text-text-secondary">
        {config.agents.length} agents · {config.worlds.length} worlds · {config.totalRounds} rounds
      </div>
      <div className="flex items-center gap-3">
        {error && <span className="text-sm text-severity-critical-text">{error}</span>}
        <button
          onClick={handleLaunch}
          disabled={launching || config.agents.length === 0}
          className="px-6 py-2 rounded-lg bg-accent text-white font-medium text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {launching ? "Launching..." : "Launch Simulation"}
        </button>
      </div>
    </div>
  );
}
