// frontend/app/types/project.ts
export interface Project {
  projectId: string;
  companyUrl: string;
  userContext?: string;
  uploadedFiles: string[];
  status: "researching" | "research_complete" | "generating_config" | "config_ready" | "failed";
  progress: number;
  progressMessage: string;
  errorMessage?: string;
  graphId?: string;
  simId?: string;
  createdAt: string;
}

export interface CompanyDossier {
  company: {
    name: string;
    industry: string;
    size: string;
    employeeCount?: number;
    foundedYear?: number;
    revenue?: string;
    products: string[];
    geography: string;
    publicCompany: boolean;
    website?: string;
    description?: string;
  };
  org: {
    departments: string[];
    roles: OrgRole[];
  };
  systems: SystemInfo[];
  compliance: string[];
  risks: RiskInfo[];
  recentEvents: EventInfo[];
  securityPosture?: SecurityPosture;
}

export interface OrgRole {
  title: string;
  department: string;
  reportsTo: string;
  name?: string;
  responsibilities?: string;
}

export interface SystemInfo {
  name: string;
  category: "database" | "infrastructure" | "application" | "security" | "communication" | "cloud" | "cicd" | "identity";
  criticality: "low" | "medium" | "high" | "critical";
  vendor?: string;
  description?: string;
}

export interface RiskInfo {
  name: string;
  likelihood: "low" | "medium" | "high";
  impact: "low" | "medium" | "high" | "critical";
  description?: string;
  affectedSystems?: string[];
  mitigations?: string[];
}

export interface EventInfo {
  date: string;
  description: string;
  source: string;
  category?: "breach" | "acquisition" | "leadership_change" | "regulatory" | "product_launch" | "layoff" | "other";
  impact?: string;
}

export interface SecurityPosture {
  certifications?: string[];
  securityTeamSize?: number;
  securityTools?: string[];
  incidentResponsePlan?: boolean;
  bugBountyProgram?: boolean;
}
