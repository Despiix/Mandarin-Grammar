// Serverless grading proxy. Runs on Vercel (or any Node serverless host), never
// in the browser, so your GROQ_API_KEY stays secret. Set the key as an
// environment variable in your host's project settings.
//
// Uses Groq (open-weight Llama/Qwen models) via its OpenAI-compatible endpoint —
// fast, generous free tier, no card. Free key: https://console.groq.com
// Optional env: GROQ_MODEL (default llama-3.3-70b-versatile), GROQ_BASE.

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const BASE = process.env.GROQ_BASE || "https://api.groq.com/openai/v1";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(500).json({ error: "GROQ_API_KEY not set" });

  const { type, prompt, answer, user } = req.body || {};
  if (!prompt || user === undefined) return res.status(400).json({ error: "missing fields" });

  const grade = `Grade this Mandarin answer, accepting any valid alternative, not only the reference.
Type: ${type}
Prompt: ${prompt}
Reference: ${answer}
Learner: ${user}
Return ONLY JSON: {"correct":true|false,"feedback":string (1-2 sentences, specific, encouraging; if wrong explain the fix),"correction":string}`;

  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: grade }], temperature: 0.2, max_tokens: 1000, response_format: { type: "json_object" } }),
    });
    if (!r.ok) return res.status(502).json({ error: "upstream " + r.status });
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || "";
    const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch { const m = clean.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; }
    if (!parsed) return res.status(502).json({ error: "unparseable" });
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(502).json({ error: String(e).slice(0, 120) });
  }
}
