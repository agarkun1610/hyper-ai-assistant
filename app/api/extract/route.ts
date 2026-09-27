import { NextResponse } from "next/server";

export const runtime = "edge";

/**
 * Reads a photographed invoice or GST notice into structured fields.
 *
 * The model's only job is transcription. It is told to copy what is printed
 * and to leave anything unreadable empty, because a plausible invented figure
 * is far more dangerous in a tax record than a blank one. Every judgement
 * about whether the numbers are correct happens afterwards, in lib/gst.ts.
 */

const DEFAULT_MODEL = "qwen/qwen2.5-vl-72b-instruct";

function envValue(name: string): string {
  const raw = process.env[name];
  const trimmed = (raw ?? "").trim();
  return trimmed.length > 0 ? trimmed : "";
}

const INSTRUCTIONS = `You transcribe Indian GST documents into JSON. Copy only what is printed.

Decide which of these the image is:
- "purchase" or "sale": a tax invoice
- "notice": a communication from the GST department

For an invoice return exactly:
{"kind":"purchase"|"sale","invoiceNumber":"","date":"YYYY-MM-DD","partyName":"","partyGstin":"","items":[{"description":"","quantity":0,"unit":"","gstRate":0,"taxableValue":0}],"taxableValue":0,"cgst":0,"sgst":0,"igst":0,"total":0}

For a notice return exactly:
{"kind":"notice","formType":"","noticeNumber":"","date":"YYYY-MM-DD","dueDate":"YYYY-MM-DD","period":"","gstin":"","issue":"","amount":0}

Rules:
- Numbers must be plain digits with no currency symbol, commas or spaces.
- A GSTIN is exactly 15 characters. If you cannot read every character with certainty, return "".
- Never guess a figure you cannot see. Use 0 for an unreadable number and "" for unreadable text.
- formType is the form printed on the notice, such as ASMT-10, DRC-01, DRC-01C or ADT-01.
- issue is one sentence stating what the department says is wrong.
- Return the JSON object only, with no explanation and no code fences.`;

type Body = {
  image?: string;
  apiKey?: string;
  model?: string;
};

export async function POST(request: Request) {
  let body: Body;

  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const image = (body.image ?? "").trim();
  if (!image.startsWith("data:image/")) {
    return NextResponse.json(
      { error: "Attach a photo of the invoice or notice." },
      { status: 400 },
    );
  }

  // A key typed into the app is a deliberate act and outranks the server's.
  const apiKey = (body.apiKey ?? "").trim() || envValue("OPENROUTER_API_KEY");

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "No OpenRouter key. Tap the key icon and paste one — reading images needs a model that can see, which Groq does not provide.",
      },
      { status: 400 },
    );
  }

  const model =
    (body.model ?? "").trim() || envValue("VISION_MODEL") || DEFAULT_MODEL;

  let response: Response;

  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: INSTRUCTIONS },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach OpenRouter. Check the connection." },
      { status: 502 },
    );
  }

  const raw = await response.text();

  if (!response.ok) {
    return NextResponse.json(
      {
        error: `OpenRouter returned status ${response.status}.`,
        detail: raw.slice(0, 500),
        model,
      },
      { status: 502 },
    );
  }

  let content = "";

  try {
    const parsed = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    content = parsed.choices?.[0]?.message?.content ?? "";
  } catch {
    return NextResponse.json(
      { error: "OpenRouter sent a reply that could not be read." },
      { status: 502 },
    );
  }

  // Models often wrap JSON in prose or fences despite instructions.
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");

  if (start < 0 || end <= start) {
    return NextResponse.json(
      {
        error:
          "Nothing readable came back from the image. Try a straighter, brighter photo.",
        model,
      },
      { status: 422 },
    );
  }

  try {
    const extracted: unknown = JSON.parse(content.slice(start, end + 1));
    return NextResponse.json({ extracted, model });
  } catch {
    return NextResponse.json(
      {
        error:
          "The document was read but the fields came back malformed. Try again.",
        model,
      },
      { status: 422 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    connected: Boolean(envValue("OPENROUTER_API_KEY")),
    model: envValue("VISION_MODEL") || DEFAULT_MODEL,
  });
}
