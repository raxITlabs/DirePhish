"use client";

import { useState } from "react";
import type { DossierForm } from "@/app/lib/dossier-schema";
import { Input } from "@/app/components/ui/input";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Switch } from "@/app/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/app/components/ui/select";
import DossierSectionCard from "./DossierSectionCard";

const FREQUENCIES = ["real-time", "batch", "hourly", "daily"] as const;

export default function DataFlowsSection({ form }: { form: DossierForm }) {
  const [dataTypeInputs, setDataTypeInputs] = useState<Record<number, string>>({});

  return (
    <form.Field name="dataFlows" mode="array">
      {(flowsField) => {
        const flows = flowsField.state.value ?? [];
        return (
          <DossierSectionCard title="Data Flows" count={flows.length}>
            <div className="space-y-3">
              {flows.length === 0 && (
                <p className="text-xs font-mono text-muted-foreground">No data flows — simulation will infer from systems.</p>
              )}
              {flows.map((_f, i) => (
                <div key={i} className="space-y-1.5 border border-border rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5">
                    <form.Field name={`dataFlows[${i}].source`}>
                      {(field) => (
                        <Input
                          type="text"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="Source system"
                          className="text-xs flex-1"
                        />
                      )}
                    </form.Field>
                    <span className="text-royal-azure-500 font-mono text-sm font-bold shrink-0 px-1">&rarr;</span>
                    <form.Field name={`dataFlows[${i}].target`}>
                      {(field) => (
                        <Input
                          type="text"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="Target system"
                          className="text-xs flex-1"
                        />
                      )}
                    </form.Field>
                    <form.Field name={`dataFlows[${i}].encrypted`}>
                      {(field) => (
                        <div className="flex items-center gap-1 shrink-0" title="Encrypted">
                          <Switch checked={field.state.value ?? false} onCheckedChange={field.handleChange} />
                          <span className={`text-[9px] font-mono ${field.state.value ? "text-verdigris-700" : "text-burnt-peach-600"}`}>
                            {field.state.value ? "ENC" : "PLAIN"}
                          </span>
                        </div>
                      )}
                    </form.Field>
                    <Button type="button" variant="ghost" size="sm" onClick={() => flowsField.removeValue(i)} className="text-muted-foreground hover:text-destructive px-2">x</Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <form.Field name={`dataFlows[${i}].protocol`}>
                      {(field) => (
                        <Input
                          type="text"
                          value={field.state.value ?? ""}
                          onChange={(e) => field.handleChange(e.target.value || undefined)}
                          placeholder="Protocol"
                          className="text-xs w-24"
                        />
                      )}
                    </form.Field>
                    <form.Field name={`dataFlows[${i}].frequency`}>
                      {(field) => (
                        <Select value={field.state.value ?? ""} onValueChange={(v) => { if (v) field.handleChange(v); }}>
                          <SelectTrigger size="sm"><SelectValue placeholder="Freq" /></SelectTrigger>
                          <SelectContent>
                            {FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </form.Field>
                    <form.Field name={`dataFlows[${i}].dataTypes`}>
                      {(field) => {
                        const types = field.state.value ?? [];
                        const input = dataTypeInputs[i] || "";
                        const add = () => {
                          if (!input.trim()) return;
                          field.handleChange([...types, input.trim()]);
                          setDataTypeInputs((p) => ({ ...p, [i]: "" }));
                        };
                        return (
                          <div className="flex items-center gap-1 flex-1">
                            {types.map((t, ti) => (
                              <Badge key={ti} variant="secondary" className="text-[10px] gap-1 shrink-0">
                                {t}
                                <button type="button" onClick={() => field.handleChange(types.filter((_, idx) => idx !== ti))} className="hover:text-destructive">x</button>
                              </Badge>
                            ))}
                            <Input
                              value={input}
                              onChange={(e) => setDataTypeInputs((p) => ({ ...p, [i]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
                              placeholder="Data type..."
                              className="text-xs w-20 flex-1"
                            />
                          </div>
                        );
                      }}
                    </form.Field>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => flowsField.pushValue({ source: "", target: "", dataTypes: [], encrypted: true })}
                className="border-dashed"
              >
                + Add Data Flow
              </Button>
            </div>
          </DossierSectionCard>
        );
      }}
    </form.Field>
  );
}
