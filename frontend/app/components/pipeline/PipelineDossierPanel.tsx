"use client";

import { useForm } from "@tanstack/react-form";
import type { CompanyDossier } from "@/app/types";
import type { DossierFormValues, DossierForm } from "@/app/lib/dossier-schema";
import { Button } from "@/app/components/ui/button";
import CompanySection from "./dossier/CompanySection";
import OrgSection from "./dossier/OrgSection";
import SystemsSection from "./dossier/SystemsSection";
import ComplianceSection from "./dossier/ComplianceSection";
import SecuritySection from "./dossier/SecuritySection";
import RisksSection from "./dossier/RisksSection";
import EventsSection from "./dossier/EventsSection";

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

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <CompanySection form={form} />
        <OrgSection form={form} />
        <SystemsSection form={form} />
        <ComplianceSection form={form} />
        <SecuritySection form={form} />
        <RisksSection form={form} />
        <EventsSection form={form} />
      </div>

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
