"use client";

import { Badge } from "@/app/components/ui/badge";

interface Props {
  label: string;
  type: "success" | "warning" | "danger" | "info";
}

const variantMap: Record<Props["type"], "success" | "warning" | "destructive" | "default"> = {
  success: "success",
  warning: "warning",
  danger: "destructive",
  info: "default",
};

export default function EvidenceChip({ label, type }: Props) {
  return (
    <Badge variant={variantMap[type]}>
      {label}
    </Badge>
  );
}
