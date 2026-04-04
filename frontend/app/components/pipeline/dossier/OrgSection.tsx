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
  CardContent,
} from "@/app/components/ui/card";
import { AsciiSectionHeader } from "@/app/components/ascii/DesignSystem";

interface OrgSectionProps {
  form: DossierForm;
}

export default function OrgSection({ form }: OrgSectionProps) {
  const [newDept, setNewDept] = useState("");

  return (
    <Card className="rounded-xl">
      <div className="px-4 pt-4 pb-1">
        <AsciiSectionHeader>Organization Structure</AsciiSectionHeader>
      </div>
      <CardContent className="space-y-4">
        {/* Departments */}
        <form.Field name="org.departments" mode="array">
          {(field) => (
            <div>
              <Label className="text-xs text-muted-foreground mb-1">
                Departments
              </Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(field.state.value ?? []).length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    No departments added.
                  </span>
                )}
                {(field.state.value ?? []).map((dept, i) => (
                  <Badge key={i} variant="outline" className="gap-1">
                    {dept}
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
                  value={newDept}
                  onChange={(e) => setNewDept(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const trimmed = newDept.trim();
                      if (trimmed) {
                        field.pushValue(trimmed);
                        setNewDept("");
                      }
                    }
                  }}
                  placeholder="Add department..."
                  className="flex-1 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const trimmed = newDept.trim();
                    if (trimmed) {
                      field.pushValue(trimmed);
                      setNewDept("");
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          )}
        </form.Field>

        {/* Roles */}
        <form.Field name="org.roles" mode="array">
          {(rolesField) => (
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">Roles</Label>
              {(rolesField.state.value ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No roles defined.
                </p>
              )}
              {(rolesField.state.value ?? []).map((_role, i) => (
                <div
                  key={i}
                  className="space-y-1.5 border border-border rounded-lg p-2.5"
                >
                  <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-center">
                    <form.Field name={`org.roles[${i}].name`}>
                      {(field) => (
                        <Input
                          type="text"
                          value={field.state.value ?? ""}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          placeholder="Name"
                          className="text-xs"
                        />
                      )}
                    </form.Field>

                    <form.Field name={`org.roles[${i}].title`}>
                      {(field) => (
                        <Input
                          type="text"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          placeholder="Title (e.g. CISO)"
                          className="text-xs"
                        />
                      )}
                    </form.Field>

                    <form.Field name={`org.roles[${i}].department`}>
                      {(field) => (
                        <Input
                          type="text"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          placeholder="Department"
                          className="text-xs"
                        />
                      )}
                    </form.Field>

                    <form.Field name={`org.roles[${i}].reportsTo`}>
                      {(field) => (
                        <Input
                          type="text"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          placeholder="Reports to"
                          className="text-xs"
                        />
                      )}
                    </form.Field>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => rolesField.removeValue(i)}
                      className="text-muted-foreground hover:text-destructive px-2"
                    >
                      x
                    </Button>
                  </div>

                  <form.Field name={`org.roles[${i}].responsibilities`}>
                    {(field) => (
                      <Textarea
                        value={field.state.value ?? ""}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        placeholder="Responsibilities (e.g. manages SOC team, owns incident response)"
                        rows={2}
                        className="text-xs resize-none min-h-0"
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
                  rolesField.pushValue({
                    title: "",
                    department: "",
                    reportsTo: "",
                    name: "",
                    responsibilities: "",
                  })
                }
                className="border-dashed"
              >
                + Add Role
              </Button>
            </div>
          )}
        </form.Field>
      </CardContent>
    </Card>
  );
}
