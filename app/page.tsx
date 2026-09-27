"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";

type Role = "user" | "assistant";
type Message = { role: Role; content: string };

export default function Page() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

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

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data: { reply?: string } = await response.json();
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
        <p className="tagline">Your AI that gets things done.</p>
      </header>

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
