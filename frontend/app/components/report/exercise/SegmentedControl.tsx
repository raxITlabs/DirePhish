"use client";

const VIEWS = [
  { id: "board", label: "Board" },
  { id: "ciso", label: "CISO" },
  { id: "security", label: "Security Team" },
  { id: "playbook", label: "Playbook" },
  { id: "risk-score", label: "Risk Score" },
] as const;

export type ReportView = (typeof VIEWS)[number]["id"];

export default function SegmentedControl({
  value,
  onChange,
}: {
  value: ReportView;
  onChange: (v: ReportView) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-pitch-black-100 p-1 gap-0.5">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          onClick={() => onChange(v.id)}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
            value === v.id
              ? "bg-white text-pitch-black-900 shadow-sm"
              : "text-pitch-black-500 hover:text-pitch-black-700 hover:bg-pitch-black-50"
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
