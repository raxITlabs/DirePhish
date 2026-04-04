"use client";

import { useState, type ReactNode } from "react";

interface DossierSectionCardProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

export default function DossierSectionCard({
  title,
  count,
  defaultOpen = true,
  children,
}: DossierSectionCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full px-4 py-2.5 text-left group"
      >
        <div className="flex items-center gap-2">
          <span className="text-primary select-none font-mono text-xs" aria-hidden="true">
            {open ? "▼" : "▶"}
          </span>
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">{title}</span>
          {count !== undefined && (
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
              [{count}]
            </span>
          )}
        </div>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}
