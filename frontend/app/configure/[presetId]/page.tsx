// frontend/app/configure/[presetId]/page.tsx
import Header from "@/app/components/layout/Header";
import AgentCards from "@/app/components/configure/AgentCards";
import WorldList from "@/app/components/configure/WorldList";
import PressureCards from "@/app/components/configure/PressureCards";
import EventTimeline from "@/app/components/configure/EventTimeline";
import LaunchBar from "@/app/components/configure/LaunchBar";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import Breadcrumbs from "@/app/components/layout/Breadcrumbs";
import { getPresetConfig } from "@/app/actions/presets";

export default async function ConfigurePage({
  params,
}: {
  params: Promise<{ presetId: string }>;
}) {
  const { presetId } = await params;
  const result = await getPresetConfig(presetId);

  if ("error" in result) {
    return (
      <>
        <Header />
        <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
          <Alert variant="destructive">
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        </main>
      </>
    );
  }

  const config = result.data;

  return (
    <>
      <Header />
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10 pb-24">
        <div className="mb-4">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Configure" }, { label: presetId }]} />
        </div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">{config.companyName || presetId}</h1>
          {config.scenario && (
            <p className="text-sm text-muted-foreground mt-2">{config.scenario}</p>
          )}
        </div>

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

        <LaunchBar config={config} />
      </main>
    </>
  );
}
