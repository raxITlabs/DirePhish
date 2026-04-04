import { AsciiDivider } from "@/app/components/ascii/DesignSystem";

export default function RoundDivider({ round, timestamp }: { round: number; timestamp?: string }) {
  const label = `Round ${round}${timestamp ? ` — ${new Date(timestamp).toLocaleTimeString()}` : ""}`;

  return (
    <div className="my-4">
      <AsciiDivider variant="labeled" label={label} />
    </div>
  );
}
