// frontend/app/types/project.ts
import type { KillChainStep } from "./simulation";

export interface Project {
  projectId: string;
  companyUrl: string;
  userContext?: string;
  uploadedFiles: string[];
  status: "researching" | "research_complete" | "analyzing_threats" | "scenarios_ready" | "generating_config" | "config_ready" | "generating_configs" | "configs_ready" | "failed";
  progress: number;
  progressMessage: string;
  errorMessage?: string;
  graphId?: string;
  simId?: string;
  simIds?: string[];
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
  vendorEntities?: VendorEntity[];
  dataFlows?: DataFlow[];
  accessMappings?: AccessMapping[];
  networkTopology?: NetworkZone[];
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

export interface VendorEntity {
  name: string;
  category: string;
  criticality: "low" | "medium" | "high" | "critical";
  systemsProvided: string[];
  contractType?: string;
  singlePointOfFailure?: boolean;
}

export interface DataFlow {
  source: string;
  target: string;
  dataTypes: string[];
  protocol?: string;
  encrypted?: boolean;
  frequency?: string;
}

export interface AccessMapping {
  role: string;
  systems: string[];
  privilegeLevel: "admin" | "read-write" | "read-only" | "operator";
  mfaRequired?: boolean;
}

export interface NetworkZone {
  zone: string;
  systems: string[];
  exposedToInternet: boolean;
  connectedZones?: string[];
}

export interface SecurityPosture {
  certifications?: string[];
  securityTeamSize?: number;
  securityTools?: string[];
  incidentResponsePlan?: boolean;
  bugBountyProgram?: boolean;
}

export interface ScenarioVariant {
  id: string;
  title: string;
  probability: number;
  severity: string;
  summary: string;
  affectedTeams: string[];
  attackPathId: string;
  quadrant: string;
  evidence: string[];
}

export interface ThreatAnalysisResponse {
  scenarios: ScenarioVariant[];
  uncertaintyAxes: {
    axis1: { name: string; low: string; high: string };
    axis2: { name: string; low: string; high: string };
  };
  attackPaths: Array<{
    id: string;
    title: string;
    killChain: KillChainStep[];
    expectedOutcome: string;
  }>;
}

export interface ComparativeReport {
  projectId: string;
  simIds: string[];
  status: string;
  executiveSummary?: string;
  comparisonMatrix?: Array<{
    scenario: string;
    responseSpeed: number;
    containmentEffectiveness: number;
    communicationQuality: number;
    complianceAdherence: number;
    leadershipDecisiveness: number;
  }>;
  consistentWeaknesses?: string[];
  scenarioFindings?: Array<{
    scenario: string;
    strengths: string[];
    weaknesses: string[];
    notableMoments: string[];
  }>;
  recommendations?: Array<{
    priority: number;
    recommendation: string;
    addressesScenarios: string[];
    impact: string;
  }>;
  error?: string;
}
