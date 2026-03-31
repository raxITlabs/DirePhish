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
          <span className="font-mono text-xs font-semibold text-foreground">{title}</span>
          {count !== undefined && (
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-royal-azure-100 text-royal-azure-700">
              {count}
            </span>
          )}
        </div>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`transition-transform duration-200 ${open ? "rotate-180 text-royal-azure-500" : "text-pitch-black-400"}`}
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}
