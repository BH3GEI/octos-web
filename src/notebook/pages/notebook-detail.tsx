import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, FileText, MessageSquare, StickyNote, Wand2,
  Upload, Plus, Trash2, Link, Type, File, Image, Globe,
  BookmarkPlus, Edit3, X, Send, CheckSquare, Square, Loader2,
  ChevronLeft, ChevronRight, RotateCcw, Eye, Columns2,
} from "lucide-react";
import { listNotebooks } from "../api/notebooks";
import { listSources, addSource, deleteSource } from "../api/sources";
import { listNotes, createNote, updateNote, deleteNote } from "../api/notes";
import type { Notebook, Source, Note } from "../api/types";
import { NotebookMarkdown } from "../components/notebook-markdown";

type Tab = "sources" | "chat" | "notes" | "studio";

// ─── Shared chat API helper ────────────────────────────────

async function chatApi(notebookId: string, message: string, extra?: Record<string, unknown>): Promise<string> {
  const token = localStorage.getItem("octos_session_token") || localStorage.getItem("octos_auth_token");
  const resp = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ message, session_id: `notebook-${notebookId}`, ...extra }),
  });
  const data = await resp.json();
  return data.content || "No response";
}

// ─── Toast ──────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-accent px-4 py-2 text-sm text-white shadow-lg animate-in fade-in slide-in-from-bottom-2">
      {message}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────

export function NotebookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    listNotebooks().then((nbs) => {
      const nb = nbs.find((n) => n.id === id);
      if (nb) setNotebook(nb);
      else navigate("/notebooks");
    });
  }, [id, navigate]);

  if (!notebook) return null;

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "sources", label: "Sources", icon: <FileText size={16} /> },
    { key: "chat", label: "Chat", icon: <MessageSquare size={16} /> },
    { key: "notes", label: "Notes", icon: <StickyNote size={16} /> },
    { key: "studio", label: "Studio", icon: <Wand2 size={16} /> },
  ];

  const handleCitationClick = (sourceIndex: number) => {
    // Issue #16: jump to sources tab and highlight source
    setActiveTab("sources");
    // Dispatch custom event so SourcesPanel can scroll to it
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("notebook:highlight-source", { detail: { index: sourceIndex } }));
    }, 100);
  };

  return (
    <div className="flex h-full flex-col">
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          onClick={() => navigate("/notebooks")}
          className="rounded-lg p-1.5 text-muted hover:bg-surface-light hover:text-text transition"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-semibold text-text-strong">{notebook.title}</h1>
        <div className="ml-auto flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
                activeTab === t.key
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:bg-surface-light hover:text-text"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "sources" && (
          <SourcesPanel notebookId={notebook.id} selectedSources={selectedSources} setSelectedSources={setSelectedSources} />
        )}
        {activeTab === "chat" && (
          <ChatPanel
            notebookId={notebook.id}
            selectedSources={selectedSources}
            onCitationClick={handleCitationClick}
            onSaveNote={(content) => {
              createNote(notebook.id, { content, created_from: "chat_reply" }).then(() => {
                setToast("Saved to Notes!");
              });
            }}
          />
        )}
        {activeTab === "notes" && <NotesPanel notebookId={notebook.id} />}
        {activeTab === "studio" && <StudioPanel notebookId={notebook.id} />}
      </div>
    </div>
  );
}

// ─── Sources Panel (Issue #14: checkbox filter) ─────────────

