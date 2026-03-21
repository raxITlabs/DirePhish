import Link from "next/link";
import { listSimulations } from "@/app/actions/simulation";
import HomeClient from "@/app/components/home/HomeClient";

export default async function Home() {
  const result = await listSimulations();
  const simulations = "data" in result ? result.data : [];

  return <HomeClient simulations={simulations} />;
}
