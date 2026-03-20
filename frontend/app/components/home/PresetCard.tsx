// frontend/app/components/home/PresetCard.tsx
import Link from "next/link";
import type { Preset } from "@/app/types";

export default function PresetCard({ preset }: { preset: Preset }) {
  return (
    <Link
      href={`/configure/${preset.id}`}
      className="block border border-border rounded-lg bg-card p-5 hover:border-accent transition-colors"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-mono uppercase text-text-secondary bg-background px-2 py-0.5 rounded">
          {preset.industry}
        </span>
        <span className="text-xs text-text-tertiary">{preset.size}</span>
      </div>
      <h3 className="text-base font-semibold mb-1">{preset.name}</h3>
      <p className="text-sm text-text-secondary mb-3 line-clamp-2">{preset.description}</p>
      <div className="flex gap-2 flex-wrap">
        {preset.worldTypes.map((w) => (
          <span key={w} className="text-xs font-mono bg-background px-2 py-0.5 rounded border border-border">
            {w}
          </span>
        ))}
        <span className="text-xs font-mono bg-background px-2 py-0.5 rounded border border-border">
          {preset.pressureCount} pressures
        </span>
      </div>
    </Link>
  );
}
