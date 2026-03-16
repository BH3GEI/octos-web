import { useSession } from "@/runtime/session-context";
import { Plus, MessageSquare, Trash2 } from "lucide-react";

export function SessionList() {
  const { sessions, currentSessionId, switchSession, createSession, removeSession } =
    useSession();

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="p-2">
        <button
          onClick={createSession}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-surface-light"
        >
          <Plus size={14} />
          New chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {sessions.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted">No sessions yet</p>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                s.id === currentSessionId
                  ? "bg-accent/15 text-accent"
                  : "text-zinc-400 hover:bg-surface-light hover:text-zinc-200"
              }`}
            >
              <button
                onClick={() => switchSession(s.id)}
                className="flex flex-1 items-center gap-2 overflow-hidden"
              >
                <MessageSquare size={14} className="shrink-0" />
                <span className="flex-1 truncate">{formatSessionName(s.id)}</span>
                <span className="text-xs text-muted">{s.message_count}</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeSession(s.id);
                }}
                className="hidden shrink-0 rounded p-1 text-muted hover:bg-red-600/20 hover:text-red-400 group-hover:block"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatSessionName(id: string): string {
  // Try to make the session ID more readable
  // octos uses session IDs like "telegram-123456" or "web-1234567890-abc123"
  if (id.startsWith("web-")) {
    const parts = id.split("-");
    if (parts.length >= 2) {
      const ts = parseInt(parts[1], 10);
      if (!isNaN(ts)) {
        const d = new Date(ts);
        return d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    }
  }
  return id;
}
