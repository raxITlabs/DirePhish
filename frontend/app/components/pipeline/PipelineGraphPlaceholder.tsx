"use client";

interface PipelineGraphPlaceholderProps {
  companyName?: string;
}

export default function PipelineGraphPlaceholder({ companyName }: PipelineGraphPlaceholderProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <span className="text-2xl font-bold">
          {companyName ? companyName.charAt(0).toUpperCase() : "?"}
        </span>
      </div>
      {companyName && (
        <p className="text-sm font-medium text-foreground mb-1">{companyName}</p>
      )}
      <p className="text-xs">Graph builds during simulation</p>
    </div>
  );
}
