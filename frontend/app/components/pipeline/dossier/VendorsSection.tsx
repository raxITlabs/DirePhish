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

const VENDOR_CATEGORIES = ["security", "cloud", "infrastructure", "saas", "consulting", "networking", "identity"] as const;
const CRITICALITIES = ["low", "medium", "high", "critical"] as const;

export default function VendorsSection({ form }: { form: DossierForm }) {
  const [systemInputs, setSystemInputs] = useState<Record<number, string>>({});

  return (
    <form.Field name="vendorEntities" mode="array">
      {(vendorsField) => {
        const vendors = vendorsField.state.value ?? [];
        return (
          <DossierSectionCard title="Supply Chain" count={vendors.length}>
            <div className="space-y-3">
              {vendors.length === 0 && (
                <p className="text-xs font-mono text-muted-foreground">No vendors — simulation will infer from systems.</p>
              )}
              {vendors.map((_v, i) => (
                <div key={i} className="space-y-1.5 border border-border rounded-lg p-2.5">
                  <div className="flex items-center gap-2">
                    <form.Field name={`vendorEntities[${i}].name`}>
                      {(field) => (
                        <Input
                          type="text"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="Vendor name"
                          className="text-xs flex-1"
                        />
                      )}
                    </form.Field>
                    <form.Field name={`vendorEntities[${i}].category`}>
                      {(field) => (
                        <Select value={field.state.value} onValueChange={(v) => { if (v) field.handleChange(v); }}>
                          <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {VENDOR_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </form.Field>
                    <form.Field name={`vendorEntities[${i}].criticality`}>
                      {(field) => (
                        <Select value={field.state.value} onValueChange={(v) => { if (v) field.handleChange(v as typeof CRITICALITIES[number]); }}>
                          <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CRITICALITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </form.Field>
                    <form.Field name={`vendorEntities[${i}].singlePointOfFailure`}>
                      {(field) => (
                        <div className="flex items-center gap-1 shrink-0">
                          <Switch checked={field.state.value ?? false} onCheckedChange={field.handleChange} />
                          {field.state.value && (
                            <Badge variant="destructive" className="text-[9px]">SPoF</Badge>
                          )}
                        </div>
                      )}
                    </form.Field>
                    <Button type="button" variant="ghost" size="sm" onClick={() => vendorsField.removeValue(i)} className="text-muted-foreground hover:text-destructive px-2">x</Button>
                  </div>
                  <form.Field name={`vendorEntities[${i}].systemsProvided`}>
                    {(field) => {
                      const systems = field.state.value ?? [];
                      const input = systemInputs[i] || "";
                      const addSystem = () => {
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
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSystem(); } }}
                              placeholder="System provided..."
                              className="text-xs flex-1"
                            />
                            <Button type="button" variant="outline" size="sm" onClick={addSystem}>Add</Button>
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
                onClick={() => vendorsField.pushValue({ name: "", category: "saas", criticality: "medium", systemsProvided: [] })}
                className="border-dashed"
              >
                + Add vendor
              </Button>
            </div>
          </DossierSectionCard>
        );
      }}
    </form.Field>
  );
}
