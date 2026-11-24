import { buildSentencePrompt, parseSentenceVerdict, sentenceGate } from "../web/src/lib/sentence";

interface Env {
  AI: {
    run(model: string, input: {
      messages: { role: string; content: string }[];
      max_tokens: number;
      temperature: number;
    }): Promise<{ response?: string } | string>;
  };
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const MODEL = "@cf/ibm-granite/granite-4.0-h-micro";
const WINDOW_MS = 60_000;
const LIMIT = 45;
const hits = new Map<string, number[]>();

function limited(ip: string, now: number): boolean {
  const recent = (hits.get(ip) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((time) => now - time >= WINDOW_MS)) hits.delete(key);
    }
  }
  return false;
}

function modelText(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  const record = result as { response?: unknown; result?: { response?: unknown } };
  if (typeof record.response === "string") return record.response;
  if (typeof record.result?.response === "string") return record.result.response;
  return "";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/sentence") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      return grade(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

async function grade(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  if (limited(ip, Date.now())) {
    return Response.json({ error: "unavailable" }, { status: 429 });
  }
  let body: { word?: unknown; gloss?: unknown; sentence?: unknown };
  try {
    body = await request.json() as { word?: unknown; gloss?: unknown; sentence?: unknown };
  } catch {
    return Response.json({ error: "unavailable" }, { status: 400 });
  }
  const word = String(body.word ?? "").slice(0, 80);
  const gloss = String(body.gloss ?? "").slice(0, 400);
  const sentence = String(body.sentence ?? "");
  const gate = sentenceGate(word, gloss, sentence);
  if (!gate.ok) return Response.json({ ok: false, reason: gate.reason });
  try {
    const result = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: "You only answer yes or no." },
        { role: "user", content: buildSentencePrompt(word, gloss, sentence) },
      ],
      max_tokens: 180,
      temperature: 0,
    });
    const verdict = parseSentenceVerdict(modelText(result));
    if (verdict.ok === null) return Response.json({ error: "unavailable" }, { status: 503 });
    if (verdict.ok) return Response.json({ ok: true });
    return Response.json({ ok: false, reason: verdict.reason });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
