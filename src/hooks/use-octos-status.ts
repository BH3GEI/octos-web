import { useEffect, useState } from "react";
import { getStatus } from "@/api/sessions";
import type { ServerStatus } from "@/api/types";

export function useOctosStatus(intervalMs = 30000) {
  const [status, setStatus] = useState<ServerStatus | null>(null);

  useEffect(() => {
    let mounted = true;

    async function poll() {
      try {
        const s = await getStatus();
        if (mounted) setStatus(s);
      } catch {
        // ignore
      }
    }

    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return status;
}
