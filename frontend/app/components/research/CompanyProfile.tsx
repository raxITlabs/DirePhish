// frontend/app/components/research/CompanyProfile.tsx
"use client";

import { useState } from "react";
import type { CompanyDossier } from "@/app/types";

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
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Company Name
          </label>
          <input
            type="text"
            value={company.name}
            onChange={(e) => update("name", e.target.value)}
            className="w-full border border-border rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Industry
          </label>
          <input
            type="text"
            value={company.industry}
            onChange={(e) => update("industry", e.target.value)}
            className="w-full border border-border rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Company Size
          </label>
          <select
            value={company.size}
            onChange={(e) => update("size", e.target.value)}
            className="w-full border border-border rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:border-accent"
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Geography
          </label>
          <input
            type="text"
            value={company.geography}
            onChange={(e) => update("geography", e.target.value)}
            placeholder="e.g. US, EU"
            className="w-full border border-border rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">
          Products / Services
        </label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {company.products.map((product, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 bg-background border border-border rounded px-2 py-0.5 text-xs"
            >
              {product}
              <button
                onClick={() => removeProduct(i)}
                className="text-text-tertiary hover:text-foreground leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
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
            className="flex-1 border border-border rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:border-accent"
          />
          <button
            onClick={addProduct}
            className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-background transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="publicCompany"
          checked={company.publicCompany}
          onChange={(e) => update("publicCompany", e.target.checked)}
          className="w-4 h-4 rounded accent-accent"
        />
        <label htmlFor="publicCompany" className="text-sm cursor-pointer">
          Publicly traded company
        </label>
      </div>
    </div>
  );
}
