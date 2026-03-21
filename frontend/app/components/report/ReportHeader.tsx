import type { Report } from "@/app/types";
import { Badge } from "@/app/components/ui/badge";

export default function ReportHeader({ report }: { report: Report }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-2xl font-bold">{report.companyName}</h1>
        <Badge variant="secondary" className="font-mono">
          {report.status}
        </Badge>
      </div>
      <p className="text-muted-foreground text-sm">{report.scenarioName}</p>
      <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
        <span>Duration: {report.duration}</span>
        <span>Completed: {new Date(report.completedAt).toLocaleString()}</span>
        <span>{report.agentScores.length} agents scored</span>
      </div>
    </div>
  );
}
