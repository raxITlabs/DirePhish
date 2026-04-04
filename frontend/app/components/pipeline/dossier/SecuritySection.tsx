"use client";

import { useState } from "react";
import type { DossierForm } from "@/app/lib/dossier-schema";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Switch } from "@/app/components/ui/switch";
import {
  Card,
  CardContent,
} from "@/app/components/ui/card";
import { AsciiSectionHeader } from "@/app/components/ascii/DesignSystem";

interface SecuritySectionProps {
  form: DossierForm;
}

export default function SecuritySection({ form }: SecuritySectionProps) {
  const [certInput, setCertInput] = useState("");
  const [toolInput, setToolInput] = useState("");

  return (
    <Card className="rounded-xl">
      <div className="px-4 pt-4 pb-1">
        <AsciiSectionHeader>Security Posture</AsciiSectionHeader>
      </div>
      <CardContent className="space-y-4">
        {/* Team Size */}
        <form.Field name="securityPosture.securityTeamSize">
          {(field) => (
            <div className="w-48">
              <Label className="text-xs text-muted-foreground mb-1">
                Security Team Size
              </Label>
              <Input
                type="number"
                value={field.state.value ?? ""}
                onChange={(e) =>
                  field.handleChange(
                    e.target.value ? Number(e.target.value) : undefined
                  )
                }
                onBlur={field.handleBlur}
                placeholder="e.g. 15"
                className="text-sm"
              />
            </div>
          )}
        </form.Field>

        {/* Switches */}
        <div className="flex gap-6">
          <form.Field name="securityPosture.incidentResponsePlan">
            {(field) => (
              <div className="flex items-center gap-2">
                <Switch
                  checked={field.state.value ?? false}
                  onCheckedChange={(checked) => field.handleChange(checked)}
                />
                <Label className="text-sm cursor-pointer">
                  Incident Response Plan
                </Label>
              </div>
            )}
          </form.Field>

          <form.Field name="securityPosture.bugBountyProgram">
            {(field) => (
              <div className="flex items-center gap-2">
                <Switch
                  checked={field.state.value ?? false}
                  onCheckedChange={(checked) => field.handleChange(checked)}
                />
                <Label className="text-sm cursor-pointer">
                  Bug Bounty Program
                </Label>
              </div>
            )}
          </form.Field>
        </div>

        {/* Certifications */}
        <form.Field name="securityPosture.certifications" mode="array">
          {(field) => (
            <div>
              <Label className="text-xs text-muted-foreground mb-1">
                Certifications
              </Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(field.state.value ?? []).length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    None added.
                  </span>
                )}
                {(field.state.value ?? []).map((cert, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="gap-1 font-mono text-xs"
                  >
                    {cert}
                    <button
                      type="button"
                      onClick={() => field.removeValue(i)}
                      className="text-muted-foreground hover:text-destructive leading-none"
                    >
                      x
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={certInput}
                  onChange={(e) => setCertInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const trimmed = certInput.trim();
                      if (trimmed) {
                        field.pushValue(trimmed);
                        setCertInput("");
                      }
                    }
                  }}
                  placeholder="Add certification (e.g. SOC 2 Type II)"
                  className="flex-1 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const trimmed = certInput.trim();
                    if (trimmed) {
                      field.pushValue(trimmed);
                      setCertInput("");
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          )}
        </form.Field>

        {/* Security Tools */}
        <form.Field name="securityPosture.securityTools" mode="array">
          {(field) => (
            <div>
              <Label className="text-xs text-muted-foreground mb-1">
                Security Tools
              </Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(field.state.value ?? []).length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    None added.
                  </span>
                )}
                {(field.state.value ?? []).map((tool, i) => (
                  <Badge key={i} variant="outline" className="gap-1 text-xs">
                    {tool}
                    <button
                      type="button"
                      onClick={() => field.removeValue(i)}
                      className="text-muted-foreground hover:text-destructive leading-none"
                    >
                      x
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={toolInput}
                  onChange={(e) => setToolInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const trimmed = toolInput.trim();
                      if (trimmed) {
                        field.pushValue(trimmed);
                        setToolInput("");
                      }
                    }
                  }}
                  placeholder="Add tool (e.g. CrowdStrike, Splunk)"
                  className="flex-1 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const trimmed = toolInput.trim();
                    if (trimmed) {
                      field.pushValue(trimmed);
                      setToolInput("");
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          )}
        </form.Field>
      </CardContent>
    </Card>
  );
}
