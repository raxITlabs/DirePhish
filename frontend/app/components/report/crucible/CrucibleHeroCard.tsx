"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Calendar, Clock, Shield } from "lucide-react";

interface CrucibleHeroCardProps {
  companyName?: string;
  scenarioName?: string;
  completedAt?: string;
  duration?: string;
}

export default function CrucibleHeroCard({
  companyName,
  scenarioName,
  completedAt,
  duration,
}: CrucibleHeroCardProps) {
  const formattedDate = completedAt
    ? new Date(completedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Shield size={24} className="text-primary" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl">
              {companyName || "Simulation"}
            </CardTitle>
            <CardDescription className="text-base">
              {scenarioName || "After-Action Report"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {formattedDate && (
            <div className="flex items-center gap-1.5">
              <Calendar size={14} />
              <span>{formattedDate}</span>
            </div>
          )}
          {duration && (
            <Badge variant="outline" className="font-normal">
              <Clock size={12} className="mr-1" />
              {duration}
            </Badge>
          )}
          <Badge
            variant="success"
          >
            Completed
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
