import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Role = "user" | "assistant" | "system";
type Message = { role: Role; content: string };

const NO_PROVIDER_REPLY =
  "Hyper AI Assistant is deployed and running. No model provider is connected yet, so this is a local placeholder response. Add OPENAI_API_KEY (and optionally OPENAI_MODEL) under Settings, Environment Variables in your Vercel project, then redeploy to enable live answers.";

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

export async function POST(request: Request) {
  let messages: Message[];

  try {
    messages = extractMessages(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ reply: NO_PROVIDER_REPLY });
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are Hyper AI Assistant. Be concise, direct and practical.",
          },
          ...messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Model provider returned status ${response.status}.` },
        { status: 502 },
      );
    }

    const data: {
      choices?: Array<{ message?: { content?: string } }>;
    } = await response.json();

    const reply = data.choices?.[0]?.message?.content;

    return NextResponse.json({
      reply: reply ?? "The model returned an empty response.",
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the model provider." },
      { status: 502 },
    );
  }
}
