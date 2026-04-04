"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
// Pipeline mode: triggers WDK workflow instead of direct Flask call
import { Card, CardContent } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Button } from "@/app/components/ui/button";
import { Alert, AlertDescription } from "@/app/components/ui/alert";

export default function ResearchForm() {
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

    // Launch the WDK pipeline workflow
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
      return;
    }
  }, [url, context, mode, router]);

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="company-url">Company URL *</Label>
          <Input
            id="company-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://company.com"
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="context">
            Additional Context <span className="text-muted-foreground">(optional)</span>
          </Label>
          <textarea
            id="context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="E.g., 'We just had a ransomware scare', 'Focus on GDPR compliance'..."
            rows={3}
            disabled={loading}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        <div className="space-y-2">
          <Label>Simulation Depth</Label>
          <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-0.5 w-fit">
            {([
              { key: "test", label: "Test", sub: "~25 min" },
              { key: "quick", label: "Quick", sub: "~40 min" },
              { key: "standard", label: "Standard", sub: "~75 min" },
              { key: "deep", label: "Deep", sub: "~120 min" },
            ] as const).map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                disabled={loading}
                className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all disabled:cursor-not-allowed disabled:opacity-50 flex flex-col items-center leading-tight ${
                  mode === m.key
                    ? "bg-card text-foreground shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{m.label}</span>
                <span className="text-[9px] opacity-60">{m.sub}</span>
              </button>
            ))}
          </div>
          <p className="text-xs font-mono text-muted-foreground">
            {mode === "test" && "3 stress test variations, 1 scenario, 1 what-if branch."}
            {mode === "quick" && "10 variations, 1 scenario, 2 what-if branches. Good for demos."}
            {mode === "standard" && "50 variations, 2 scenarios, 3 what-if branches. Client-ready."}
            {mode === "deep" && "100 variations, 3 scenarios, 3 what-if branches. Full assessment."}
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={handleSubmit}
          disabled={!url.trim() || loading}
          className="w-full"
        >
          {loading ? "Starting Pipeline..." : "Start Pipeline"}
        </Button>
      </CardContent>
    </Card>
  );
}
