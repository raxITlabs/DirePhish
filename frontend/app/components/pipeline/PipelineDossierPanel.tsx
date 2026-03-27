"use client";

import { useForm } from "@tanstack/react-form";
import type { CompanyDossier } from "@/app/types";
import type { DossierFormValues, DossierForm } from "@/app/lib/dossier-schema";
import { Button } from "@/app/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/app/components/ui/tabs";
import CompanySection from "./dossier/CompanySection";
import OrgSection from "./dossier/OrgSection";
import SystemsSection from "./dossier/SystemsSection";
import ComplianceSection from "./dossier/ComplianceSection";
import SecuritySection from "./dossier/SecuritySection";
import RisksSection from "./dossier/RisksSection";
import EventsSection from "./dossier/EventsSection";
import VendorsSection from "./dossier/VendorsSection";
import DataFlowsSection from "./dossier/DataFlowsSection";
import AccessSection from "./dossier/AccessSection";
import NetworkSection from "./dossier/NetworkSection";

interface PipelineDossierPanelProps {
  dossier: CompanyDossier;
  onConfirm: (editedDossier: CompanyDossier) => void;
  confirming: boolean;
}

export default function PipelineDossierPanel({
  dossier,
  onConfirm,
  confirming,
}: PipelineDossierPanelProps) {
  const form = useForm({
    defaultValues: dossier as DossierFormValues,
    onSubmit: ({ value }) => {
      onConfirm(value as CompanyDossier);
    },
  }) as unknown as DossierForm;

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Fixed header */}
      <div className="px-5 py-4 border-b border-border/10 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm font-semibold text-foreground">
            Company Dossier
          </h2>
          <span className="flex items-center gap-1.5 text-[10px] font-mono text-primary">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
            Review
          </span>
        </div>
        <p className="text-xs font-mono text-muted-foreground mt-1">
          Review and edit the research findings, then confirm to continue.
        </p>
      </div>

      {/* Tabbed body */}
      <Tabs defaultValue="company" className="flex-1 flex flex-col min-h-0">
        <div className="px-5 pt-3 shrink-0 border-b border-border/10">
          <TabsList variant="line" className="w-full grid grid-cols-3">
            <TabsTrigger value="company" className="font-mono text-[11px] data-active:text-royal-azure-700 after:bg-royal-azure-500">Company</TabsTrigger>
            <TabsTrigger value="infra" className="font-mono text-[11px] data-active:text-royal-azure-700 after:bg-royal-azure-500">Infrastructure</TabsTrigger>
            <TabsTrigger value="risk" className="font-mono text-[11px] data-active:text-royal-azure-700 after:bg-royal-azure-500">Risk & Intel</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="company" className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          <CompanySection form={form} />
          <OrgSection form={form} />
          <ComplianceSection form={form} />
          <SecuritySection form={form} />
        </TabsContent>

        <TabsContent value="infra" className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          <SystemsSection form={form} />
          <VendorsSection form={form} />
          <DataFlowsSection form={form} />
          <NetworkSection form={form} />
        </TabsContent>

        <TabsContent value="risk" className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          <RisksSection form={form} />
          <AccessSection form={form} />
          <EventsSection form={form} />
        </TabsContent>
      </Tabs>

      {/* Fixed footer */}
      <div className="px-5 py-3 border-t border-border/10 shrink-0">
        <Button
          type="button"
          disabled={confirming}
          className="w-full font-mono text-sm"
          onClick={() => form.handleSubmit()}
        >
          {confirming ? "Confirming..." : "Confirm & Continue"}
        </Button>
      </div>
    </div>
  );
}
