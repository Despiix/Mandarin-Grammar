// Serverless HSK1 conversation partner. Runs on Vercel, never in the browser,
// so your GROQ_API_KEY stays secret. Uses Groq (open-weight Llama/Qwen models)
// through its OpenAI-compatible endpoint — fast, generous free tier, no card.
// Free key: https://console.groq.com → API Keys
// Optional env: GROQ_MODEL (default llama-3.3-70b-versatile), GROQ_BASE.

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const BASE = process.env.GROQ_BASE || "https://api.groq.com/openai/v1";

const SYSTEM = `You are a warm, patient Mandarin tutor and conversation partner for an HSK1 beginner.
On EVERY turn do two things, in order:
1) CORRECTION: Check the learner's most recent message for real mistakes — grammar, word order, word choice, wrong/missing characters. In "correction", give a VERY concise step-by-step note in English: at most 3 short numbered steps, under ~35 words total, each showing the corrected Chinese. Don't nitpick tiny things. If it was already correct, just say "Perfect!" (optionally one short tip). If there is no learner message yet (the very first turn), use "".
2) REPLY: Then continue the conversation naturally — ONE short HSK1 sentence (3-9 Chinese characters) plus one simple question.
Use ONLY HSK1 vocabulary and grammar. No rare words, idioms, or grammar beyond HSK1.
Output ONLY a JSON object with EXACTLY these string fields:
- "correction": the concise inline note from step 1 (English, under ~30 words; "" if nothing to correct or no learner message yet).
- "why": a slightly fuller plain-English explanation of WHY it was wrong and the simple rule, for a beginner (1-2 sentences; "" if correct or no learner message yet).
- "fixed": the learner's sentence rewritten correctly in Simplified Chinese ("" if there was nothing to fix).
- "fixedPinyin": full tone-mark pinyin of "fixed", spaces between syllables ("" if "fixed" is "").
- "hanzi": your reply in Simplified Chinese characters (汉字). REQUIRED — never empty.
- "pinyin": full pinyin of "hanzi" with tone marks, spaces between syllables.
- "en": short English translation of "hanzi".
Example: {"correction":"Drop 是 — just use 叫.","why":"After 叫 (to be called) you don't add 是. 我叫 Bina already means 'I am called Bina'.","fixed":"我叫 Bina。","fixedPinyin":"wǒ jiào Bina","hanzi":"你好，Bina！你几岁？","pinyin":"nǐ hǎo Bina nǐ jǐ suì","en":"Hi Bina! How old are you?"}
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
      body: JSON.stringify({ model: MODEL, messages: msgs, temperature: 0.7, max_tokens: 1000 }),
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
