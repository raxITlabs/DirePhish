// frontend/app/components/home/ResearchForm.tsx
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "@/app/actions/project";

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

    const formData = new FormData();
    formData.append("company_url", url.trim());
    if (context.trim()) formData.append("user_context", context.trim());
    for (const file of files) {
      formData.append("files", file);
    }

    const result = await createProject(formData);
    if ("error" in result) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.push(`/research/${result.data.projectId}`);
  }, [url, context, files, router]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(pdf|md|txt)$/i.test(f.name)
    );
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

  return (
    <div className="border border-border rounded-lg bg-card p-6">
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Company URL *</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://company.com"
          className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:border-accent"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          Additional Context <span className="text-text-tertiary">(optional)</span>
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="E.g., 'We just had a ransomware scare', 'Focus on GDPR compliance', 'Our CISO started 2 weeks ago'..."
          rows={3}
          className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:border-accent resize-none"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          Documents <span className="text-text-tertiary">(optional — PDF, MD, TXT)</span>
        </label>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          className="border-2 border-dashed border-border rounded-md p-4 text-center text-sm text-text-secondary"
        >
          {files.length === 0 ? (
            <>
              <p>Drop files here or{" "}
                <label className="text-accent cursor-pointer hover:underline">
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
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 bg-background border border-border rounded px-2 py-1 text-xs">
                  {f.name}
                  <button
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="text-text-tertiary hover:text-foreground"
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-severity-critical-text">{error}</div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!url.trim() || loading}
        className="w-full px-4 py-2 rounded-lg bg-accent text-white font-medium text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        {loading ? "Starting Research..." : "Start Research"}
      </button>
    </div>
  );
}
