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

/**
 * Picks the first configured provider. Groq and OpenRouter both offer free
 * tiers, so they are checked before OpenAI, which requires paid credit.
 */
function resolveProvider(): Provider | null {
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    return {
      name: "Groq",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: groqKey,
      model: process.env.MODEL ?? "llama-3.3-70b-versatile",
    };
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    return {
      name: "OpenRouter",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: openRouterKey,
      model: process.env.MODEL ?? "meta-llama/llama-3.3-70b-instruct:free",
    };
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    return {
      name: "OpenAI",
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: openAiKey,
      model: process.env.MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    };
  }

  return null;
}

function extractMessages(body: unknown): Message[] {
  if (
    body &&
    typeof body === "object" &&
    Array.isArray((body as { messages?: unknown }).messages)
  ) {
    return (body as { messages: Message[] }).messages;
  }
  return [];
}

/** Lets the interface show whether a model provider is connected. */
export async function GET() {
  const provider = resolveProvider();

  return NextResponse.json({
    connected: provider !== null,
    provider: provider?.name ?? null,
    model: provider?.model ?? null,
  });
}

export async function POST(request: Request) {
  const provider = resolveProvider();

  if (!provider) {
    return NextResponse.json({
      connected: false,
      reply:
        "No model provider is connected yet, so I cannot answer properly. Add a GROQ_API_KEY, OPENROUTER_API_KEY or OPENAI_API_KEY under Settings, Environment Variables in Vercel, then redeploy.",
    });
  }

  let messages: Message[];

  try {
    messages = extractMessages(await request.json());
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
          detail: detail.slice(0, 400),
        },
        { status: 502 },
      );
    }

    const data: {
      choices?: Array<{ message?: { content?: string } }>;
    } = await response.json();

    const reply = data.choices?.[0]?.message?.content;

    return NextResponse.json({
      connected: true,
      provider: provider.name,
      reply: reply ?? "The model returned an empty response.",
    });
  } catch {
    return NextResponse.json(
      { error: `Could not reach ${provider.name}.` },
      { status: 502 },
    );
  }
}
