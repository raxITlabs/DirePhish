"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { ListChecks } from "lucide-react";

interface CrucibleRecommendationsProps {
  recommendations: string[];
}

export default function CrucibleRecommendations({
  recommendations,
}: CrucibleRecommendationsProps) {
  if (recommendations.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ListChecks size={18} />
          Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {recommendations.map((rec, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                {i + 1}
              </div>
              <p className="text-sm leading-relaxed">{rec}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
