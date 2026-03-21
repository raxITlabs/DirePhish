import Header from "@/app/components/layout/Header";
import PresetGrid from "@/app/components/home/PresetGrid";
import UploadZone from "@/app/components/home/UploadZone";
import ResearchForm from "@/app/components/home/ResearchForm";
import SimulationHistory from "@/app/components/home/SimulationHistory";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { getPresets } from "@/app/actions/presets";

export default async function Home() {
  const result = await getPresets();
  const presets = "data" in result ? result.data : [];
  const error = "error" in result ? result.error : null;

  return (
    <>
      <Header />
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-2">Crucible</h1>
          <p className="text-muted-foreground">
            Enterprise simulation engine. Pick a preset or upload a config to get started.
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Recent Simulations</h2>
          <SimulationHistory />
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Research Your Company</h2>
          <ResearchForm />
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Presets</h2>
          <PresetGrid presets={presets} />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Custom Config</h2>
          <UploadZone />
        </section>
      </main>
    </>
  );
}
