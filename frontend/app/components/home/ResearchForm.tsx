"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
// Pipeline mode: triggers WDK workflow instead of direct Flask call
import { Card, CardContent } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Alert, AlertDescription } from "@/app/components/ui/alert";

export default function ResearchForm() {
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

    // Launch the WDK pipeline workflow
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
      return;
    }
  }, [url, context, files, router]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(pdf|md|txt)$/i.test(f.name)
    );
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

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
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
          />
        </div>

        <div className="space-y-2">
          <Label>
            Documents <span className="text-muted-foreground">(optional — PDF, MD, TXT)</span>
          </Label>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            className="border-2 border-dashed border-border rounded-md p-4 text-center text-sm text-muted-foreground"
          >
            {files.length === 0 ? (
              <p>Drop files here or{" "}
                <label className="text-primary cursor-pointer hover:underline">
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
            ) : (
              <div className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <Badge key={i} variant="outline" className="gap-1">
                    {f.name}
                    <button
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-foreground ml-1"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
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
