import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Role = "user" | "assistant" | "system";
type Message = { role: Role; content: string };

type Provider = {
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
};

const SYSTEM_PROMPT =
  "You are Hyper AI Assistant. Be concise, direct and practical. Answer in plain language and avoid filler.";

const GROQ = {
  name: "Groq",
  endpoint: "https://api.groq.com/openai/v1/chat/completions",
  defaultModel: "qwen/qwen3.8-27b",
};

const OPENROUTER = {
  name: "OpenRouter",
  endpoint: "https://openrouter.ai/api/v1/chat/completions",
  defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
};

const OPENAI = {
  name: "OpenAI",
  endpoint: "https://api.openai.com/v1/chat/completions",
  defaultModel: "gpt-4o-mini",
};

/** Identifies a provider from the shape of the key itself. */
function providerFromKey(key: string): Provider | null {
  const trimmed = key.trim();
  if (trimmed.length === 0) return null;

  const model = process.env.MODEL;

  if (trimmed.startsWith("gsk_")) {
    return { ...GROQ, apiKey: trimmed, model: model ?? GROQ.defaultModel };
  }

  if (trimmed.startsWith("sk-or-")) {
    return {
      ...OPENROUTER,
      apiKey: trimmed,
      model: model ?? OPENROUTER.defaultModel,
    };
  }

  if (trimmed.startsWith("sk-")) {
    return { ...OPENAI, apiKey: trimmed, model: model ?? OPENAI.defaultModel };
  }

  return null;
}

/** Server-side keys take priority; a browser-supplied key is the fallback. */
function resolveProvider(suppliedKey?: string): Provider | null {
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    return {
      ...GROQ,
      apiKey: groqKey,
      model: process.env.MODEL ?? GROQ.defaultModel,
    };
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    return {
      ...OPENROUTER,
      apiKey: openRouterKey,
      model: process.env.MODEL ?? OPENROUTER.defaultModel,
    };
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    return {
      ...OPENAI,
      apiKey: openAiKey,
      model: process.env.MODEL ?? process.env.OPENAI_MODEL ?? OPENAI.defaultModel,
    };
  }

  if (suppliedKey) {
    return providerFromKey(suppliedKey);
  }

  return null;
}

function parseBody(body: unknown): { messages: Message[]; apiKey?: string } {
  if (!body || typeof body !== "object") {
    return { messages: [] };
  }

  const candidate = body as { messages?: unknown; apiKey?: unknown };

  return {
    messages: Array.isArray(candidate.messages)
      ? (candidate.messages as Message[])
      : [],
    apiKey: typeof candidate.apiKey === "string" ? candidate.apiKey : undefined,
  };
}

/** Reports whether a key is configured on the server. */
export async function GET() {
  const provider = resolveProvider();

  return NextResponse.json({
    connected: provider !== null,
    provider: provider?.name ?? null,
    model: provider?.model ?? null,
  });
}

export async function POST(request: Request) {
  let messages: Message[];
  let suppliedKey: string | undefined;

  try {
    const parsed = parseBody(await request.json());
    messages = parsed.messages;
    suppliedKey = parsed.apiKey;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (messages.length === 0) {
    return NextResponse.json(
      { error: "No messages were provided." },
      { status: 400 },
    );
  }

  const provider = resolveProvider(suppliedKey);

  if (!provider) {
    return NextResponse.json({
      connected: false,
      reply:
        "No model is connected yet. Open Settings in this page and paste an API key from Groq, OpenRouter or OpenAI to start.",
    });
  }

  try {
    const response = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json(
        {
          error: `${provider.name} returned status ${response.status}.`,
          detail: detail.slice(0, 300),
        },
        { status: 502 },
      );
    }

    const data: {
      choices?: Array<{ message?: { content?: string } }>;
    } = await response.json();

    return NextResponse.json({
      connected: true,
      provider: provider.name,
      reply:
        data.choices?.[0]?.message?.content ??
        "The model returned an empty response.",
    });
  } catch {
    return NextResponse.json(
      { error: `Could not reach ${provider.name}.` },
      { status: 502 },
    );
  }
}
