// Serverless HSK1 conversation partner. Runs on Vercel, never in the browser,
// so your GEMINI_API_KEY stays secret. Free: uses Google Gemini's free tier.
// Optional: set GEMINI_MODEL (default gemini-3.5-flash).

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

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
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY not set" });

  const { messages } = req.body || {};
  const contents = [{ role: "user", parts: [{ text: "Let's have a simple HSK1 Chinese conversation. Greet me and ask one easy question to begin." }] }];
  for (const m of messages || []) contents.push({ role: m.role === "ai" ? "model" : "user", parts: [{ text: String(m.text || "") }] });

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 300, responseMimeType: "application/json" },
      }),
    });
    if (!r.ok) return res.status(502).json({ error: "upstream " + r.status });
    const data = await r.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("\n");
    const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch { const m = clean.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; }
    if (!parsed || !parsed.hanzi) return res.status(502).json({ error: "unparseable" });
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(502).json({ error: String(e).slice(0, 120) });
  }
}
