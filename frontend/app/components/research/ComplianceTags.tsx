// frontend/app/components/research/ComplianceTags.tsx
"use client";

import { useState } from "react";
import { Input } from "@/app/components/ui/input";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";

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
          <span className="text-sm text-muted-foreground">
            No compliance frameworks added.
          </span>
        )}
        {compliance.map((tag, i) => (
          <Badge key={i} variant="outline" className="gap-1 font-mono">
            {tag}
            <button
              onClick={() => removeTag(i)}
              className="text-muted-foreground hover:text-destructive leading-none"
            >
              x
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
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
          className="flex-1 text-xs"
        />
        <Button variant="outline" size="sm" onClick={addTag}>
          Add
        </Button>
      </div>
    </div>
  );
}
