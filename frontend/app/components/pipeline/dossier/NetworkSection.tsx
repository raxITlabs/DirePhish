"use client";

import { useState } from "react";
import type { DossierForm } from "@/app/lib/dossier-schema";
import { Input } from "@/app/components/ui/input";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Switch } from "@/app/components/ui/switch";
import DossierSectionCard from "./DossierSectionCard";

export default function NetworkSection({ form }: { form: DossierForm }) {
  const [systemInputs, setSystemInputs] = useState<Record<number, string>>({});
  const [zoneInputs, setZoneInputs] = useState<Record<number, string>>({});

  return (
    <form.Field name="networkTopology" mode="array">
      {(zonesField) => {
        const zones = zonesField.state.value ?? [];
        return (
          <DossierSectionCard title="Network Topology" count={zones.length}>
            <div className="space-y-3">
              {zones.length === 0 && (
                <p className="text-xs font-mono text-muted-foreground">No zones — simulation will use a flat network model.</p>
              )}
              {zones.map((_z, i) => (
                <div
                  key={i}
                  className={`space-y-1.5 border rounded-lg p-2.5 ${
                    _z.exposedToInternet ? "border-burnt-peach-200 bg-burnt-peach-50/30" : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <form.Field name={`networkTopology[${i}].zone`}>
                      {(field) => (
                        <Input
                          type="text"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="Zone name (e.g. DMZ)"
                          className="text-xs flex-1"
                        />
                      )}
                    </form.Field>
                    <form.Field name={`networkTopology[${i}].exposedToInternet`}>
                      {(field) => (
                        <div className="flex items-center gap-1 shrink-0" title="Internet-facing">
                          <Switch checked={field.state.value ?? false} onCheckedChange={field.handleChange} />
                          <span className={`text-[9px] font-mono ${field.state.value ? "text-burnt-peach-700" : "text-muted-foreground"}`}>
                            {field.state.value ? "EXPOSED" : "Internal"}
                          </span>
                        </div>
                      )}
                    </form.Field>
                    <Button type="button" variant="ghost" size="sm" onClick={() => zonesField.removeValue(i)} className="text-muted-foreground hover:text-destructive px-2">x</Button>
                  </div>

                  {/* Systems in zone */}
                  <form.Field name={`networkTopology[${i}].systems`}>
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
                          <span className="text-[10px] font-mono text-muted-foreground uppercase">Systems</span>
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

                  {/* Connected zones */}
                  <form.Field name={`networkTopology[${i}].connectedZones`}>
                    {(field) => {
                      const connected = field.state.value ?? [];
                      const input = zoneInputs[i] || "";
                      const add = () => {
                        if (!input.trim()) return;
                        field.handleChange([...connected, input.trim()]);
                        setZoneInputs((p) => ({ ...p, [i]: "" }));
                      };
                      return (
                        <div className="space-y-1">
                          <span className="text-[10px] font-mono text-muted-foreground uppercase">Connected Zones</span>
                          <div className="flex flex-wrap gap-1">
                            {connected.map((z, zi) => (
                              <Badge key={zi} variant="outline" className="text-[10px] gap-1">
                                {z}
                                <button type="button" onClick={() => field.handleChange(connected.filter((_, idx) => idx !== zi))} className="hover:text-destructive">x</button>
                              </Badge>
                            ))}
                          </div>
                          <div className="flex gap-1">
                            <Input
                              value={input}
                              onChange={(e) => setZoneInputs((p) => ({ ...p, [i]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
                              placeholder="Zone name..."
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
                onClick={() => zonesField.pushValue({ zone: "", systems: [], exposedToInternet: false, connectedZones: [] })}
                className="border-dashed"
              >
                + Add Zone
              </Button>
            </div>
          </DossierSectionCard>
        );
      }}
    </form.Field>
  );
}
