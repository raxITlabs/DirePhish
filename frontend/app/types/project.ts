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
    products: string[];
    geography: string;
    publicCompany: boolean;
  };
  org: {
    departments: string[];
    roles: OrgRole[];
  };
  systems: SystemInfo[];
  compliance: string[];
  risks: RiskInfo[];
  recentEvents: EventInfo[];
}

export interface OrgRole {
  title: string;
  department: string;
  reportsTo: string;
}

export interface SystemInfo {
  name: string;
  category: string;
  criticality: "low" | "medium" | "high" | "critical";
}

export interface RiskInfo {
  name: string;
  likelihood: "low" | "medium" | "high";
  impact: "low" | "medium" | "high" | "critical";
}

export interface EventInfo {
  date: string;
  description: string;
  source: string;
}
