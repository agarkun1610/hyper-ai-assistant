"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Send, Sparkles } from "lucide-react";

type Role = "user" | "assistant";
type Message = { role: Role; content: string };
type Status = { connected: boolean; provider: string | null };

export default function Page() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/chat");
      if (!response.ok) return;
      const data: Status = await response.json();
      setStatus(data);
    } catch {
      // Status is advisory only; the chat still works without it.
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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
        body: JSON.stringify({ messages: next }),
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
        </div>
        <p className="tagline">
          {status?.connected
            ? `Connected to ${status.provider}.`
            : "Your AI that gets things done."}
        </p>
      </header>

      {status && !status.connected ? (
        <div className="notice" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            <strong>No model connected.</strong> Add{" "}
            <code>GROQ_API_KEY</code>, <code>OPENROUTER_API_KEY</code> or{" "}
            <code>OPENAI_API_KEY</code> in Vercel under Settings, Environment
            Variables, then redeploy.
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
          placeholder="Send a message"
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
