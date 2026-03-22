"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Link2, Upload, X, FileText, Paperclip } from "lucide-react";

const EXAMPLES = [
  "Ransomware hitting finance systems",
  "Cloud credentials leaked on GitHub",
  "Supply chain compromise via vendor",
];

export default function HomeClient() {
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

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div
      className="flex flex-col items-center justify-center px-6 md:px-12"
      style={{ minHeight: "calc(100svh - 3rem)" }}
    >
      <div className="w-full max-w-xl space-y-8">
        {/* Hero — tight, minimal */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            Predict what breaks next.
          </h1>
          <p className="text-base md:text-lg text-muted-foreground font-mono">
            Predictive incident response simulation.
          </p>
        </div>

        {/* Composer */}
        <div
          className="bg-card rounded-xl border border-border/30 overflow-hidden"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
        >
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
              className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-sm font-mono text-foreground placeholder:text-muted-foreground/40"
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
              className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-xs font-mono text-foreground placeholder:text-muted-foreground/40 resize-none leading-relaxed"
            />
          </div>

          {/* File chips */}
          {files.length > 0 && (
            <div className="px-4 pb-3 flex flex-wrap gap-1.5">
              {files.map((file, i) => (
                <span
                  key={`${file.name}-${i}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted text-xs font-mono text-muted-foreground"
                >
                  <FileText className="size-3" />
                  {file.name}
                  <button
                    onClick={() => removeFile(i)}
                    className="p-1 -mr-1 hover:text-foreground transition-colors"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Bottom bar */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-border/20">
            <div className="relative">
              <button
                className="flex items-center gap-1.5 px-2 py-1 rounded text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                aria-label="Attach files"
              >
                <Paperclip className="size-3.5" />
                {files.length > 0 && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {files.length}
                  </span>
                )}
              </button>
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
            <button
              onClick={handleSubmit}
              disabled={!url.trim() || loading}
              className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg font-mono text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "Starting..." : "Analyze"}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div role="alert" className="text-xs font-mono text-destructive text-center">
            {error}
          </div>
        )}

        {/* Examples — quiet, below */}
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setContext(ex)}
              className="text-xs font-mono text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
