"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { SimulationSummary } from "@/app/types";

interface AppSidebarProps {
  simulations: SimulationSummary[];
}

function getSimHref(sim: SimulationSummary) {
  return sim.status === "completed" ? `/report/${sim.simId}` : `/simulation/${sim.simId}`;
}

function isRunning(status: string) {
  return status === "running" || status === "starting";
}

export default function AppSidebar({ simulations }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`absolute top-0 left-0 h-full p-2 z-20 hidden md:flex flex-col transition-[width] duration-200 ease-in-out ${
        collapsed ? "w-12" : "w-[17rem]"
      }`}
    >
      <div className="bg-sidebar rounded-xl border border-sidebar-border flex-1 overflow-hidden flex flex-col">
        {/* Sidebar content */}
        {!collapsed && (
          <div className="flex-1 overflow-y-auto p-2">
            {simulations.length > 0 ? (
              <nav className="space-y-6">
                <div>
                  <h3 className="font-mono uppercase text-[10.5px] tracking-widest text-sidebar-foreground/50 px-3 mb-2">
                    Recent
                  </h3>
                  <ul className="space-y-0.5">
                    {simulations.slice(0, 3).map((sim, index) => (
                      <li key={sim.simId}>
                        <a
                          href={getSimHref(sim)}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                            isRunning(sim.status)
                              ? "text-sidebar-primary bg-sidebar-accent font-medium"
                              : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                          }`}
                        >
                          <span className="text-[13px]">
                            {isRunning(sim.status) ? "◉" : sim.status === "completed" ? "✓" : "○"}
                          </span>
                          <span className="font-mono text-sm tracking-tight">
                            Run {index + 1}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>

                {simulations.length > 3 && (
                  <div>
                    <h3 className="font-mono uppercase text-[10.5px] tracking-widest text-sidebar-foreground/50 px-3 mb-2">
                      Past Runs
                    </h3>
                    <ul className="space-y-0.5">
                      {simulations.slice(3, 8).map((sim, index) => (
                        <li key={sim.simId}>
                          <a
                            href={getSimHref(sim)}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                          >
                            <span className="text-[13px]">○</span>
                            <span className="font-mono text-sm tracking-tight">
                              Run {index + 4}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </nav>
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-sidebar-foreground/50 font-mono">
                  No runs yet
                </p>
                <p className="text-xs text-sidebar-foreground/30 font-mono mt-1">
                  Start an analysis to see history here
                </p>
              </div>
            )}
          </div>
        )}

        {/* Collapse/expand toggle at the bottom */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="shrink-0 flex items-center justify-center py-2 border-t border-sidebar-border text-sidebar-foreground/30 hover:text-sidebar-foreground/60 transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
        </button>
      </div>
    </aside>
  );
}
