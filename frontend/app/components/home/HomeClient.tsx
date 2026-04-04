"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import AsciiSpinner from "@/app/components/ascii/AsciiSpinner";
import LogoAlive from "@/app/components/ascii/LogoAlive";
import { Card } from "@/app/components/ui/card";
import {
  AsciiTabBar,
  AsciiBadge,
  AsciiDivider,
  AsciiAlert,
} from "@/app/components/ascii/DesignSystem";

const EXAMPLES = [
  "Ransomware hitting finance systems",
  "Cloud credentials leaked on GitHub",
  "Supply chain compromise via vendor",
];

const MODE_TABS = [
  { key: "test", label: "Test ~25m" },
  { key: "quick", label: "Quick ~40m" },
  { key: "standard", label: "Standard ~75m" },
  { key: "deep", label: "Deep ~120m" },
] as const;

export default function HomeClient() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [context, setContext] = useState("");
  const [mode, setMode] = useState<"test" | "quick" | "standard" | "deep">("test");
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
          mode,
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
  }, [url, context, mode, router]);

  return (
    <div
      className="relative flex flex-col items-center justify-center px-6 md:px-12"
      style={{ minHeight: "calc(100svh - 3rem)" }}
    >
      {/* Logo Alive background */}
      <div className="absolute inset-0 overflow-hidden">
        <LogoAlive />
      </div>

      <div className="relative z-10 w-full max-w-xl space-y-6">
        {/* Hero */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            Predict what breaks next.
          </h1>
          <p className="text-base md:text-lg text-muted-foreground font-mono">
            Predictive incident response simulation.
          </p>
        </div>

        <AsciiDivider variant="dots" />

        {/* Composer — Card with corner marks */}
        <Card>
          {/* URL input */}
          <div className="flex items-center gap-3 px-4 py-3">
            <Link2 className="size-4 shrink-0 text-muted-foreground/50" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && url.trim()) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="company.com"
              aria-label="Company URL"
              autoComplete="url"
              disabled={loading}
              className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-sm font-mono text-foreground placeholder:text-muted-foreground/40 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Context area */}
          <div className="px-4 pb-3">
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Scenario, recent concerns, or systems to stress-test..."
              aria-label="Additional context"
              rows={2}
              disabled={loading}
              className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-xs font-mono text-foreground placeholder:text-muted-foreground/40 resize-none leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Bottom bar — mode tabs + submit */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-border/20">
            <AsciiTabBar
              tabs={MODE_TABS.map((m) => ({ key: m.key, label: m.label }))}
              activeTab={mode}
              onTabChange={(key) => setMode(key as typeof mode)}
            />
            <button
              onClick={handleSubmit}
              disabled={!url.trim() || loading}
              className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg font-mono text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-w-[110px]"
            >
              {loading ? <><AsciiSpinner /> Analyzing</> : "Analyze"}
            </button>
          </div>
        </Card>

        {/* Error */}
        {error && (
          <AsciiAlert variant="error">{error}</AsciiAlert>
        )}

        {/* Examples */}
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setContext(ex)}
              className="hover:opacity-80 transition-opacity"
            >
              <AsciiBadge variant="muted" bracket="angle">{ex}</AsciiBadge>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
