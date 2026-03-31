"use client";

import type { EvidenceChipData } from "@/app/actions/report";

interface Props {
  label: string;
  type: "success" | "warning" | "danger" | "info";
  isInferred?: boolean;
}

const typeStyles: Record<Props["type"], string> = {
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  info: "bg-royal-azure-900/20 text-royal-azure-400",
};

const dotStyles: Record<Props["type"], string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-royal-azure-400",
};

export default function EvidenceChip({ label, type, isInferred }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${typeStyles[type]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[type]}`} />
      {isInferred ? `~${label}` : label}
    </span>
  );
}
