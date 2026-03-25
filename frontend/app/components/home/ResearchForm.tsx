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
  const [testMode, setTestMode] = useState(false);
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
          mode: testMode ? "test" : "standard",
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
  }, [url, context, testMode, router]);

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

        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={testMode}
            onClick={() => setTestMode(!testMode)}
            disabled={loading}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${testMode ? "bg-tuscan-sun-500" : "bg-pitch-black-200"}`}
          >
            <span className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${testMode ? "translate-x-4" : "translate-x-0"}`} />
          </button>
          <Label className="text-sm cursor-pointer" onClick={() => !loading && setTestMode(!testMode)}>
            Test Mode
            <span className="text-muted-foreground ml-1.5 font-normal">
              (1 scenario, 3 MC iterations, 1 fork)
            </span>
          </Label>
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
          {loading ? "Starting Pipeline..." : testMode ? "Start Test Run" : "Start Pipeline"}
        </Button>
      </CardContent>
    </Card>
  );
}
