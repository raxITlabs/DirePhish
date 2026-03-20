export default function RoundDivider({ round, timestamp }: { round: number; timestamp?: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs text-text-tertiary bg-background px-3 py-1 rounded">
        Round {round}{timestamp ? ` — ${new Date(timestamp).toLocaleTimeString()}` : ""}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
