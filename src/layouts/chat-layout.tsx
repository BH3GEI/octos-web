import type { ReactNode } from "react";
import { useAuth } from "@/auth/auth-context";
import { useOctosStatus } from "@/hooks/use-octos-status";
import { CostBar } from "@/components/cost-bar";
import { SessionList } from "@/components/session-list";
import { LogOut, MessageSquare } from "lucide-react";

export function ChatLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const status = useOctosStatus();

  return (
    <div className="flex h-screen bg-surface-dark">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-border bg-surface">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <MessageSquare size={20} className="text-accent" />
          <span className="font-semibold text-white">octos</span>
        </div>

        {/* Session list */}
        <SessionList />

        {/* Footer */}
        <div className="border-t border-border p-3">
          {status && (
            <div className="mb-2 text-xs text-muted">
              {status.provider}/{status.model}
            </div>
          )}
          {user && (
            <div className="flex items-center justify-between">
              <span className="truncate text-sm text-zinc-300">
                {user.email}
              </span>
              <button
                onClick={logout}
                className="rounded p-1 text-muted hover:bg-surface-light hover:text-white"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex flex-1 flex-col">
        <CostBar model={status?.model} provider={status?.provider} />
        <div className="flex-1 overflow-hidden">{children}</div>
      </main>
    </div>
  );
}
