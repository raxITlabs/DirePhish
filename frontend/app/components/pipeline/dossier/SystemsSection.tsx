"use client";

import type { DossierForm } from "@/app/lib/dossier-schema";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/app/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/app/components/ui/select";

interface SystemsSectionProps {
  form: DossierForm;
}

const CATEGORIES = [
  "database",
  "infrastructure",
  "application",
  "security",
  "communication",
  "cloud",
  "cicd",
  "identity",
] as const;

const CRITICALITIES = ["low", "medium", "high", "critical"] as const;

export default function SystemsSection({ form }: SystemsSectionProps) {
  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle>Technology Stack</CardTitle>
      </CardHeader>
      <CardContent>
        <form.Field name="systems" mode="array">
          {(systemsField) => (
            <div className="space-y-3">
              {(systemsField.state.value ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No systems defined.
                </p>
              )}
              {(systemsField.state.value ?? []).map((_sys, i) => (
                <div
                  key={i}
                  className="space-y-1.5 border border-border rounded-lg p-2.5"
                >
                  <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center">
                    <form.Field name={`systems[${i}].name`}>
                      {(field) => (
                        <Input
                          type="text"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          placeholder="System name (e.g. PostgreSQL)"
                          className="text-xs"
                        />
                      )}
                    </form.Field>

                    <form.Field name={`systems[${i}].vendor`}>
                      {(field) => (
                        <Input
                          type="text"
                          value={field.state.value ?? ""}
                          onChange={(e) =>
                            field.handleChange(e.target.value || undefined)
                          }
                          onBlur={field.handleBlur}
                          placeholder="Vendor"
                          className="text-xs w-24"
                        />
                      )}
                    </form.Field>

                    <form.Field name={`systems[${i}].category`}>
                      {(field) => (
                        <Select
                          value={field.state.value}
                          onValueChange={(val) => {
                            if (val)
                              field.handleChange(
                                val as (typeof CATEGORIES)[number]
                              );
                          }}
                        >
                          <SelectTrigger size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </form.Field>

                    <form.Field name={`systems[${i}].criticality`}>
                      {(field) => (
                        <Select
                          value={field.state.value}
                          onValueChange={(val) => {
                            if (val)
                              field.handleChange(
                                val as (typeof CRITICALITIES)[number]
                              );
                          }}
                        >
                          <SelectTrigger size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CRITICALITIES.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </form.Field>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => systemsField.removeValue(i)}
                      className="text-muted-foreground hover:text-destructive px-2"
                    >
                      x
                    </Button>
                  </div>

                  <form.Field name={`systems[${i}].description`}>
                    {(field) => (
                      <Input
                        type="text"
                        value={field.state.value ?? ""}
                        onChange={(e) =>
                          field.handleChange(e.target.value || undefined)
                        }
                        onBlur={field.handleBlur}
                        placeholder="What it does / what data it holds"
                        className="text-xs text-muted-foreground"
                      />
                    )}
                  </form.Field>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  systemsField.pushValue({
                    name: "",
                    category: "application",
                    criticality: "medium",
                  })
                }
                className="border-dashed"
              >
                + Add System
              </Button>
            </div>
          )}
        </form.Field>
      </CardContent>
    </Card>
  );
}
