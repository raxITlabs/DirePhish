"use client";

import type { DossierForm } from "@/app/lib/dossier-schema";
import { Badge } from "@/app/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/app/components/ui/card";

interface EventsSectionProps {
  form: DossierForm;
}

export default function EventsSection({ form }: EventsSectionProps) {
  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle>Recent Events</CardTitle>
      </CardHeader>
      <CardContent>
        <form.Field name="recentEvents">
          {(field) => {
            const events = field.state.value ?? [];

            if (events.length === 0) {
              return (
                <p className="text-sm text-muted-foreground">
                  No recent events.
                </p>
              );
            }

            return (
              <div className="space-y-2">
                {events.map((event, i) => (
                  <div
                    key={i}
                    className="border border-border rounded-lg p-2.5 space-y-1"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground shrink-0">
                        {event.date}
                      </span>
                      {event.category && (
                        <Badge variant="outline" className="text-[10px]">
                          {event.category.replace("_", " ")}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">
                        {event.source}
                      </span>
                    </div>
                    <p className="text-xs">{event.description}</p>
                    {event.impact && (
                      <p className="text-[10px] text-muted-foreground">
                        Impact: {event.impact}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            );
          }}
        </form.Field>
      </CardContent>
    </Card>
  );
}
