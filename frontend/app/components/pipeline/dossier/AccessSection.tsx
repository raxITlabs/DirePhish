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

const PRIVILEGE_LEVELS = ["admin", "read-write", "read-only", "operator"] as const;

export default function AccessSection({ form }: { form: DossierForm }) {
  const [systemInputs, setSystemInputs] = useState<Record<number, string>>({});

  return (
    <form.Field name="accessMappings" mode="array">
      {(mappingsField) => {
        const mappings = mappingsField.state.value ?? [];
        return (
          <DossierSectionCard title="Access Control" count={mappings.length}>
            <div className="space-y-3">
              {mappings.length === 0 && (
                <p className="text-xs font-mono text-muted-foreground">No access mappings — simulation will infer from roles.</p>
              )}
              {mappings.map((_m, i) => (
                <div key={i} className="space-y-1.5 border border-border rounded-lg p-2.5">
                  <div className="flex items-center gap-2">
                    <form.Field name={`accessMappings[${i}].role`}>
                      {(field) => (
                        <Input
                          type="text"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="Role title"
                          className="text-xs flex-1"
                        />
                      )}
                    </form.Field>
                    <form.Field name={`accessMappings[${i}].privilegeLevel`}>
                      {(field) => (
                        <Select value={field.state.value} onValueChange={(v) => { if (v) field.handleChange(v as typeof PRIVILEGE_LEVELS[number]); }}>
                          <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PRIVILEGE_LEVELS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </form.Field>
                    <form.Field name={`accessMappings[${i}].mfaRequired`}>
                      {(field) => (
                        <div className="flex items-center gap-1 shrink-0" title="MFA Required">
                          <Switch checked={field.state.value ?? false} onCheckedChange={field.handleChange} />
                          <span className={`text-[9px] font-mono ${field.state.value ? "text-verdigris-700" : "text-muted-foreground"}`}>MFA</span>
                        </div>
                      )}
                    </form.Field>
                    <Button type="button" variant="ghost" size="sm" onClick={() => mappingsField.removeValue(i)} className="text-muted-foreground hover:text-destructive px-2">x</Button>
                  </div>
                  <form.Field name={`accessMappings[${i}].systems`}>
                    {(field) => {
                      const systems = field.state.value ?? [];
                      const input = systemInputs[i] || "";
                      const add = () => {
                        if (!input.trim()) return;
                        field.handleChange([...systems, input.trim()]);
                        setSystemInputs((p) => ({ ...p, [i]: "" }));
                      };
                      return (
                        <div className="space-y-1">
                          <div className="flex flex-wrap gap-1">
                            {systems.map((s, si) => (
                              <Badge key={si} variant="secondary" className="text-[10px] gap-1">
                                {s}
                                <button type="button" onClick={() => field.handleChange(systems.filter((_, idx) => idx !== si))} className="hover:text-destructive">x</button>
                              </Badge>
                            ))}
                          </div>
                          <div className="flex gap-1">
                            <Input
                              value={input}
                              onChange={(e) => setSystemInputs((p) => ({ ...p, [i]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
                              placeholder="System name..."
                              className="text-xs flex-1"
                            />
                            <Button type="button" variant="outline" size="sm" onClick={add}>Add</Button>
                          </div>
                        </div>
                      );
                    }}
                  </form.Field>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => mappingsField.pushValue({ role: "", systems: [], privilegeLevel: "read-only", mfaRequired: true })}
                className="border-dashed"
              >
                + Add Access Mapping
              </Button>
            </div>
          </DossierSectionCard>
        );
      }}
    </form.Field>
  );
}
