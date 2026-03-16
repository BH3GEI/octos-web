import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useThreadRuntime,
  useComposerRuntime,
  useThread,
  useComposer,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { SendHorizontal, Square } from "lucide-react";
import { useCallback, useState } from "react";
import { useSession } from "@/runtime/session-context";

export function Thread() {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />
      </ThreadPrimitive.Viewport>
      <Composer />
    </ThreadPrimitive.Root>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end px-4 py-2">
      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-accent/20 px-4 py-2 text-sm text-white">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex px-4 py-2">
      <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-surface-light px-4 py-3 text-sm text-zinc-200 transition-all duration-300 ease-out">
        <MessagePrimitive.Content
          components={{
            Text: () => (
              <MarkdownTextPrimitive className="prose prose-invert prose-sm max-w-none" />
            ),
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

const COMMANDS = [
  { cmd: "/new", desc: "Start a new chat session" },
  { cmd: "/clear", desc: "Clear current session and start fresh" },
  { cmd: "/delete", desc: "Delete current session" },
];

function Composer() {
  const threadRuntime = useThreadRuntime();
  const composerRuntime = useComposerRuntime();
  const isRunning = useThread((s) => s.isRunning);
  const isEmpty = useComposer((s) => s.isEmpty);
  const text = useComposer((s) => s.text);
  const { createSession, removeSession, currentSessionId } = useSession();
  const [cmdFeedback, setCmdFeedback] = useState<string | null>(null);

  const handleSend = useCallback(() => {
    if (isEmpty) return;
    const input = composerRuntime.getState().text.trim();

    // Handle slash commands client-side
    if (input === "/new") {
      composerRuntime.setText("");
      createSession();
      return;
    }
    if (input === "/clear") {
      composerRuntime.setText("");
      removeSession(currentSessionId);
      return;
    }
    if (input === "/delete") {
      composerRuntime.setText("");
      removeSession(currentSessionId);
      return;
    }
    if (input === "/help" || input === "/") {
      composerRuntime.setText("");
      setCmdFeedback("Commands: /new (new chat), /clear (clear session), /delete (delete session)");
      setTimeout(() => setCmdFeedback(null), 4000);
      return;
    }

    if (isRunning) {
      threadRuntime.cancelRun();
    }
    composerRuntime.send();
  }, [threadRuntime, composerRuntime, isRunning, isEmpty, createSession, removeSession, currentSessionId]);

  const handleCancel = useCallback(() => {
    threadRuntime.cancelRun();
  }, [threadRuntime]);

  const showCmdHints = text.startsWith("/") && text.length < 10;
  const matchingCmds = showCmdHints
    ? COMMANDS.filter((c) => c.cmd.startsWith(text))
    : [];

  return (
    <ComposerPrimitive.Root
      className="border-t border-border bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        handleSend();
      }}
    >
      <div className="mx-auto max-w-3xl">
        {cmdFeedback && (
          <div className="mb-2 rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent">
            {cmdFeedback}
          </div>
        )}
        {matchingCmds.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {matchingCmds.map((c) => (
              <button
                key={c.cmd}
                onClick={() => {
                  composerRuntime.setText(c.cmd);
                }}
                className="rounded-md bg-surface-light px-2 py-1 text-xs text-zinc-300 hover:bg-accent/20 hover:text-accent"
              >
                <span className="font-mono">{c.cmd}</span>{" "}
                <span className="text-muted">{c.desc}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <ComposerPrimitive.Input
            placeholder="Send a message... (type / for commands)"
            className="flex-1 resize-none rounded-xl border border-border bg-surface-light px-4 py-3 text-sm text-white placeholder-muted outline-none focus:border-accent"
            autoFocus
          />
          {isRunning && (
            <button
              onClick={handleCancel}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white transition hover:bg-red-700"
            >
              <Square size={16} />
            </button>
          )}
          <button
            onClick={handleSend}
            disabled={isEmpty}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-surface-dark transition hover:bg-accent-dim disabled:opacity-30"
          >
            <SendHorizontal size={18} />
          </button>
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}
