import type { Report } from "@/app/types";

export default function ReportHeader({ report }: { report: Report }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-2xl font-bold">{report.companyName}</h1>
        <span className="text-xs font-mono bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
          {report.status}
        </span>
      </div>
      <p className="text-text-secondary text-sm">{report.scenarioName}</p>
      <div className="flex gap-4 mt-3 text-xs text-text-secondary">
        <span>Duration: {report.duration}</span>
        <span>Completed: {new Date(report.completedAt).toLocaleString()}</span>
        <span>{report.agentScores.length} agents scored</span>
      </div>
    </div>
  );
}
