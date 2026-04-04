"use client";

import { useState } from "react";
import type { DossierForm } from "@/app/lib/dossier-schema";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
} from "@/app/components/ui/card";
import { AsciiSectionHeader } from "@/app/components/ascii/DesignSystem";

interface ComplianceSectionProps {
  form: DossierForm;
}

export default function ComplianceSection({ form }: ComplianceSectionProps) {
  const [input, setInput] = useState("");

  return (
    <Card className="rounded-xl">
      <div className="px-4 pt-4 pb-1">
        <AsciiSectionHeader>Compliance Frameworks</AsciiSectionHeader>
      </div>
      <CardContent>
        <form.Field name="compliance" mode="array">
          {(field) => (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {(field.state.value ?? []).length === 0 && (
                  <span className="text-sm text-muted-foreground">
                    No compliance frameworks added.
                  </span>
                )}
                {(field.state.value ?? []).map((tag, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="gap-1 font-mono"
                  >
                    {tag}
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
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const trimmed = input.trim().toUpperCase();
                      if (trimmed) {
                        field.pushValue(trimmed);
                        setInput("");
                      }
                    }
                  }}
                  placeholder="Add framework (e.g. PCI-DSS) and press Enter"
                  className="flex-1 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const trimmed = input.trim().toUpperCase();
                    if (trimmed) {
                      field.pushValue(trimmed);
                      setInput("");
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
