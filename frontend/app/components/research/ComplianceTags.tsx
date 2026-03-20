// frontend/app/components/research/ComplianceTags.tsx
"use client";

import { useState } from "react";

interface Props {
  compliance: string[];
  onChange: (compliance: string[]) => void;
}

export default function ComplianceTags({ compliance, onChange }: Props) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const trimmed = input.trim().toUpperCase();
    if (!trimmed || compliance.includes(trimmed)) return;
    onChange([...compliance, trimmed]);
    setInput("");
  };

  const removeTag = (index: number) => {
    onChange(compliance.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {compliance.length === 0 && (
          <span className="text-sm text-text-secondary">
            No compliance frameworks added.
          </span>
        )}
        {compliance.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 bg-background border border-border rounded px-2 py-0.5 text-xs font-mono"
          >
            {tag}
            <button
              onClick={() => removeTag(i)}
              className="text-text-tertiary hover:text-severity-critical-text leading-none"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder="Add framework (e.g. PCI-DSS) and press Enter"
          className="flex-1 border border-border rounded-md px-3 py-1.5 text-xs bg-background focus:outline-none focus:border-accent"
        />
        <button
          onClick={addTag}
          className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-background transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}
