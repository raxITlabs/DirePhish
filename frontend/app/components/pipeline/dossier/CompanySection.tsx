"use client";

import { useState } from "react";
import type { DossierForm } from "@/app/lib/dossier-schema";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Label } from "@/app/components/ui/label";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Switch } from "@/app/components/ui/switch";
import {
  Card,
  CardContent,
} from "@/app/components/ui/card";
import { AsciiSectionHeader } from "@/app/components/ascii/DesignSystem";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/app/components/ui/select";

interface CompanySectionProps {
  form: DossierForm;
}

const SIZE_OPTIONS = ["small", "medium", "large", "enterprise"] as const;

export default function CompanySection({ form }: CompanySectionProps) {
  const [newProduct, setNewProduct] = useState("");

  return (
    <Card className="rounded-xl">
      <div className="px-4 pt-4 pb-1">
        <AsciiSectionHeader>Company Profile</AsciiSectionHeader>
      </div>
      <CardContent className="space-y-4">
        {/* Name + Industry */}
        <div className="grid grid-cols-2 gap-3">
          <form.Field name="company.name">
            {(field) => (
              <div>
                <Label className="text-xs text-muted-foreground mb-1">
                  Company Name
                </Label>
                <Input
                  type="text"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  className="text-sm"
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="text-xs text-destructive mt-1">
                    {field.state.meta.errors.join(", ")}
                  </p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field name="company.industry">
            {(field) => (
              <div>
                <Label className="text-xs text-muted-foreground mb-1">
                  Industry
                </Label>
                <Input
                  type="text"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  className="text-sm"
                />
              </div>
            )}
          </form.Field>
        </div>

        {/* Size + Geography */}
        <div className="grid grid-cols-2 gap-3">
          <form.Field name="company.size">
            {(field) => (
              <div>
                <Label className="text-xs text-muted-foreground mb-1">
                  Company Size
                </Label>
                <Select
                  value={field.state.value}
                  onValueChange={(val) => {
                    if (val) field.handleChange(val);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    {SIZE_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          <form.Field name="company.geography">
            {(field) => (
              <div>
                <Label className="text-xs text-muted-foreground mb-1">
                  Geography
                </Label>
                <Input
                  type="text"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="e.g. US, EU"
                  className="text-sm"
                />
              </div>
            )}
          </form.Field>
        </div>

        {/* Employees, Founded, Revenue */}
        <div className="grid grid-cols-3 gap-3">
          <form.Field name="company.employeeCount">
            {(field) => (
              <div>
                <Label className="text-xs text-muted-foreground mb-1">
                  Employees
                </Label>
                <Input
                  type="number"
                  value={field.state.value ?? ""}
                  onChange={(e) =>
                    field.handleChange(
                      e.target.value ? Number(e.target.value) : undefined
                    )
                  }
                  onBlur={field.handleBlur}
                  placeholder="e.g. 2500"
                  className="text-sm"
                />
              </div>
            )}
          </form.Field>

          <form.Field name="company.foundedYear">
            {(field) => (
              <div>
                <Label className="text-xs text-muted-foreground mb-1">
                  Founded
                </Label>
                <Input
                  type="number"
                  value={field.state.value ?? ""}
                  onChange={(e) =>
                    field.handleChange(
                      e.target.value ? Number(e.target.value) : undefined
                    )
                  }
                  onBlur={field.handleBlur}
                  placeholder="e.g. 2012"
                  className="text-sm"
                />
              </div>
            )}
          </form.Field>

          <form.Field name="company.revenue">
            {(field) => (
              <div>
                <Label className="text-xs text-muted-foreground mb-1">
                  Revenue
                </Label>
                <Input
                  type="text"
                  value={field.state.value ?? ""}
                  onChange={(e) =>
                    field.handleChange(e.target.value || undefined)
                  }
                  onBlur={field.handleBlur}
                  placeholder="e.g. $200M"
                  className="text-sm"
                />
              </div>
            )}
          </form.Field>
        </div>

        {/* Website */}
        <form.Field name="company.website">
          {(field) => (
            <div>
              <Label className="text-xs text-muted-foreground mb-1">
                Website
              </Label>
              <Input
                type="text"
                value={field.state.value ?? ""}
                onChange={(e) =>
                  field.handleChange(e.target.value || undefined)
                }
                onBlur={field.handleBlur}
                placeholder="https://..."
                className="text-sm"
              />
            </div>
          )}
        </form.Field>

        {/* Description */}
        <form.Field name="company.description">
          {(field) => (
            <div>
              <Label className="text-xs text-muted-foreground mb-1">
                Description
              </Label>
              <Textarea
                value={field.state.value ?? ""}
                onChange={(e) =>
                  field.handleChange(e.target.value || undefined)
                }
                onBlur={field.handleBlur}
                placeholder="Brief company description..."
                rows={2}
                className="text-sm resize-none"
              />
            </div>
          )}
        </form.Field>

        {/* Public Company */}
        <form.Field name="company.publicCompany">
          {(field) => (
            <div className="flex items-center gap-2">
              <Switch
                checked={field.state.value}
                onCheckedChange={(checked) => field.handleChange(checked)}
              />
              <Label className="text-sm cursor-pointer">
                Publicly traded company
              </Label>
            </div>
          )}
        </form.Field>

        {/* Products */}
        <form.Field name="company.products" mode="array">
          {(field) => (
            <div>
              <Label className="text-xs text-muted-foreground mb-1">
                Products / Services
              </Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(field.state.value ?? []).map((product, i) => (
                  <Badge key={i} variant="outline" className="gap-1">
                    {product}
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
                  value={newProduct}
                  onChange={(e) => setNewProduct(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const trimmed = newProduct.trim();
                      if (trimmed) {
                        field.pushValue(trimmed);
                        setNewProduct("");
                      }
                    }
                  }}
                  placeholder="Add product/service..."
                  className="flex-1 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const trimmed = newProduct.trim();
                    if (trimmed) {
                      field.pushValue(trimmed);
                      setNewProduct("");
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          )}
        </form.Field>
      </CardContent>
    </Card>
  );
}
