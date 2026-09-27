# Hyper AI Assistant

Your AI that gets things done.

A Next.js App Router project with a chat interface and a provider-agnostic
chat API. The interface loads without any API key and tells you plainly when
no model is connected.

## Connect a model

Set **one** of these as an environment variable. Two of the three are free.

| Provider | Variable | Cost | Get a key |
| --- | --- | --- | --- |
| Groq | `GROQ_API_KEY` | Free tier | https://console.groq.com |
| OpenRouter | `OPENROUTER_API_KEY` | Free models available | https://openrouter.ai |
| OpenAI | `OPENAI_API_KEY` | Paid credit required | https://platform.openai.com |

Optionally set `MODEL` to override the default model for that provider.

If more than one key is present, Groq is used first, then OpenRouter, then
OpenAI.

### On Vercel

1. Open the project, then **Settings**, then **Environment Variables**
2. Add `GROQ_API_KEY` with your key, applied to Production
3. Go to **Deployments** and redeploy the latest commit

The header will then read "Connected to Groq" instead of showing the setup
notice.

## Run locally

```
cp .env.example .env.local   # add your key
npm install
npm run dev
```

## Production build

```
npm run build
npm start
```

## Project layout

```
app/
  layout.tsx        root layout and metadata
  page.tsx          chat interface
  globals.css       styles
  api/chat/route.ts GET returns provider status, POST sends a chat turn
```

## Note on deployments

Next.js requires an `app/` or `pages/` directory. Uploading only the root
config files through the GitHub web interface will produce a build that
fails immediately, because the web uploader cannot upload folders. Use `git`
or drag a whole folder from a desktop browser.
