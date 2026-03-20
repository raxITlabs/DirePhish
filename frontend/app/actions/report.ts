"use server";

import { fetchApi } from "@/app/lib/api";
import type { Report } from "@/app/types";

export async function generateReport(
  simId: string
): Promise<{ data: { status: string } } | { error: string }> {
  return fetchApi<{ status: string }>(`/api/crucible/simulations/${simId}/report`, {
    method: "POST",
  });
}

export async function getReport(
  simId: string
): Promise<{ data: Report } | { error: string }> {
  return fetchApi<Report>(`/api/crucible/simulations/${simId}/report`);
}
