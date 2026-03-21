"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { SimulationSummary } from "@/app/types";

interface HomeClientProps {
  simulations: SimulationSummary[];
}

export default function HomeClient({ simulations }: HomeClientProps) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [context, setContext] = useState("");
  const [showContext, setShowContext] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyUrl: url.trim(),
          userContext: context.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
        setLoading(false);
        return;
      }
      router.push(`/pipeline/${json.data.runId}`);
    } catch {
      setError("Failed to start pipeline");
      setLoading(false);
    }
  }, [url, context, router]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(pdf|md|txt)$/i.test(f.name)
    );
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && url.trim()) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, url]
  );

  const getSimHref = (sim: SimulationSummary) =>
    sim.status === "completed" ? `/report/${sim.simId}` : `/simulation/${sim.simId}`;

  const isRunning = (status: string) => status === "running" || status === "starting";

  return (
    <div className="dark h-screen flex bg-background text-foreground overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-[240px] shrink-0 bg-sidebar border-r border-sidebar-border/10 flex-col py-8 px-4 hidden md:flex">
        <div className="px-3 mb-12">
          <h1 className="font-mono text-xl font-bold text-primary tracking-tighter">
            DirePhish
          </h1>
          <p className="font-mono text-[10.5px] tracking-widest text-secondary/40">
            by raxIT Labs
          </p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto">
          {simulations.length > 0 && (
            <div>
              <h3 className="font-mono uppercase text-[10.5px] tracking-widest text-secondary/30 px-3 mb-4">
                Recent
              </h3>
              <ul className="space-y-1">
                {simulations.slice(0, 3).map((sim) => (
                  <li key={sim.simId}>
                    <a
                      href={getSimHref(sim)}
                      className={`flex items-center gap-3 px-3 py-2 text-sm transition-all duration-150 ${
                        isRunning(sim.status)
                          ? "text-primary bg-primary/5 font-medium border-r-2 border-primary"
                          : "text-secondary/50 hover:opacity-100 hover:text-primary"
                      }`}
                    >
                      <span className="text-[13px]">
                        {isRunning(sim.status) ? "◉" : sim.status === "completed" ? "✓" : "○"}
                      </span>
                      <span className="font-mono text-sm tracking-tight truncate">
                        {sim.simId.slice(0, 14)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {simulations.length > 3 && (
            <div className="mt-10">
              <h3 className="font-mono uppercase text-[10.5px] tracking-widest text-secondary/30 px-3 mb-4">
                Past Runs
              </h3>
              <ul className="space-y-1">
                {simulations.slice(3, 6).map((sim) => (
                  <li key={sim.simId}>
                    <a
                      href={getSimHref(sim)}
                      className="flex items-center gap-3 px-3 py-2 text-secondary/50 hover:opacity-100 hover:text-primary transition-all duration-200 text-sm"
                    >
                      <span className="text-[13px]">○</span>
                      <span className="font-mono text-sm tracking-tight truncate">
                        {sim.simId.slice(0, 14)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 min-h-screen flex flex-col items-center justify-center px-6 md:px-12 relative overflow-hidden">
        {/* Ambient background blurs */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-full pointer-events-none opacity-20">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-[120px]" />
        </div>

        {/* Subtle grid overlay */}
        <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none">
          <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            <defs>
              <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="w-full max-w-3xl z-10 space-y-16">
          {/* Hero messaging */}
          <div className="space-y-4 text-center">
            <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-foreground">
              Secure your next move.
            </h2>
            <p className="text-muted-foreground/60 text-lg md:text-xl font-light tracking-wide max-w-xl mx-auto">
              A calm, clinical approach to digital threat intelligence and adversary simulation.
            </p>
          </div>

          {/* Analyzer interface */}
          <div className="space-y-8">
            {/* Pill-shaped URL input */}
            <div className="bg-card/60 backdrop-blur-xl p-2 pl-6 rounded-full flex items-center group transition-all duration-300 ring-1 ring-border/15 hover:ring-border/30 focus-within:ring-primary/40">
              <span className="text-muted-foreground/40 group-focus-within:text-primary transition-colors text-sm">
                🔗
              </span>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter a company URL"
                className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-xl font-mono px-4 text-foreground placeholder:text-muted-foreground/30"
              />
              <button
                onClick={handleSubmit}
                disabled={!url.trim() || loading}
                className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground px-8 py-4 rounded-full font-mono font-bold text-sm tracking-widest uppercase hover:opacity-90 transition-opacity active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {loading ? "Starting..." : "Start Analysis"}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive font-mono text-center">
                {error}
              </div>
            )}

            {/* Secondary options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              {/* Context toggle/input */}
              {!showContext ? (
                <button
                  onClick={() => setShowContext(true)}
                  className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/10 hover:bg-accent transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-secondary text-sm">+</span>
                    <span className="text-sm tracking-wide text-muted-foreground group-hover:text-foreground transition-colors">
                      Add more context
                    </span>
                  </div>
                  <span className="text-muted-foreground/30 text-sm">›</span>
                </button>
              ) : (
                <div className="md:col-span-2">
                  <textarea
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="E.g., 'Recent phishing attempts detected', 'Focus on cloud infrastructure'..."
                    rows={3}
                    autoFocus
                    className="w-full bg-card border border-border/10 rounded-xl p-4 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all resize-none font-mono"
                  />
                </div>
              )}

              {/* File upload */}
              {!showContext && (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  className="relative group cursor-pointer"
                >
                  <div className="flex items-center justify-center gap-4 p-4 rounded-xl border border-dashed border-border/30 bg-background hover:bg-card hover:border-border transition-all h-full">
                    <span className="text-muted-foreground/40 group-hover:text-secondary transition-colors text-sm">
                      ☁
                    </span>
                    <span className="text-sm tracking-wide text-muted-foreground/60 group-hover:text-foreground transition-colors">
                      {files.length > 0
                        ? `${files.length} file${files.length > 1 ? "s" : ""} selected`
                        : "Upload documentation"}
                    </span>
                  </div>
                  <input
                    type="file"
                    accept=".pdf,.md,.txt"
                    multiple
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => {
                      const selected = Array.from(e.target.files || []);
                      setFiles((prev) => [...prev, ...selected]);
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card/80 backdrop-blur-xl border-t border-border/10 flex items-center justify-around z-50 px-6">
        <a className="text-primary flex flex-col items-center gap-1" href="#">
          <span className="text-sm">◉</span>
          <span className="text-[9px] uppercase tracking-tighter font-mono">Recent</span>
        </a>
        <a className="text-muted-foreground/60 flex flex-col items-center gap-1" href="#">
          <span className="text-sm">○</span>
          <span className="text-[9px] uppercase tracking-tighter font-mono">Past Runs</span>
        </a>
      </nav>
    </div>
  );
}
