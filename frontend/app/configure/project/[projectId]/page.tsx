// frontend/app/configure/project/[projectId]/page.tsx
"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/layout/Header";
import AgentCards from "@/app/components/configure/AgentCards";
import WorldList from "@/app/components/configure/WorldList";
import PressureCards from "@/app/components/configure/PressureCards";
import EventTimeline from "@/app/components/configure/EventTimeline";
import ScenarioCards from "@/app/components/configure/ScenarioCards";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Button } from "@/app/components/ui/button";
import Breadcrumbs from "@/app/components/layout/Breadcrumbs";
import { getProjectStatus, getProjectConfig, linkSimToProject } from "@/app/actions/project";
import { launchSimulation } from "@/app/actions/simulation";
import { getScenarios, generateConfigs, getConfigs, launchScenarios } from "@/app/actions/scenarios";
import type { SimulationConfig, Project, ScenarioVariant } from "@/app/types";

export default function ConfigureProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const router = useRouter();
  const [config, setConfig] = useState<SimulationConfig | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [scenarios, setScenarios] = useState<ScenarioVariant[]>([]);
  const [configs, setConfigs] = useState<SimulationConfig[]>([]);
  const [activeConfigIdx, setActiveConfigIdx] = useState(0);
  const [generatingConfigs, setGeneratingConfigs] = useState(false);

  const handleLaunch = async () => {
    if (!config) return;
    setLaunching(true);
    const result = await launchSimulation({ ...config, projectId });
    if ("error" in result) {
      setError(result.error);
      setLaunching(false);
      return;
    }
    // Link the simulation to this project so Zep graph carries through
    await linkSimToProject(projectId, result.data.simId);
    router.push(`/simulation/${result.data.simId}`);
  };

  const handleGenerateConfigs = async (scenarioIds: string[]) => {
    setGeneratingConfigs(true);
    const result = await generateConfigs(projectId, scenarioIds);
    if ("error" in result) {
      setError(result.error);
      setGeneratingConfigs(false);
      return;
    }
    // Polling will pick up the status change
    setProject((prev) => prev ? { ...prev, status: "generating_configs" } : prev);
  };

  const handleLaunchAll = async () => {
    setLaunching(true);
    const result = await launchScenarios(projectId);
    if ("error" in result) {
      setError(result.error);
      setLaunching(false);
      return;
    }
    // Navigate to home — SimulationHistory shows all running sims
    router.push("/");
  };

  useEffect(() => {
    const load = async () => {
      // Poll status until config is ready
      const statusResult = await getProjectStatus(projectId);
      if ("error" in statusResult) {
        setError(statusResult.error);
        return;
      }
      setProject(statusResult.data);

      if (statusResult.data.status === "config_ready") {
        const configResult = await getProjectConfig(projectId);
        if ("error" in configResult) {
          setError(configResult.error);
          return;
        }
        setConfig(configResult.data);
      }

      if (statusResult.data.status === "scenarios_ready") {
        const scenarioResult = await getScenarios(projectId);
        if ("data" in scenarioResult) {
          setScenarios(scenarioResult.data.scenarios);
        }
      }

      if (statusResult.data.status === "configs_ready") {
        const configsResult = await getConfigs(projectId);
        if ("data" in configsResult) {
          setConfigs(configsResult.data);
          if (configsResult.data.length > 0) {
            setConfig(configsResult.data[0]);
          }
        }
      }
    };
    load();
  }, [projectId]);

  // Poll while generating config
  useEffect(() => {
    if (!project || !["generating_config", "analyzing_threats", "generating_configs"].includes(project.status)) return;
    const interval = setInterval(async () => {
      const result = await getProjectStatus(projectId);
      if ("data" in result) {
        setProject(result.data);
        if (result.data.status === "config_ready") {
          const configResult = await getProjectConfig(projectId);
          if ("data" in configResult) setConfig(configResult.data);
        }
        if (result.data.status === "scenarios_ready") {
          const scenarioResult = await getScenarios(projectId);
          if ("data" in scenarioResult) setScenarios(scenarioResult.data.scenarios);
        }
        if (result.data.status === "configs_ready") {
          const configsResult = await getConfigs(projectId);
          if ("data" in configsResult) {
            setConfigs(configsResult.data);
            if (configsResult.data.length > 0) setConfig(configsResult.data[0]);
          }
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [project?.status, projectId]);

  if (error) {
    return (
      <>
        <Header />
        <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </main>
      </>
    );
  }

  // Show loading skeleton only during legacy config generation or initial load
  // New pipeline statuses (analyzing_threats, scenarios_ready, generating_configs, configs_ready) handle their own UI
  const newPipelineStatuses = ["analyzing_threats", "scenarios_ready", "generating_configs", "configs_ready"];
  if (!config && !newPipelineStatuses.includes(project?.status || "")) {
    return (
      <>
        <Header />
        <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
          <div className="text-center py-20">
            <div className="space-y-3 max-w-xs mx-auto mb-4">
              <Skeleton className="h-5 w-3/4 mx-auto" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
            <p className="text-sm text-muted-foreground">
              {project?.progressMessage || "The AI is building agents, scenarios, and pressures from your company data."}
            </p>
            <div className="mt-4 w-48 mx-auto h-1.5 bg-muted rounded-full">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${project?.progress || 0}%` }}
              />
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10 pb-24">
        <div className="mb-4">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Configure" }, { label: projectId }]} />
        </div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">{config?.companyName || project?.companyUrl || "Project"}</h1>
          {config?.scenario && (
            <p className="text-sm text-muted-foreground mt-2">{config.scenario}</p>
          )}
        </div>

        {/* Threat Analysis in progress */}
        {project?.status === "analyzing_threats" && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Threat Analysis</h2>
            <div className="rounded-lg border p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">{project.progressMessage}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-transform origin-left" style={{ transform: `scaleX(${(project.progress || 0) / 100})` }} />
              </div>
            </div>
          </section>
        )}

        {/* Scenario Selection */}
        {project?.status === "scenarios_ready" && scenarios.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Scenario Variants</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Select 1-3 scenarios to simulate. Each will generate a separate simulation with its own config.
            </p>
            <ScenarioCards
              scenarios={scenarios}
              onGenerate={handleGenerateConfigs}
              generating={generatingConfigs}
            />
          </section>
        )}

        {/* Config Generation in progress */}
        {project?.status === "generating_configs" && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Generating Configs</h2>
            <div className="rounded-lg border p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">{project.progressMessage}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-transform origin-left" style={{ transform: `scaleX(${(project.progress || 0) / 100})` }} />
              </div>
            </div>
          </section>
        )}

        {/* Multi-config review with tabs */}
        {project?.status === "configs_ready" && configs.length > 0 && (
          <section className="mb-8">
            {configs.length > 1 && (
              <div className="flex gap-2 mb-4">
                {configs.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setActiveConfigIdx(i); setConfig(c); }}
                    className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                      i === activeConfigIdx
                        ? "border-primary bg-primary/10 font-medium"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    {c.threatActorProfile || c.scenarioId || `Scenario ${i + 1}`}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {config && (
          <>
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Agents</h2>
              <AgentCards agents={config.agents} />
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Worlds</h2>
              <WorldList worlds={config.worlds} />
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Pressures</h2>
              <PressureCards pressures={config.pressures} />
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Scheduled Events</h2>
              <EventTimeline events={config.scheduledEvents} />
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Settings</h2>
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Rounds:</span>{" "}
                  <span className="font-medium">{config.totalRounds}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Hours per round:</span>{" "}
                  <span className="font-medium">{config.hoursPerRound}</span>
                </div>
              </div>
            </section>

            <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-card px-6 py-3 flex items-center justify-between z-50">
              <div className="text-sm text-muted-foreground">
                {config.agents.length} agents · {config.worlds.length} worlds · {config.totalRounds} rounds
              </div>
              <Button
                onClick={project?.status === "configs_ready" ? handleLaunchAll : handleLaunch}
                disabled={launching || config.agents.length === 0}
              >
                {launching ? "Launching..." : configs.length > 1 ? `Launch All (${configs.length} scenarios)` : "Launch Simulation"}
              </Button>
            </div>
          </>
        )}
      </main>
    </>
  );
}