function SourcesPanel({
  notebookId,
  selectedSources,
  setSelectedSources,
}: {
  notebookId: string;
  selectedSources: Set<string>;
  setSelectedSources: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const [sources, setSources] = useState<Source[]>([]);
  const [adding, setAdding] = useState<"file" | "url" | "text" | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [highlightIdx, setHighlightIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sourceRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const load = useCallback(async () => {
    const srcs = await listSources(notebookId);
    setSources(srcs);
    // Auto-select all new sources
    setSelectedSources((prev) => {
      const next = new Set(prev);
      for (const s of srcs) next.add(s.id);
      return next;
    });
  }, [notebookId, setSelectedSources]);

  useEffect(() => { load(); }, [load]);

  // Listen for citation jump events (Issue #16)
  useEffect(() => {
    const handler = (e: Event) => {
      const idx = (e as CustomEvent).detail?.index as number;
      setHighlightIdx(idx);
      const el = sourceRefs.current.get(idx - 1);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => setHighlightIdx(null), 2000);
    };
    window.addEventListener("notebook:highlight-source", handler);
    return () => window.removeEventListener("notebook:highlight-source", handler);
  }, []);

  const toggleSource = (id: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedSources(new Set(sources.map((s) => s.id)));
  const deselectAll = () => setSelectedSources(new Set());

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const f of Array.from(files)) {
      const ext = f.name.split(".").pop()?.toLowerCase() || "";
      const type = ({ pdf: "pdf", docx: "docx", pptx: "pptx", png: "image", jpg: "image", jpeg: "image" } as Record<string, Source["type"]>)[ext] || "text";
      await addSource(notebookId, { type, filename: f.name });
    }
    setAdding(null);
    load();
  };

  const handleUrlAdd = async () => {
    if (!urlInput.trim()) return;
    await addSource(notebookId, { type: "url", filename: urlInput.trim() });
    setUrlInput("");
    setAdding(null);
    load();
  };

  const handleTextAdd = async () => {
    if (!textInput.trim()) return;
    await addSource(notebookId, { type: "text", filename: textTitle.trim() || "Pasted text", content: textInput });
    setTextInput("");
    setTextTitle("");
    setAdding(null);
    load();
  };

  const handleDelete = async (sourceId: string) => {
    await deleteSource(notebookId, sourceId);
    setSelectedSources((prev) => {
      const next = new Set(prev);
      next.delete(sourceId);
      return next;
    });
    load();
  };

  const typeIcon: Record<Source["type"], React.ReactNode> = {
    pdf: <File size={16} className="text-red-400" />,
    docx: <FileText size={16} className="text-blue-400" />,
    pptx: <FileText size={16} className="text-orange-400" />,
    url: <Globe size={16} className="text-green-400" />,
    text: <Type size={16} className="text-gray-400" />,
    image: <Image size={16} className="text-purple-400" />,
  };

  return (
    <div className="flex h-full flex-col p-4">
      {/* Add source buttons */}
      <div className="mb-4 flex gap-2">
        <button onClick={() => { setAdding("file"); setTimeout(() => fileRef.current?.click(), 100); }}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text hover:border-accent/50 transition">
          <Upload size={14} /> Upload File
        </button>
        <button onClick={() => setAdding("url")}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text hover:border-accent/50 transition">
          <Link size={14} /> Add URL
        </button>
        <button onClick={() => setAdding("text")}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text hover:border-accent/50 transition">
          <Type size={14} /> Paste Text
        </button>
        <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg" className="hidden" onChange={handleFileUpload} />
      </div>

      {/* URL input */}
      {adding === "url" && (
        <div className="mb-4 flex gap-2">
          <input autoFocus value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleUrlAdd(); if (e.key === "Escape") setAdding(null); }}
            placeholder="https://..." className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none" />
          <button onClick={handleUrlAdd} className="rounded-lg bg-accent px-3 py-2 text-sm text-white">Add</button>
          <button onClick={() => setAdding(null)} className="rounded-lg px-2 text-muted hover:text-text"><X size={16} /></button>
        </div>
      )}

      {/* Text input */}
      {adding === "text" && (
        <div className="mb-4 space-y-2">
          <input autoFocus value={textTitle} onChange={(e) => setTextTitle(e.target.value)}
            placeholder="Title (optional)" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none" />
          <textarea value={textInput} onChange={(e) => setTextInput(e.target.value)} rows={4}
            placeholder="Paste text content..." className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none resize-none" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(null)} className="text-sm text-muted hover:text-text">Cancel</button>
            <button onClick={handleTextAdd} className="rounded-lg bg-accent px-3 py-1.5 text-sm text-white">Add</button>
          </div>
        </div>
      )}

      {/* Select all / deselect all (Issue #14) */}
      {sources.length > 0 && (
        <div className="mb-2 flex items-center gap-3 text-xs text-muted">
          <span>{selectedSources.size}/{sources.length} selected</span>
          <button onClick={selectAll} className="text-accent hover:underline">Select All</button>
          <button onClick={deselectAll} className="text-accent hover:underline">Deselect All</button>
        </div>
      )}

      {/* Source list */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {sources.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-muted">
            <Upload size={36} className="mb-3 opacity-30" />
            <p>No sources yet</p>
            <p className="text-xs">Upload PDFs, paste URLs, or add text</p>
          </div>
        ) : (
          sources.map((s, i) => (
            <div
              key={s.id}
              ref={(el) => { if (el) sourceRefs.current.set(i, el); }}
              className={`group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
                highlightIdx === i + 1
                  ? "border-accent bg-accent/10 ring-2 ring-accent/30"
                  : "border-border bg-surface hover:border-accent/30"
              }`}
            >
              {/* Checkbox (Issue #14) */}
              <button onClick={() => toggleSource(s.id)} className="text-muted hover:text-accent">
                {selectedSources.has(s.id) ? <CheckSquare size={16} className="text-accent" /> : <Square size={16} />}
              </button>
              {typeIcon[s.type]}
              <span className="flex-1 truncate text-sm text-text">{s.filename}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${s.status === "ready" ? "bg-green-500/10 text-green-400" : s.status === "error" ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                {s.status}
              </span>
              <button onClick={() => handleDelete(s.id)}
                className="rounded p-1 text-muted opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity">
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Chat Panel (Issues #15, #16, #17, #19) ─────────────────

const SUGGESTED_QUESTIONS = [
  "Summarize the key points from the sources",
  "What are the main topics discussed?",
  "Create a study guide based on the sources",
  "What are the most important takeaways?",
  "Compare and contrast the main ideas",
];

function ChatPanel({
  notebookId,
  selectedSources,
  onCitationClick,
  onSaveNote,
}: {
  notebookId: string;
  selectedSources: Set<string>;
  onCitationClick: (sourceIndex: number) => void;
  onSaveNote: (content: string) => void;
}) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async (text?: string) => {
    const userMsg = (text || input).trim();
    if (!userMsg || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const content = await chatApi(notebookId, userMsg, {
        selected_sources: Array.from(selectedSources),
      });
      setMessages((prev) => [...prev, { role: "assistant", content }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err}` }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, notebookId, selectedSources]);

  const inputBar = (
    <div className="border-t border-border p-4">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Ask about your sources..."
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        />
        <button onClick={() => handleSend()} disabled={!input.trim() || loading}
          className="rounded-lg bg-accent px-3 py-2 text-white disabled:opacity-50">
          <Send size={16} />
        </button>
      </div>
    </div>
  );

  // Issue #17: suggested questions when empty
  if (messages.length === 0 && !loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 flex flex-col items-center justify-center text-muted px-4">
          <MessageSquare size={48} className="mb-4 opacity-30" />
          <p className="text-lg">Chat with your sources</p>
          <p className="mb-6 text-sm">Ask questions about the documents in this notebook</p>
          <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => handleSend(q)}
                className="rounded-lg border border-border bg-surface px-3 py-2.5 text-left text-sm text-text hover:border-accent/50 hover:bg-surface-light transition"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
        {inputBar}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
              m.role === "user"
                ? "bg-accent text-white"
                : "bg-surface-light text-text"
            }`}>
              {m.role === "assistant" ? (
                <NotebookMarkdown text={m.content} onCitationClick={onCitationClick} />
              ) : (
                m.content
              )}
              {/* Issue #19: save to note button */}
              {m.role === "assistant" && (
                <div className="mt-1.5 flex justify-end">
                  <button
                    onClick={() => onSaveNote(m.content)}
                    className="flex items-center gap-1 rounded p-1 text-xs text-muted hover:text-accent transition"
                    title="Save to Notes"
                  >
                    <BookmarkPlus size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-surface-light px-4 py-2.5 text-sm text-muted animate-pulse">Thinking...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {inputBar}
    </div>
  );
}

// ─── Notes Panel (Issues #20, #21) ──────────────────────────

function NotesPanel({ notebookId }: { notebookId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [creating, setCreating] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editMode, setEditMode] = useState<"edit" | "split" | "preview">("split");
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [synthesizing, setSynthesizing] = useState(false);

  const load = useCallback(async () => {
    setNotes(await listNotes(notebookId));
  }, [notebookId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newContent.trim()) return;
    await createNote(notebookId, { content: newContent.trim(), created_from: "manual" });
    setNewContent("");
    setCreating(false);
    load();
  };

  const handleUpdate = async (noteId: string) => {
    await updateNote(noteId, editContent);
    setEditingId(null);
    load();
  };

  const handleDelete = async (noteId: string) => {
    await deleteNote(noteId);
    load();
  };

  const toggleNoteSelect = (id: string) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Issue #21: AI synthesis
  const handleSynthesize = async () => {
    if (selectedNoteIds.size < 2 || synthesizing) return;
    setSynthesizing(true);
    try {
      const selected = notes.filter((n) => selectedNoteIds.has(n.id));
      const combined = selected.map((n, i) => `## Note ${i + 1}\n${n.content}`).join("\n\n");
      const prompt = `Synthesize these notes into a comprehensive study guide:\n\n${combined}`;
      const content = await chatApi(notebookId, prompt);
      await createNote(notebookId, { content, created_from: "manual" });
      setSelectedNoteIds(new Set());
      setMultiSelect(false);
      load();
    } catch {
      // silently fail
    } finally {
      setSynthesizing(false);
    }
  };

  // Issue #20: split editor view
  if (editingId) {
    return (
      <div className="flex h-full flex-col p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setEditingId(null)} className="rounded p-1 text-muted hover:text-text">
              <ArrowLeft size={16} />
            </button>
            <h2 className="text-sm font-medium text-text-strong">Edit Note</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditMode("edit")}
              className={`rounded px-2 py-1 text-xs ${editMode === "edit" ? "bg-accent/15 text-accent" : "text-muted hover:text-text"}`}
            >
              <Edit3 size={12} />
            </button>
            <button
              onClick={() => setEditMode("split")}
              className={`rounded px-2 py-1 text-xs ${editMode === "split" ? "bg-accent/15 text-accent" : "text-muted hover:text-text"}`}
            >
              <Columns2 size={12} />
            </button>
            <button
              onClick={() => setEditMode("preview")}
              className={`rounded px-2 py-1 text-xs ${editMode === "preview" ? "bg-accent/15 text-accent" : "text-muted hover:text-text"}`}
            >
              <Eye size={12} />
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditingId(null)} className="text-sm text-muted hover:text-text">Cancel</button>
            <button onClick={() => handleUpdate(editingId)} className="rounded-lg bg-accent px-3 py-1 text-sm text-white">Save</button>
          </div>
        </div>
        <div className="flex flex-1 min-h-0 gap-3">
          {(editMode === "edit" || editMode === "split") && (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface p-3 text-sm text-text font-mono focus:border-accent focus:outline-none resize-none"
              placeholder="Write markdown..."
            />
          )}
          {(editMode === "preview" || editMode === "split") && (
            <div className="flex-1 overflow-y-auto rounded-lg border border-border bg-surface p-3">
              <NotebookMarkdown text={editContent} className="text-sm" />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-text-strong">{notes.length} Notes</h2>
        <div className="flex items-center gap-2">
          {/* Issue #21: multi-select toggle */}
          <button
            onClick={() => { setMultiSelect(!multiSelect); setSelectedNoteIds(new Set()); }}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm transition ${
              multiSelect ? "bg-accent/15 text-accent" : "text-muted hover:text-text"
            }`}
          >
            <CheckSquare size={14} /> Select
          </button>
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent/90 transition">
            <Plus size={14} /> New Note
          </button>
        </div>
      </div>

      {/* AI Summarize button (Issue #21) */}
      {multiSelect && selectedNoteIds.size >= 2 && (
        <div className="mb-3">
          <button
            onClick={handleSynthesize}
            disabled={synthesizing}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm text-white hover:bg-accent/90 disabled:opacity-50 transition"
          >
            {synthesizing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            AI Summarize ({selectedNoteIds.size} notes)
          </button>
        </div>
      )}

      {creating && (
        <div className="mb-4 rounded-lg border border-accent/30 bg-surface-light p-3">
          <textarea autoFocus rows={3} value={newContent} onChange={(e) => setNewContent(e.target.value)}
            placeholder="Write a note..." className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none resize-none" />
          <div className="mt-2 flex gap-2 justify-end">
            <button onClick={() => setCreating(false)} className="text-sm text-muted">Cancel</button>
            <button onClick={handleCreate} className="rounded bg-accent px-3 py-1 text-sm text-white">Save</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2">
        {notes.length === 0 && !creating ? (
          <div className="flex h-48 flex-col items-center justify-center text-muted">
            <StickyNote size={36} className="mb-3 opacity-30" />
            <p>No notes yet</p>
            <p className="text-xs">Create notes or save chat replies</p>
          </div>
        ) : (
          notes.map((n) => (
            <div key={n.id} className={`group rounded-lg border bg-surface p-3 transition ${
              selectedNoteIds.has(n.id) ? "border-accent bg-accent/5" : "border-border"
            }`}>
              <div className="flex gap-2">
                {multiSelect && (
                  <button onClick={() => toggleNoteSelect(n.id)} className="mt-0.5">
                    {selectedNoteIds.has(n.id) ? <CheckSquare size={16} className="text-accent" /> : <Square size={16} className="text-muted" />}
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text">
                    <NotebookMarkdown text={n.content.length > 200 ? n.content.slice(0, 200) + "..." : n.content} />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-muted">{new Date(n.created_at).toLocaleDateString()}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingId(n.id); setEditContent(n.content); }}
                        className="rounded p-1 text-muted hover:text-accent"><Edit3 size={12} /></button>
                      <button onClick={() => handleDelete(n.id)}
                        className="rounded p-1 text-muted hover:text-red-400"><Trash2 size={12} /></button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Studio Panel (Issues #23, #26, #27, #28) ──────────────

type StudioOutputType = "slides" | "quiz" | "flashcards" | "mindmap" | "audio" | "infographic" | "comic" | "report" | "research";

interface QuizQuestion {
  question: string;
  options: string[];
  correct: string;
  explanation: string;
}

interface Flashcard {
  front: string;
  back: string;
}

function StudioPanel({ notebookId }: { notebookId: string }) {
  const [active, setActive] = useState<StudioOutputType | null>(null);

  const outputs: { key: StudioOutputType; label: string; emoji: string; desc: string }[] = [
    { key: "slides", label: "Slides", emoji: "\uD83D\uDCCA", desc: "Generate PPT courseware" },
    { key: "quiz", label: "Quiz", emoji: "\u2753", desc: "Generate test questions" },
    { key: "flashcards", label: "Flashcards", emoji: "\uD83C\uDCCF", desc: "Generate study cards" },
    { key: "mindmap", label: "Mind Map", emoji: "\uD83E\uDDE0", desc: "Visualize key concepts" },
    { key: "audio", label: "Audio", emoji: "\uD83C\uDF99\uFE0F", desc: "Generate podcast overview" },
    { key: "infographic", label: "Infographic", emoji: "\uD83D\uDCC8", desc: "Generate visual summary" },
    { key: "comic", label: "Comic", emoji: "\uD83D\uDCAC", desc: "Explain with comics" },
    { key: "report", label: "Report", emoji: "\uD83D\uDCC4", desc: "Generate Word/Excel report" },
    { key: "research", label: "Research", emoji: "\uD83D\uDD2C", desc: "Deep research from web" },
  ];

  if (active) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <button onClick={() => setActive(null)} className="rounded p-1 text-muted hover:text-text">
            <ArrowLeft size={16} />
          </button>
          <h2 className="text-sm font-semibold text-text-strong">
            {outputs.find((o) => o.key === active)?.emoji} {outputs.find((o) => o.key === active)?.label}
          </h2>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {active === "quiz" ? (
            <QuizUI notebookId={notebookId} />
          ) : active === "flashcards" ? (
            <FlashcardsUI notebookId={notebookId} />
          ) : active === "mindmap" ? (
            <MindMapUI notebookId={notebookId} />
          ) : (
            <GenericStudioUI notebookId={notebookId} outputType={active} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="mb-4 text-lg font-semibold text-text-strong">Studio</h2>
      <p className="mb-6 text-sm text-muted">Generate courseware and study materials from your sources</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {outputs.map((o) => (
          <button
            key={o.key}
            onClick={() => setActive(o.key)}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 text-center transition hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5"
          >
            <span className="text-2xl">{o.emoji}</span>
            <span className="text-sm font-medium text-text-strong">{o.label}</span>
            <span className="text-xs text-muted">{o.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Generic Studio UI (Issue #23) ──────────────────────────

const STUDIO_PROMPTS: Record<string, string> = {
  slides: "Generate a PPT presentation outline about the sources in this notebook. Include title slides, key points, and summary.",
  audio: "Generate a podcast script overview based on the sources in this notebook.",
  infographic: "Create a visual summary with key statistics and facts from the sources.",
  comic: "Explain the main concepts from the sources using a comic strip format with dialogue.",
  report: "Generate a detailed report based on the sources in this notebook.",
  research: "Conduct deep research and analysis based on the sources in this notebook.",
};

const STUDIO_CONFIGS: Record<string, { label: string; options: string[] }[]> = {
  slides: [{ label: "Style", options: ["Corporate", "Academic", "Minimal", "Creative"] }],
  audio: [{ label: "Format", options: ["Interview", "Monologue", "Panel Discussion"] }],
  report: [{ label: "Format", options: ["Summary", "Detailed", "Executive Brief"] }],
};

function GenericStudioUI({ notebookId, outputType }: { notebookId: string; outputType: string }) {
  const configs = STUDIO_CONFIGS[outputType] || [];
  const [configValues, setConfigValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const c of configs) init[c.label] = c.options[0];
    return init;
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setResult(null);
    try {
      const configStr = Object.entries(configValues).map(([k, v]) => `${k}: ${v}`).join(", ");
      const prompt = (STUDIO_PROMPTS[outputType] || `Generate ${outputType} content from the sources.`) +
        (configStr ? ` Use settings: ${configStr}.` : "");
      const content = await chatApi(notebookId, prompt);
      setResult(content);
    } catch {
      setResult("Generation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {configs.map((c) => (
        <div key={c.label}>
          <label className="mb-1 block text-xs font-medium text-muted">{c.label}</label>
          <div className="flex gap-2">
            {c.options.map((opt) => (
              <button
                key={opt}
                onClick={() => setConfigValues((prev) => ({ ...prev, [c.label]: opt }))}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                  configValues[c.label] === opt
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border text-text hover:border-accent/50"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}

      <button
        onClick={generate}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm text-white hover:bg-accent/90 disabled:opacity-50 transition"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
        {loading ? "Generating..." : "Generate"}
      </button>

      {result && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <NotebookMarkdown text={result} className="text-sm" />
        </div>
      )}
    </div>
  );
}

// ─── Quiz UI (Issue #26) ────────────────────────────────────

function QuizUI({ notebookId }: { notebookId: string }) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const generate = async () => {
    setLoading(true);
    setQuestions([]);
    setAnswers({});
    setSubmitted(false);
    try {
      const content = await chatApi(notebookId,
        'Based on the sources, generate 5 multiple choice questions in JSON format. Return ONLY a JSON array, no other text. Format: [{"question":"...","options":["a)...","b)...","c)...","d)..."],"correct":"a","explanation":"..."}]'
      );
      // Try to parse JSON from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as QuizQuestion[];
        setQuestions(parsed);
      }
    } catch {
      // ignore parse errors
    } finally {
      setLoading(false);
    }
  };

  const score = questions.reduce((acc, q, i) => {
    const userAns = answers[i] || "";
    return acc + (userAns.startsWith(q.correct) || userAns === q.correct ? 1 : 0);
  }, 0);

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="mb-4 text-sm text-muted">Generate quiz questions based on your notebook sources</p>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          {loading ? "Generating..." : "Generate Quiz"}
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {submitted && (
        <div className="rounded-lg bg-accent/10 border border-accent/30 p-3 text-center">
          <span className="text-lg font-bold text-accent">Score: {score}/{questions.length}</span>
        </div>
      )}
      {questions.map((q, qi) => (
        <div key={qi} className="rounded-lg border border-border bg-surface p-4">
          <p className="mb-3 text-sm font-medium text-text-strong">{qi + 1}. {q.question}</p>
          <div className="space-y-2">
            {q.options.map((opt, oi) => {
              const optKey = String.fromCharCode(97 + oi); // a, b, c, d
              const selected = answers[qi] === optKey;
              const isCorrect = q.correct === optKey;
              let borderColor = "border-border";
              if (submitted) {
                if (isCorrect) borderColor = "border-green-500 bg-green-500/10";
                else if (selected && !isCorrect) borderColor = "border-red-500 bg-red-500/10";
              } else if (selected) {
                borderColor = "border-accent bg-accent/10";
              }
              return (
                <button
                  key={oi}
                  onClick={() => !submitted && setAnswers((prev) => ({ ...prev, [qi]: optKey }))}
                  className={`block w-full rounded-lg border px-3 py-2 text-left text-sm text-text transition ${borderColor}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {submitted && q.explanation && (
            <p className="mt-2 text-xs text-muted italic">{q.explanation}</p>
          )}
        </div>
      ))}
      {!submitted ? (
        <button
          onClick={() => setSubmitted(true)}
          disabled={Object.keys(answers).length < questions.length}
          className="rounded-lg bg-accent px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Submit Answers
        </button>
      ) : (
        <button onClick={generate} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-text hover:border-accent/50">
          <RotateCcw size={14} /> Generate New Quiz
        </button>
      )}
    </div>
  );
}

// ─── Flashcards UI (Issue #27) ──────────────────────────────

function FlashcardsUI({ notebookId }: { notebookId: string }) {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());

  const generate = async () => {
    setLoading(true);
    setCards([]);
    setCurrentIdx(0);
    setFlipped(false);
    setKnown(new Set());
    try {
      const content = await chatApi(notebookId,
        'Based on the sources, generate 10 flashcards for studying. Return ONLY a JSON array, no other text. Format: [{"front":"question or term","back":"answer or definition"}]'
      );
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        setCards(JSON.parse(jsonMatch[0]) as Flashcard[]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="mb-4 text-sm text-muted">Generate flashcards for studying</p>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          {loading ? "Generating..." : "Generate Flashcards"}
        </button>
      </div>
    );
  }

  const card = cards[currentIdx];
  const knownCount = known.size;

  return (
    <div className="flex flex-col items-center p-6">
      <div className="mb-4 text-xs text-muted">
        Card {currentIdx + 1} of {cards.length} &middot; {knownCount} known
      </div>

      {/* Flip card */}
      <div
        className="mb-6 w-full max-w-md cursor-pointer"
        style={{ perspective: "1000px" }}
        onClick={() => setFlipped(!flipped)}
      >
        <div
          className="relative h-48 w-full transition-transform duration-500"
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 flex items-center justify-center rounded-xl border border-border bg-surface p-6 text-center"
            style={{ backfaceVisibility: "hidden" }}
          >
            <p className="text-sm text-text-strong">{card.front}</p>
          </div>
          {/* Back */}
          <div
            className="absolute inset-0 flex items-center justify-center rounded-xl border border-accent/30 bg-accent/5 p-6 text-center"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <p className="text-sm text-text">{card.back}</p>
          </div>
        </div>
      </div>

      <p className="mb-4 text-xs text-muted">Click card to flip</p>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => { setFlipped(false); setCurrentIdx((i) => Math.max(0, i - 1)); }}
          disabled={currentIdx === 0}
          className="rounded-lg border border-border p-2 text-muted hover:text-text disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={() => {
            setKnown((prev) => {
              const next = new Set(prev);
              if (next.has(currentIdx)) next.delete(currentIdx);
              else next.add(currentIdx);
              return next;
            });
          }}
          className={`rounded-lg border px-4 py-2 text-sm transition ${
            known.has(currentIdx)
              ? "border-green-500 bg-green-500/10 text-green-400"
              : "border-border text-muted hover:border-accent/50"
          }`}
        >
          {known.has(currentIdx) ? "Known" : "Don't know"}
        </button>
        <button
          onClick={() => { setFlipped(false); setCurrentIdx((i) => Math.min(cards.length - 1, i + 1)); }}
          disabled={currentIdx === cards.length - 1}
          className="rounded-lg border border-border p-2 text-muted hover:text-text disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <button onClick={generate} className="mt-6 flex items-center gap-2 text-xs text-muted hover:text-accent">
        <RotateCcw size={12} /> Regenerate
      </button>
    </div>
  );
}

// ─── Mind Map UI (Issue #28) ────────────────────────────────

function MindMapUI({ notebookId }: { notebookId: string }) {
  const [loading, setLoading] = useState(false);
  const [mermaidCode, setMermaidCode] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setMermaidCode(null);
    try {
      const content = await chatApi(notebookId,
        "Create a Mermaid mindmap diagram of the key concepts from the sources. Return ONLY the mermaid code block starting with ```mermaid and ending with ```. Use the mindmap diagram type."
      );
      // Extract mermaid code
      const match = content.match(/```mermaid\s*([\s\S]*?)```/);
      if (match) {
        setMermaidCode(match[1].trim());
      } else {
        // Try to use the whole response as mermaid code
        setMermaidCode(content.trim());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  if (!mermaidCode) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="mb-4 text-sm text-muted">Generate a mind map of key concepts</p>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          {loading ? "Generating..." : "Generate Mind Map"}
        </button>
      </div>
    );
  }

  // Render via NotebookMarkdown which supports mermaid via code blocks
  const mdWithMermaid = "```mermaid\n" + mermaidCode + "\n```";

  return (
    <div className="p-4">
      <div className="mb-3 flex justify-end">
        <button onClick={generate} className="flex items-center gap-2 text-xs text-muted hover:text-accent">
          <RotateCcw size={12} /> Regenerate
        </button>
      </div>
      <NotebookMarkdown text={mdWithMermaid} />
    </div>
  );
}
