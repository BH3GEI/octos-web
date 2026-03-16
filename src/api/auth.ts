import { request } from "./client";
import type { AuthVerifyResponse, AuthMeResponse } from "./types";

export async function sendCode(email: string): Promise<{ ok: boolean; message?: string }> {
  return request("/api/auth/send-code", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function verify(
  email: string,
  code: string,
): Promise<AuthVerifyResponse> {
  return request("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export async function me(): Promise<AuthMeResponse> {
  return request("/api/auth/me");
}

export async function logout(): Promise<void> {
  await request("/api/auth/logout", { method: "POST" });
}
