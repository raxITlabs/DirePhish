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
          <Label>Pipeline Mode</Label>
          <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-0.5 w-fit">
            {(["test", "quick", "standard", "deep"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                disabled={loading}
                className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                  mode === m
                    ? "bg-card text-foreground shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "test" ? "Test" : m === "quick" ? "Quick" : m === "standard" ? "Standard" : "Deep"}
              </button>
            ))}
          </div>
          <p className="text-xs font-mono text-muted-foreground">
            {mode === "test" && "~15 min. 3 MC iterations, 1 scenario, 1 fork."}
            {mode === "quick" && "~25 min. 10 MC iterations, 1 scenario, 2 forks."}
            {mode === "standard" && "~45 min. 50 MC iterations, 2 scenarios, 3 forks."}
            {mode === "deep" && "~90+ min. 100 MC iterations, 3 scenarios, 3 forks."}
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
