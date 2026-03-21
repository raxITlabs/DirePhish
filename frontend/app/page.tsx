import Header from "@/app/components/layout/Header";
import ResearchForm from "@/app/components/home/ResearchForm";
import SimulationHistory from "@/app/components/home/SimulationHistory";

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-2">Crucible</h1>
          <p className="text-muted-foreground">
            Enterprise simulation engine. Research your company to get started.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Recent Simulations</h2>
          <SimulationHistory />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Research Your Company</h2>
          <ResearchForm />
        </section>
      </main>
    </>
  );
}
