// frontend/app/components/research/DossierEditor.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CompanyDossier } from "@/app/types";
import { updateDossier, triggerConfigGeneration } from "@/app/actions/project";
import CompanyProfile from "./CompanyProfile";
import OrgStructure from "./OrgStructure";
import SystemsList from "./SystemsList";
import ComplianceTags from "./ComplianceTags";
import RiskProfile from "./RiskProfile";
import RecentEvents from "./RecentEvents";

interface Props {
  projectId: string;
  initialDossier: CompanyDossier;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-lg bg-card p-4 mb-4">
      <h3 className="text-sm font-semibold mb-3 text-foreground">{title}</h3>
      {children}
    </div>
  );
}

export default function DossierEditor({ projectId, initialDossier }: Props) {
  const router = useRouter();
  const [dossier, setDossier] = useState<CompanyDossier>(initialDossier);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);

    // Step 1: PUT dossier
    const putResult = await updateDossier(projectId, dossier);
    if ("error" in putResult) {
      setError(`Failed to save dossier: ${putResult.error}`);
      setSaving(false);
      return;
    }

    // Step 2: Trigger config generation
    const genResult = await triggerConfigGeneration(projectId);
    if ("error" in genResult) {
      setError(`Failed to start config generation: ${genResult.error}`);
      setSaving(false);
      return;
    }

    // Step 3: Redirect
    router.push(`/configure/project/${projectId}`);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <Section title="Company Profile">
          <CompanyProfile
            company={dossier.company}
            onChange={(company) => setDossier({ ...dossier, company })}
          />
        </Section>

        <Section title="Org Structure">
          <OrgStructure
            org={dossier.org}
            onChange={(org) => setDossier({ ...dossier, org })}
          />
        </Section>

        <Section title="Technology Stack">
          <SystemsList
            systems={dossier.systems}
            onChange={(systems) => setDossier({ ...dossier, systems })}
          />
        </Section>

        <Section title="Compliance & Regulations">
          <ComplianceTags
            compliance={dossier.compliance}
            onChange={(compliance) => setDossier({ ...dossier, compliance })}
          />
        </Section>

        <Section title="Risk Profile">
          <RiskProfile
            risks={dossier.risks}
            onChange={(risks) => setDossier({ ...dossier, risks })}
          />
        </Section>

        <Section title="Recent Events">
          <RecentEvents
            recentEvents={dossier.recentEvents}
            onChange={(recentEvents) =>
              setDossier({ ...dossier, recentEvents })
            }
          />
        </Section>
      </div>

      {/* Fixed bottom bar */}
      <div className="border-t border-border bg-card px-4 py-3 flex items-center justify-between gap-3">
        {error && (
          <p className="text-xs text-severity-critical-text flex-1">{error}</p>
        )}
        {!error && (
          <p className="text-xs text-text-secondary flex-1">
            Review the company intelligence above, then confirm to generate your
            simulation config.
          </p>
        )}
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="px-5 py-2 rounded-lg bg-accent text-white font-medium text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity shrink-0"
        >
          {saving ? "Saving..." : "Confirm & Generate Config"}
        </button>
      </div>
    </div>
  );
}
