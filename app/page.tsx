"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Key,
  Loader2,
  Send,
  Sparkles,
  SquarePen,
} from "lucide-react";

type Role = "user" | "assistant";
type Message = { role: Role; content: string };
type Status = { connected: boolean; provider: string | null };

const STORAGE_KEY = "hyper.apiKey";
const MESSAGES_KEY = "hyper.messages";

export default function Page() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) ?? "";
    setApiKey(stored);
    setKeyDraft(stored);

    // Restore the conversation. Phones aggressively discard background tabs,
    // so in-memory state alone loses the thread whenever the page is reloaded.
    try {
      const saved = window.localStorage.getItem(MESSAGES_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) setMessages(parsed as Message[]);
      }
    } catch {
      // A corrupt entry should never block startup.
    }
  }, []);

  useEffect(() => {
    try {
      // Keep the tail only: long threads can exceed the storage quota.
      window.localStorage.setItem(
        MESSAGES_KEY,
        JSON.stringify(messages.slice(-100)),
      );
    } catch {
      // Storage may be full or blocked; the chat still works in memory.
    }
  }, [messages]);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/chat");
      if (!response.ok) return;
      setStatus((await response.json()) as Status);
    } catch {
      // Status is advisory only.
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const ready = Boolean(status?.connected) || apiKey.trim().length > 0;

  function saveKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = keyDraft.trim();
    window.localStorage.setItem(STORAGE_KEY, trimmed);
    setApiKey(trimmed);
    setShowSettings(false);
    setError(null);
  }

  function clearKey() {
    window.localStorage.removeItem(STORAGE_KEY);
    setApiKey("");
    setKeyDraft("");
  }

  function startNewChat() {
    setMessages([]);
    setError(null);
    window.localStorage.removeItem(MESSAGES_KEY);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();
    if (!text || loading) return;

    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          apiKey: apiKey.trim() || undefined,
        }),
      });

      const data: { reply?: string; error?: string; detail?: string } =
        await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? `Request failed (${response.status})`);
      }

      setMessages([
        ...next,
        { role: "assistant", content: data.reply ?? "No response received." },
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <header className="header">
        <div className="brand">
          <Sparkles size={20} aria-hidden="true" />
          <span>Hyper AI Assistant</span>
          <button
            className="settings-toggle"
            type="button"
            onClick={startNewChat}
            aria-label="New chat"
            title="New chat"
          >
            <SquarePen size={16} aria-hidden="true" />
          </button>
          <button
            className="settings-toggle"
            type="button"
            onClick={() => setShowSettings((open) => !open)}
            aria-label="API key settings"
          >
            <Key size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="tagline">
          {status?.connected
            ? `Connected to ${status.provider}.`
            : apiKey
              ? "Connected with your saved key."
              : "Your AI that gets things done."}
        </p>
      </header>

      {showSettings ? (
        <form className="settings" onSubmit={saveKey}>
          <label htmlFor="apiKey">API key</label>
          <p className="hint">
            Paste a key from Groq (free, starts with <code>gsk_</code>),
            OpenRouter (<code>sk-or-</code>) or OpenAI (<code>sk-</code>). It is
            stored only in this browser and never committed to the repository.
          </p>
          <div className="settings-row">
            <input
              id="apiKey"
              className="field"
              type="password"
              value={keyDraft}
              onChange={(event) => setKeyDraft(event.target.value)}
              placeholder="gsk_..."
              autoComplete="off"
              spellCheck={false}
            />
            <button className="primary" type="submit">
              Save
            </button>
          </div>
          {apiKey ? (
            <button className="link" type="button" onClick={clearKey}>
              Remove saved key
            </button>
          ) : null}
        </form>
      ) : null}

      {!ready && !showSettings ? (
        <div className="notice" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            <strong>No model connected.</strong> Tap the key icon above and
            paste an API key to start. A free key from console.groq.com works.
          </div>
        </div>
      ) : null}

      <section className="thread" aria-live="polite">
        {messages.length === 0 && !loading ? (
          <div className="empty">
            <p>Ask anything to get started.</p>
          </div>
        ) : null}

        {messages.map((message, index) => (
          <article
            key={`${message.role}-${index}`}
            className={`bubble ${message.role}`}
          >
            {message.content}
          </article>
        ))}

        {loading ? (
          <article className="bubble assistant pending">
            <Loader2 className="spin" size={16} aria-hidden="true" />
            <span>Thinking</span>
          </article>
        ) : null}

        {error ? <p className="error">{error}</p> : null}

        <div ref={endRef} />
      </section>

      <form className="composer" onSubmit={handleSubmit}>
        <input
          className="field"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={ready ? "Send a message" : "Add an API key to begin"}
          aria-label="Message"
          autoComplete="off"
        />
        <button
          className="send"
          type="submit"
          disabled={loading || input.trim().length === 0}
          aria-label="Send message"
        >
          <Send size={18} aria-hidden="true" />
        </button>
      </form>
    </main>
  );
}
