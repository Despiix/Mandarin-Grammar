// Serverless grading proxy. Runs on Vercel (or any Node serverless host), never
// in the browser, so your ANTHROPIC_API_KEY stays secret. Set the key as an
// environment variable in your host's project settings.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });

  const { type, prompt, answer, user } = req.body || {};
  if (!prompt || user === undefined) return res.status(400).json({ error: "missing fields" });

  const grade = `Grade this Mandarin answer, accepting any valid alternative, not only the reference.
Type: ${type}
Prompt: ${prompt}
Reference: ${answer}
Learner: ${user}
Return ONLY JSON: {"correct":true|false,"feedback":string (1-2 sentences, specific, encouraging; if wrong explain the fix),"correction":string}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: grade }] }),
    });
    if (!r.ok) return res.status(502).json({ error: "upstream " + r.status });
    const data = await r.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
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
