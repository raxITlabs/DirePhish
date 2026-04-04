"use client";

import { AsciiTimeline } from "@/app/components/ascii/DesignSystem";

interface Props {
  items: Array<{ time: string; action: string }>;
}

export default function RegulatoryTimeline({ items }: Props) {
  if (!items || items.length === 0) return null;

  const events = items.map((item) => ({
    time: item.time,
    label: item.action,
  }));

  return <AsciiTimeline events={events} ariaLabel="Regulatory timeline" />;
}
