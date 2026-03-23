"use client";

import { useState } from "react";
import type { DossierForm } from "@/app/lib/dossier-schema";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Label } from "@/app/components/ui/label";
import { Badge } from "@/app/components/ui/badge";
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

interface RisksSectionProps {
  form: DossierForm;
}

const LIKELIHOODS = ["low", "medium", "high"] as const;
const IMPACTS = ["low", "medium", "high", "critical"] as const;

export default function RisksSection({ form }: RisksSectionProps) {
  const [affectedInputs, setAffectedInputs] = useState<
    Record<number, string>
  >({});
  const [mitigationInputs, setMitigationInputs] = useState<
    Record<number, string>
  >({});

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle>Risk Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form.Field name="risks" mode="array">
          {(risksField) => (
            <div className="space-y-3">
              {(risksField.state.value ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No risks defined.
                </p>
              )}
              {(risksField.state.value ?? []).map((_risk, i) => (
                <div
                  key={i}
                  className="space-y-1.5 border border-border rounded-lg p-2.5"
                >
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                    <form.Field name={`risks[${i}].name`}>
                      {(field) => (
                        <Input
                          type="text"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          placeholder="Risk name (e.g. Ransomware)"
                          className="text-xs"
                        />
                      )}
                    </form.Field>

                    <form.Field name={`risks[${i}].likelihood`}>
                      {(field) => (
                        <Select
                          value={field.state.value}
                          onValueChange={(val) => {
                            if (val)
                              field.handleChange(
                                val as (typeof LIKELIHOODS)[number]
                              );
                          }}
                        >
                          <SelectTrigger size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LIKELIHOODS.map((l) => (
                              <SelectItem key={l} value={l}>
                                {l}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </form.Field>

                    <form.Field name={`risks[${i}].impact`}>
                      {(field) => (
                        <Select
                          value={field.state.value}
                          onValueChange={(val) => {
                            if (val)
                              field.handleChange(
                                val as (typeof IMPACTS)[number]
                              );
                          }}
                        >
                          <SelectTrigger size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {IMPACTS.map((imp) => (
                              <SelectItem key={imp} value={imp}>
                                {imp}
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
                      onClick={() => risksField.removeValue(i)}
                      className="text-muted-foreground hover:text-destructive px-2"
                    >
                      x
                    </Button>
                  </div>

                  <form.Field name={`risks[${i}].description`}>
                    {(field) => (
                      <Textarea
                        value={field.state.value ?? ""}
                        onChange={(e) =>
                          field.handleChange(e.target.value || undefined)
                        }
                        onBlur={field.handleBlur}
                        placeholder="Description (e.g. targeting exposed RDP endpoints)"
                        rows={2}
                        className="text-xs resize-none min-h-0"
                      />
                    )}
                  </form.Field>

                  {/* Affected Systems */}
                  <form.Field
                    name={`risks[${i}].affectedSystems`}
                    mode="array"
                  >
                    {(field) => (
                      <div>
                        <div className="flex flex-wrap gap-1 mb-1">
                          <span className="text-[10px] text-muted-foreground leading-6">
                            Affected Systems:
                          </span>
                          {(field.state.value ?? []).map((sys, si) => (
                            <Badge
                              key={si}
                              variant="outline"
                              className="text-[10px] gap-0.5"
                            >
                              {sys}
                              <button
                                type="button"
                                onClick={() => field.removeValue(si)}
                                className="text-muted-foreground hover:text-destructive leading-none"
                              >
                                x
                              </button>
                            </Badge>
                          ))}
                        </div>
                        <div className="flex gap-1">
                          <Input
                            type="text"
                            value={affectedInputs[i] ?? ""}
                            onChange={(e) =>
                              setAffectedInputs({
                                ...affectedInputs,
                                [i]: e.target.value,
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const text = (
                                  affectedInputs[i] ?? ""
                                ).trim();
                                if (text) {
                                  field.pushValue(text);
                                  setAffectedInputs({
                                    ...affectedInputs,
                                    [i]: "",
                                  });
                                }
                              }
                            }}
                            placeholder="Add affected system..."
                            className="flex-1 text-xs h-6"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const text = (affectedInputs[i] ?? "").trim();
                              if (text) {
                                field.pushValue(text);
                                setAffectedInputs({
                                  ...affectedInputs,
                                  [i]: "",
                                });
                              }
                            }}
                            className="h-6 text-[10px] px-2"
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                    )}
                  </form.Field>

                  {/* Mitigations */}
                  <form.Field name={`risks[${i}].mitigations`} mode="array">
                    {(field) => (
                      <div>
                        <div className="flex flex-wrap gap-1 mb-1">
                          <span className="text-[10px] text-muted-foreground leading-6">
                            Mitigations:
                          </span>
                          {(field.state.value ?? []).map((m, mi) => (
                            <Badge
                              key={mi}
                              variant="outline"
                              className="text-[10px] gap-0.5"
                            >
                              {m}
                              <button
                                type="button"
                                onClick={() => field.removeValue(mi)}
                                className="text-muted-foreground hover:text-destructive leading-none"
                              >
                                x
                              </button>
                            </Badge>
                          ))}
                        </div>
                        <div className="flex gap-1">
                          <Input
                            type="text"
                            value={mitigationInputs[i] ?? ""}
                            onChange={(e) =>
                              setMitigationInputs({
                                ...mitigationInputs,
                                [i]: e.target.value,
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const text = (
                                  mitigationInputs[i] ?? ""
                                ).trim();
                                if (text) {
                                  field.pushValue(text);
                                  setMitigationInputs({
                                    ...mitigationInputs,
                                    [i]: "",
                                  });
                                }
                              }
                            }}
                            placeholder="Add mitigation..."
                            className="flex-1 text-xs h-6"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const text = (
                                mitigationInputs[i] ?? ""
                              ).trim();
                              if (text) {
                                field.pushValue(text);
                                setMitigationInputs({
                                  ...mitigationInputs,
                                  [i]: "",
                                });
                              }
                            }}
                            className="h-6 text-[10px] px-2"
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                    )}
                  </form.Field>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  risksField.pushValue({
                    name: "",
                    likelihood: "medium",
                    impact: "medium",
                  })
                }
                className="border-dashed"
              >
                + Add Risk
              </Button>
            </div>
          )}
        </form.Field>
      </CardContent>
    </Card>
  );
}
