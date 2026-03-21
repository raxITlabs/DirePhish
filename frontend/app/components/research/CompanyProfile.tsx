// frontend/app/components/research/CompanyProfile.tsx
"use client";

import { useState } from "react";
import type { CompanyDossier } from "@/app/types";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";

interface Props {
  company: CompanyDossier["company"];
  onChange: (company: CompanyDossier["company"]) => void;
}

export default function CompanyProfile({ company, onChange }: Props) {
  const [newProduct, setNewProduct] = useState("");

  const update = (field: keyof CompanyDossier["company"], value: unknown) => {
    onChange({ ...company, [field]: value });
  };

  const addProduct = () => {
    const trimmed = newProduct.trim();
    if (!trimmed) return;
    update("products", [...company.products, trimmed]);
    setNewProduct("");
  };

  const removeProduct = (index: number) => {
    update(
      "products",
      company.products.filter((_, i) => i !== index)
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground mb-1">
            Company Name
          </Label>
          <Input
            type="text"
            value={company.name}
            onChange={(e) => update("name", e.target.value)}
            className="text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1">
            Industry
          </Label>
          <Input
            type="text"
            value={company.industry}
            onChange={(e) => update("industry", e.target.value)}
            className="text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground mb-1">
            Company Size
          </Label>
          <select
            value={company.size}
            onChange={(e) => update("size", e.target.value)}
            className="w-full h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1">
            Geography
          </Label>
          <Input
            type="text"
            value={company.geography}
            onChange={(e) => update("geography", e.target.value)}
            placeholder="e.g. US, EU"
            className="text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground mb-1">
            Employees
          </Label>
          <Input
            type="number"
            value={company.employeeCount ?? ""}
            onChange={(e) =>
              update("employeeCount", e.target.value ? Number(e.target.value) : undefined)
            }
            placeholder="e.g. 2500"
            className="text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1">
            Founded
          </Label>
          <Input
            type="number"
            value={company.foundedYear ?? ""}
            onChange={(e) =>
              update("foundedYear", e.target.value ? Number(e.target.value) : undefined)
            }
            placeholder="e.g. 2012"
            className="text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1">
            Revenue
          </Label>
          <Input
            type="text"
            value={company.revenue ?? ""}
            onChange={(e) => update("revenue", e.target.value || undefined)}
            placeholder="e.g. $200M"
            className="text-sm"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground mb-1">
          Website
        </Label>
        <Input
          type="text"
          value={company.website ?? ""}
          onChange={(e) => update("website", e.target.value || undefined)}
          placeholder="https://..."
          className="text-sm"
        />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground mb-1">
          Description
        </Label>
        <textarea
          value={company.description ?? ""}
          onChange={(e) => update("description", e.target.value || undefined)}
          placeholder="Brief company description..."
          rows={2}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
        />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground mb-1">
          Products / Services
        </Label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {company.products.map((product, i) => (
            <Badge key={i} variant="outline" className="gap-1">
              {product}
              <button
                onClick={() => removeProduct(i)}
                className="text-muted-foreground hover:text-foreground leading-none"
              >
                x
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            type="text"
            value={newProduct}
            onChange={(e) => setNewProduct(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addProduct();
              }
            }}
            placeholder="Add product/service..."
            className="flex-1 text-sm"
          />
          <Button variant="outline" size="sm" onClick={addProduct}>
            Add
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="publicCompany"
          checked={company.publicCompany}
          onChange={(e) => update("publicCompany", e.target.checked)}
          className="w-4 h-4 rounded accent-primary"
        />
        <label htmlFor="publicCompany" className="text-sm cursor-pointer">
          Publicly traded company
        </label>
      </div>
    </div>
  );
}
