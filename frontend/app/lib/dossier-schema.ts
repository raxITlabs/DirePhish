import { z } from "zod";
import type { ReactFormExtendedApi } from "@tanstack/react-form";

export const orgRoleSchema = z.object({
  title: z.string(),
  department: z.string(),
  reportsTo: z.string(),
  name: z.string().optional(),
  responsibilities: z.string().optional(),
});

export const systemInfoSchema = z.object({
  name: z.string(),
  category: z.enum([
    "database",
    "infrastructure",
    "application",
    "security",
    "communication",
    "cloud",
    "cicd",
    "identity",
  ]),
  criticality: z.enum(["low", "medium", "high", "critical"]),
  vendor: z.string().optional(),
  description: z.string().optional(),
});

export const riskInfoSchema = z.object({
  name: z.string(),
  likelihood: z.enum(["low", "medium", "high"]),
  impact: z.enum(["low", "medium", "high", "critical"]),
  description: z.string().optional(),
  affectedSystems: z.array(z.string()).optional(),
  mitigations: z.array(z.string()).optional(),
});

export const eventInfoSchema = z.object({
  date: z.string(),
  description: z.string(),
  source: z.string(),
  category: z
    .enum([
      "breach",
      "acquisition",
      "leadership_change",
      "regulatory",
      "product_launch",
      "layoff",
      "other",
    ])
    .optional(),
  impact: z.string().optional(),
});

export const securityPostureSchema = z.object({
  certifications: z.array(z.string()).optional(),
  securityTeamSize: z.number().optional(),
  securityTools: z.array(z.string()).optional(),
  incidentResponsePlan: z.boolean().optional(),
  bugBountyProgram: z.boolean().optional(),
});

export const dossierSchema = z.object({
  company: z.object({
    name: z.string(),
    industry: z.string(),
    size: z.string(),
    employeeCount: z.number().optional(),
    foundedYear: z.number().optional(),
    revenue: z.string().optional(),
    products: z.array(z.string()),
    geography: z.string(),
    publicCompany: z.boolean(),
    website: z.string().optional(),
    description: z.string().optional(),
  }),
  org: z.object({
    departments: z.array(z.string()),
    roles: z.array(orgRoleSchema),
  }),
  systems: z.array(systemInfoSchema),
  compliance: z.array(z.string()),
  risks: z.array(riskInfoSchema),
  recentEvents: z.array(eventInfoSchema),
  securityPosture: securityPostureSchema.optional(),
});

export type DossierFormValues = z.infer<typeof dossierSchema>;

/**
 * Convenience type for the TanStack Form instance typed to the dossier schema.
 * Uses `any` for validator slots so the type works regardless of how
 * validators are configured at the call site.
 */
export type DossierForm = ReactFormExtendedApi<
  DossierFormValues,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined
>;
