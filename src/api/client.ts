import { API_BASE, TOKEN_KEY, ADMIN_TOKEN_KEY } from "@/lib/constants";

export function getToken(): string | null {
  return (
    localStorage.getItem(TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY)
  );
}

export function setToken(token: string, isAdmin = false) {
  localStorage.setItem(isAdmin ? ADMIN_TOKEN_KEY : TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `HTTP ${resp.status}`);
  }

  return resp.json();
}
