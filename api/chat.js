// Serverless HSK1 conversation partner. Runs on Vercel, never in the browser,
// so your GROQ_API_KEY stays secret. Uses Groq (open-weight Llama/Qwen models)
// through its OpenAI-compatible endpoint — fast, generous free tier, no card.
// Free key: https://console.groq.com → API Keys
// Optional env: GROQ_MODEL (default qwen/qwen3-32b — Chinese-native), GROQ_BASE.

const MODEL = process.env.GROQ_MODEL || "qwen/qwen3-32b";
const BASE = process.env.GROQ_BASE || "https://api.groq.com/openai/v1";

const SYSTEM = `You are a warm, patient Mandarin conversation partner for an absolute beginner (HSK1).
Rules:
- Use ONLY HSK1 vocabulary and grammar. Keep every reply to ONE short, natural sentence (3-9 Chinese characters).
- Reply briefly, then ask ONE simple HSK1 question. No rare words, idioms, or grammar beyond HSK1.
- Gently model the correct form if the learner makes a mistake — don't lecture.
Output ONLY a JSON object with EXACTLY these three string fields:
- "hanzi": your reply written in Simplified Chinese characters (汉字). REQUIRED — never empty; this is the actual reply.
- "pinyin": full pinyin of "hanzi" with tone marks, spaces between syllables.
- "en": a short English translation.
Example: {"hanzi":"你好！你叫什么名字？","pinyin":"nǐ hǎo nǐ jiào shén me míng zi","en":"Hi! What's your name?"}
Reply with the JSON object only — no reasoning, no extra text. /no_think`;

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
      body: JSON.stringify({ model: MODEL, messages: msgs, temperature: 0.7, max_tokens: 800 }),
    });
    if (!r.ok) return res.status(502).json({ error: ("upstream " + r.status + " " + (await r.text())).slice(0, 200) });
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || "";
    const clean = text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```json/g, "").replace(/```/g, "").trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch { const m = clean.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; }
    if (!parsed || !parsed.hanzi) return res.status(502).json({ error: "unparseable model output: " + String(text).slice(0, 160) });
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(502).json({ error: String(e).slice(0, 120) });
  }
}
