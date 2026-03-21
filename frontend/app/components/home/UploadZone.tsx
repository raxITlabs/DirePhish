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
        dragOver ? "border-primary bg-accent" : "border-border"
      }`}
    >
      <p className="text-muted-foreground mb-2">Drop a JSON config file here</p>
      <label className="inline-block cursor-pointer text-primary hover:underline">
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
      <p className="text-xs text-muted-foreground mt-2">
        Seed document upload — coming soon
      </p>
    </div>
  );
}
