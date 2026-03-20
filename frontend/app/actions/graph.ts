"use server";

import { fetchApi } from "@/app/lib/api";
import type { GraphData } from "@/app/types";

export async function getGraphData(
  simId: string
): Promise<{ data: GraphData } | { error: string }> {
  return fetchApi<GraphData>(`/api/crucible/simulations/${simId}/graph`);
}
