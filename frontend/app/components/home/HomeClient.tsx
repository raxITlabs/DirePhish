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
    <div className="dark h-screen flex bg-[#131313] text-[#e5e2e1] overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-[240px] shrink-0 bg-[#1a1a1a] border-r border-[#222] flex flex-col">
        <div className="px-5 pt-6 pb-4">
          <h1 className="font-mono text-xl font-bold text-primary tracking-tighter">
            DirePhish
          </h1>
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground/50 mt-0.5">
            BY RAXIT LABS
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 space-y-6">
          {simulations.length > 0 && (
            <div>
              <h3 className="font-mono uppercase text-[10px] tracking-[0.15em] text-muted-foreground/40 px-2 mb-2">
                Recent
              </h3>
              <ul className="space-y-0.5">
                {simulations.slice(0, 6).map((sim) => (
                  <li key={sim.simId}>
                    <a
                      href={getSimHref(sim)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all duration-150 ${
                        isRunning(sim.status)
                          ? "text-primary bg-primary/8 border-r-2 border-primary"
                          : "text-muted-foreground/70 hover:text-primary/80 hover:bg-[#222]"
                      }`}
                    >
                      <span className="text-xs">
                        {isRunning(sim.status) ? "◉" : sim.status === "completed" ? "✓" : "○"}
                      </span>
                      <span className="font-mono text-xs truncate">
                        {sim.simId.slice(0, 12)}...
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>

        <div className="px-5 py-4 border-t border-[#222]">
          <p className="font-mono text-[9px] text-muted-foreground/30">
            v0.1 · Crucible Engine
          </p>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/4 rounded-full blur-[140px] pointer-events-none" />

        {/* Brand */}
        <div className="text-center mb-12 relative z-10">
          <div className="flex items-baseline justify-center gap-3 mb-2">
            <h2 className="font-mono text-5xl font-black text-primary tracking-tighter leading-none">
              DirePhish
            </h2>
            <span className="font-mono text-sm text-muted-foreground/40">
              by raxIT Labs
            </span>
          </div>
          <p className="text-[15px] text-muted-foreground/50 tracking-tight">
            Swarm-predict what goes wrong next
          </p>
        </div>

        {/* Input Panel */}
        <div className="w-full max-w-2xl relative z-10">
          <div className="bg-[#1a1a1a]/70 backdrop-blur-xl rounded-2xl border border-[#2a2a2a] overflow-hidden transition-all duration-300 focus-within:border-primary/25">
            <div className="p-8 space-y-6">
              {/* URL Input */}
              <div>
                <label className="block font-mono uppercase text-[10px] tracking-[0.2em] text-muted-foreground/40 mb-2.5">
                  Target Company URL *
                </label>
                <div className="relative group">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/25 group-focus-within:text-primary/60 transition-colors text-sm">
                    🔗
                  </span>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="https://company.com"
                    className="w-full bg-[#111]/50 border border-[#2a2a2a] rounded-xl py-3.5 pl-11 pr-4 text-[#e5e2e1] font-mono text-base placeholder:text-muted-foreground/20 focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary/30 transition-all"
                  />
                </div>
              </div>

              {/* Context */}
              <div>
                <label className="block font-mono uppercase text-[10px] tracking-[0.2em] text-muted-foreground/40 mb-2.5">
                  Additional Context
                  <span className="text-muted-foreground/20 normal-case tracking-normal ml-2">(optional)</span>
                </label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="E.g., 'Recent phishing attempts detected', 'Focus on department-specific vectors'..."
                  rows={3}
                  className="w-full bg-[#111]/50 border border-[#2a2a2a] rounded-xl p-4 text-sm text-[#e5e2e1] placeholder:text-muted-foreground/20 focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary/30 transition-all resize-none"
                />
              </div>

              {/* File Upload */}
              <div>
                <label className="block font-mono uppercase text-[10px] tracking-[0.2em] text-muted-foreground/40 mb-2.5">
                  Upload Documents
                  <span className="text-muted-foreground/20 normal-case tracking-normal ml-2">(optional — PDF, MD, TXT)</span>
                </label>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  className="border-2 border-dashed border-[#2a2a2a] rounded-xl py-8 flex flex-col items-center justify-center gap-2 hover:bg-[#111]/30 hover:border-primary/15 transition-all cursor-pointer group"
                >
                  {files.length === 0 ? (
                    <>
                      <span className="text-2xl text-muted-foreground/20 group-hover:text-primary/40 transition-colors">
                        ☁
                      </span>
                      <p className="font-mono text-[11px] text-muted-foreground/30">
                        Drop files here or{" "}
                        <label className="text-primary/60 font-bold cursor-pointer hover:underline">
                          browse
                          <input
                            type="file"
                            accept=".pdf,.md,.txt"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              const selected = Array.from(e.target.files || []);
                              setFiles((prev) => [...prev, ...selected]);
                            }}
                          />
                        </label>
                      </p>
                    </>
                  ) : (
                    <div className="flex flex-wrap gap-2 px-4">
                      {files.map((f, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#222] rounded-md font-mono text-[11px] text-muted-foreground/60"
                        >
                          {f.name}
                          <button
                            onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                            className="text-muted-foreground/30 hover:text-primary ml-0.5"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400 font-mono">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!url.trim() || loading}
                className="w-full py-4 rounded-xl font-mono font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-primary/80 to-primary text-primary-foreground hover:brightness-110 active:scale-[0.99]"
              >
                {loading ? "Starting Pipeline..." : "Start Prediction Pipeline"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
