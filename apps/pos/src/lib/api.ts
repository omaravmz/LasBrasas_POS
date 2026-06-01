const BASE_URL = import.meta.env["VITE_API_URL"] ?? "/api";
const DEVICE_TOKEN = import.meta.env["VITE_DEVICE_TOKEN"] ?? "";

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Device-Token": DEVICE_TOKEN,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ code: "UNKNOWN", message: res.statusText }));
    throw error;
  }

  return res.json() as Promise<T>;
}
