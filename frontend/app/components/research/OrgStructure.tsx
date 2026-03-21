// frontend/app/components/research/OrgStructure.tsx
"use client";

import type { OrgRole } from "@/app/types";
import type { CompanyDossier } from "@/app/types";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";

interface Props {
  org: CompanyDossier["org"];
  onChange: (org: CompanyDossier["org"]) => void;
}

const EMPTY_ROLE: OrgRole = { title: "", department: "", reportsTo: "" };

export default function OrgStructure({ org, onChange }: Props) {
  const updateRole = (index: number, field: keyof OrgRole, value: string) => {
    const updated = org.roles.map((role, i) =>
      i === index ? { ...role, [field]: value } : role
    );
    onChange({ ...org, roles: updated });
  };

  const addRole = () => {
    onChange({ ...org, roles: [...org.roles, { ...EMPTY_ROLE }] });
  };

  const removeRole = (index: number) => {
    onChange({ ...org, roles: org.roles.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-2">
      {org.roles.length === 0 && (
        <p className="text-sm text-muted-foreground">No roles defined.</p>
      )}
      {org.roles.map((role, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center"
        >
          <Input
            type="text"
            value={role.title}
            onChange={(e) => updateRole(i, "title", e.target.value)}
            placeholder="Title (e.g. CISO)"
            className="text-xs"
          />
          <Input
            type="text"
            value={role.department}
            onChange={(e) => updateRole(i, "department", e.target.value)}
            placeholder="Department"
            className="text-xs"
          />
          <Input
            type="text"
            value={role.reportsTo}
            onChange={(e) => updateRole(i, "reportsTo", e.target.value)}
            placeholder="Reports to"
            className="text-xs"
          />
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => removeRole(i)}
            className="text-muted-foreground hover:text-destructive"
          >
            x
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addRole} className="border-dashed">
        + Add Role
      </Button>
    </div>
  );
}
