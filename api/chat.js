// Serverless HSK1 conversation partner. Runs on Vercel, never in the browser,
// so your GROQ_API_KEY stays secret. Uses Groq (open-weight Llama/Qwen models)
// through its OpenAI-compatible endpoint — fast, generous free tier, no card.
// Free key: https://console.groq.com → API Keys
// Optional env: GROQ_MODEL (default llama-3.3-70b-versatile), GROQ_BASE.

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const BASE = process.env.GROQ_BASE || "https://api.groq.com/openai/v1";

const SYSTEM = `You are a warm, patient Mandarin conversation partner for an absolute beginner (HSK1).
Rules:
- Use ONLY HSK1 vocabulary and grammar. Keep every reply to ONE short, natural sentence (ideally 3-9 characters).
- Keep the chat going: respond briefly, then ask ONE simple HSK1 question.
- Never use rare words, idioms (chengyu), or grammar beyond HSK1.
- If the learner makes a small mistake, gently model the correct form — don't lecture.
- Always reply in Simplified Chinese.
Return ONLY JSON: {"hanzi": your reply in simplified characters, "pinyin": full tone-mark pinyin of the hanzi (spaces between syllables), "en": a short English translation}`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(500).json({ error: "GROQ_API_KEY not set" });

  const { messages } = req.body || {};
  const msgs = [
    { role: "system", content: SYSTEM },
    { role: "user", content: "Let's have a simple HSK1 Chinese conversation. Greet me and ask one easy question to begin." },
  ];
  for (const m of messages || []) msgs.push({ role: m.role === "ai" ? "assistant" : "user", content: String(m.text || "") });

  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, messages: msgs, temperature: 0.7, max_tokens: 300, response_format: { type: "json_object" } }),
    });
    if (!r.ok) return res.status(502).json({ error: ("upstream " + r.status + " " + (await r.text())).slice(0, 200) });
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || "";
    const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch { const m = clean.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; }
    if (!parsed || !parsed.hanzi) return res.status(502).json({ error: "unparseable model output: " + String(text).slice(0, 160) });
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(502).json({ error: String(e).slice(0, 120) });
  }
}
