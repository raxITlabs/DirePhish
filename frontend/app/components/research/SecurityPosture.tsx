// frontend/app/components/research/SecurityPosture.tsx
"use client";

import { useState } from "react";
import type { SecurityPosture as SecurityPostureType } from "@/app/types";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";

interface Props {
  securityPosture: SecurityPostureType;
  onChange: (securityPosture: SecurityPostureType) => void;
}

export default function SecurityPosture({ securityPosture, onChange }: Props) {
  const [certInput, setCertInput] = useState("");
  const [toolInput, setToolInput] = useState("");

  const update = (field: keyof SecurityPostureType, value: unknown) => {
    onChange({ ...securityPosture, [field]: value });
  };

  const addCert = () => {
    const trimmed = certInput.trim();
    if (!trimmed) return;
    const current = securityPosture.certifications ?? [];
    if (current.includes(trimmed)) return;
    update("certifications", [...current, trimmed]);
    setCertInput("");
  };

  const removeCert = (index: number) => {
    update("certifications", (securityPosture.certifications ?? []).filter((_, i) => i !== index));
  };

  const addTool = () => {
    const trimmed = toolInput.trim();
    if (!trimmed) return;
    const current = securityPosture.securityTools ?? [];
    if (current.includes(trimmed)) return;
    update("securityTools", [...current, trimmed]);
    setToolInput("");
  };

  const removeTool = (index: number) => {
    update("securityTools", (securityPosture.securityTools ?? []).filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {/* Certifications */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1">Certifications</Label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {(securityPosture.certifications ?? []).length === 0 && (
            <span className="text-xs text-muted-foreground">None added.</span>
          )}
          {(securityPosture.certifications ?? []).map((cert, i) => (
            <Badge key={i} variant="outline" className="gap-1 font-mono text-xs">
              {cert}
              <button
                onClick={() => removeCert(i)}
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
                addCert();
              }
            }}
            placeholder="Add certification (e.g. SOC 2 Type II)"
            className="flex-1 text-xs"
          />
          <Button variant="outline" size="sm" onClick={addCert}>
            Add
          </Button>
        </div>
      </div>

      {/* Security Tools */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1">Security Tools</Label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {(securityPosture.securityTools ?? []).length === 0 && (
            <span className="text-xs text-muted-foreground">None added.</span>
          )}
          {(securityPosture.securityTools ?? []).map((tool, i) => (
            <Badge key={i} variant="outline" className="gap-1 text-xs">
              {tool}
              <button
                onClick={() => removeTool(i)}
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
                addTool();
              }
            }}
            placeholder="Add tool (e.g. CrowdStrike, Splunk)"
            className="flex-1 text-xs"
          />
          <Button variant="outline" size="sm" onClick={addTool}>
            Add
          </Button>
        </div>
      </div>

      {/* Team size */}
      <div className="w-48">
        <Label className="text-xs text-muted-foreground mb-1">Security Team Size</Label>
        <Input
          type="number"
          value={securityPosture.securityTeamSize ?? ""}
          onChange={(e) =>
            update("securityTeamSize", e.target.value ? Number(e.target.value) : undefined)
          }
          placeholder="e.g. 15"
          className="text-sm"
        />
      </div>

      {/* Checkboxes */}
      <div className="flex gap-6">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="irPlan"
            checked={securityPosture.incidentResponsePlan ?? false}
            onChange={(e) => update("incidentResponsePlan", e.target.checked)}
            className="w-4 h-4 rounded accent-primary"
          />
          <label htmlFor="irPlan" className="text-sm cursor-pointer">
            Incident Response Plan
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="bugBounty"
            checked={securityPosture.bugBountyProgram ?? false}
            onChange={(e) => update("bugBountyProgram", e.target.checked)}
            className="w-4 h-4 rounded accent-primary"
          />
          <label htmlFor="bugBounty" className="text-sm cursor-pointer">
            Bug Bounty Program
          </label>
        </div>
      </div>
    </div>
  );
}
