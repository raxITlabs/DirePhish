"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Users } from "lucide-react";
import { AsciiSectionHeader, AsciiProgressBar } from "@/app/components/ascii/DesignSystem";
import type { ExerciseReport } from "@/app/actions/report";
import HeatmapChart from "./HeatmapChart";

type Team = NonNullable<ExerciseReport["teamPerformance"]>["teams"][number];

interface TeamPerformanceSectionProps {
  teamPerformance: NonNullable<ExerciseReport["teamPerformance"]>;
}

const DIMENSION_LABELS: Record<string, string> = {
  responseSpeed: "Response Speed",
  containmentEffectiveness: "Containment",
  communicationQuality: "Communication",
  complianceAdherence: "Compliance",
  leadershipDecisiveness: "Leadership",
};

function scoreColor(score: number): string {
  if (score >= 7) return "text-verdigris-700";
  if (score >= 5) return "text-tuscan-sun-700";
  return "text-burnt-peach-700";
}

function scoreBarColor(score: number): string {
  if (score >= 7) return "text-verdigris-600";
  if (score >= 5) return "text-tuscan-sun-600";
  return "text-burnt-peach-600";
}

function formatRole(slug: string): string {
  return slug
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function TeamCard({ team }: { team: Team }) {
  const avg =
    Object.values(team.scores).reduce((a, b) => a + b, 0) /
    Object.values(team.scores).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Users size={16} />
            {team.name}
          </span>
          <span className={`text-xl font-bold ${scoreColor(avg)}`}>
            {avg.toFixed(1)}
          </span>
        </CardTitle>
        <div className="flex flex-wrap gap-1">
          {team.roles.map((role, i) => (
            <Badge key={`${role}-${i}`} variant="outline" className="text-xs">
              {formatRole(role)}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Score bars */}
        <div className="space-y-2">
          {Object.entries(team.scores).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span className="w-28 text-muted-foreground truncate">
                {DIMENSION_LABELS[key] ?? key}
              </span>
              <AsciiProgressBar
                value={value}
                max={10}
                width={14}
                showPercent={false}
                color={scoreBarColor(value)}
                label={`${DIMENSION_LABELS[key] ?? key}: ${value}/10`}
              />
              <span className={`w-5 text-right font-mono font-bold ${scoreColor(value)}`}>
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Narrative */}
        {team.narrative && (
          <p className="text-sm text-muted-foreground leading-relaxed border-t pt-3">
            {team.narrative}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function TeamPerformanceSection({
  teamPerformance,
}: TeamPerformanceSectionProps) {
  return (
    <section id="team-performance" className="space-y-3">
      <AsciiSectionHeader as="h2" sigil="●">Team Performance</AsciiSectionHeader>

      {/* Team cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teamPerformance.teams.map((team) => (
          <TeamCard key={team.name} team={team} />
        ))}
      </div>

      {/* Heatmap */}
      {teamPerformance.heatmapData.length > 0 && (
        <Card>
          <CardContent>
            <AsciiSectionHeader as="h3" sigil="▣">Scenario Comparison Heatmap</AsciiSectionHeader>
            <HeatmapChart data={teamPerformance.heatmapData} />
          </CardContent>
        </Card>
      )}
    </section>
  );
}
