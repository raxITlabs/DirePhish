// frontend/app/components/home/PresetGrid.tsx
import type { Preset } from "@/app/types";
import PresetCard from "./PresetCard";

export default function PresetGrid({ presets }: { presets: Preset[] }) {
  if (presets.length === 0) {
    return (
      <div className="text-center py-12 text-text-secondary">
        No presets available. Check that Crucible is installed.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {presets.map((p) => (
        <PresetCard key={p.id} preset={p} />
      ))}
    </div>
  );
}
