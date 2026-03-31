"use client";

interface Props {
  label: string;
  type: "success" | "warning" | "danger" | "info";
  isInferred?: boolean;
}

const typeStyles: Record<Props["type"], string> = {
  success: "bg-verdigris-50 text-verdigris-700 border border-verdigris-200",
  warning: "bg-tuscan-sun-50 text-tuscan-sun-700 border border-tuscan-sun-200",
  danger: "bg-burnt-peach-50 text-burnt-peach-700 border border-burnt-peach-200",
  info: "bg-royal-azure-50 text-royal-azure-700 border border-royal-azure-200",
};

const dotStyles: Record<Props["type"], string> = {
  success: "bg-verdigris-500",
  warning: "bg-tuscan-sun-500",
  danger: "bg-burnt-peach-500",
  info: "bg-royal-azure-500",
};

export default function EvidenceChip({ label, type, isInferred }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${typeStyles[type]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotStyles[type]}`} />
      {isInferred ? `~${label}` : label}
    </span>
  );
}
