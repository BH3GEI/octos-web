import { request } from "./client";
import type { ChatResponse } from "./types";

export async function sendMessage(
  message: string,
  sessionId?: string,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  return request("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      session_id: sessionId,
    }),
    signal,
  });
}
