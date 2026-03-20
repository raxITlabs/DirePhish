// frontend/app/components/research/OrgStructure.tsx
"use client";

import type { OrgRole } from "@/app/types";
import type { CompanyDossier } from "@/app/types";

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
        <p className="text-sm text-text-secondary">No roles defined.</p>
      )}
      {org.roles.map((role, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center"
        >
          <input
            type="text"
            value={role.title}
            onChange={(e) => updateRole(i, "title", e.target.value)}
            placeholder="Title (e.g. CISO)"
            className="border border-border rounded-md px-2 py-1.5 text-xs bg-background focus:outline-none focus:border-accent"
          />
          <input
            type="text"
            value={role.department}
            onChange={(e) => updateRole(i, "department", e.target.value)}
            placeholder="Department"
            className="border border-border rounded-md px-2 py-1.5 text-xs bg-background focus:outline-none focus:border-accent"
          />
          <input
            type="text"
            value={role.reportsTo}
            onChange={(e) => updateRole(i, "reportsTo", e.target.value)}
            placeholder="Reports to"
            className="border border-border rounded-md px-2 py-1.5 text-xs bg-background focus:outline-none focus:border-accent"
          />
          <button
            onClick={() => removeRole(i)}
            className="text-text-tertiary hover:text-severity-critical-text text-xs px-1.5 py-1.5 rounded hover:bg-severity-critical-bg transition-colors"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={addRole}
        className="text-xs px-3 py-1.5 border border-dashed border-border rounded-md hover:bg-background transition-colors text-text-secondary hover:text-foreground"
      >
        + Add Role
      </button>
    </div>
  );
}
