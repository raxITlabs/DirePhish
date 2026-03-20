const API_BASE = process.env.FLASK_API_URL || "http://localhost:5001";

export async function fetchApi<T>(
  path: string,
  options?: RequestInit
): Promise<{ data: T } | { error: string }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      return { error: json.error || `HTTP ${res.status}` };
    }
    return { data: json.data as T };
  } catch {
    return { error: "Backend not connected. Start the Flask server on port 5001." };
  }
}

export async function fetchMultipart<T>(
  path: string,
  formData: FormData
): Promise<{ data: T } | { error: string }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      body: formData,
      // Do NOT set Content-Type — browser sets it with multipart boundary
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      return { error: json.error || `HTTP ${res.status}` };
    }
    return { data: json.data as T };
  } catch {
    return { error: "Backend not connected. Start the Flask server on port 5001." };
  }
}
