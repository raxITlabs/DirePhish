// frontend/app/components/home/UploadZone.tsx
"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadCustomConfig } from "@/app/actions/presets";

export default function UploadZone() {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".json")) return;
      const text = await file.text();
      // Upload via Server Action — stores on server, returns temp config ID
      const result = await uploadCustomConfig(text);
      if ("error" in result) return;
      router.push(`/configure/${result.data.configId}`);
    },
    [router]
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        dragOver ? "border-accent bg-accent/5" : "border-border"
      }`}
    >
      <p className="text-text-secondary mb-2">Drop a JSON config file here</p>
      <label className="inline-block cursor-pointer text-accent hover:underline">
        or browse
        <input
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </label>
      <p className="text-xs text-text-tertiary mt-2">
        Seed document upload — coming soon
      </p>
    </div>
  );
}
