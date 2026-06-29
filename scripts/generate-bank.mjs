// Builds src/banks.json from src/structures.js using Google Gemini's free tier.
// Run locally (never deployed):  GEMINI_API_KEY=... npm run gen
// Get a free key (no billing) at https://aistudio.google.com/apikey
// The deployed site makes no API calls for exercises — it just reads the bank this produces.
//
// Optional env: GEMINI_MODEL (default gemini-3.5-flash), PER (exercises per structure, default 8),
// DELAY_MS (pause between calls to stay under the free-tier rate limit, default 4500).
// Flags: --only id1,id2 (regenerate just those) · --force (redo all, ignoring resume).
// A full run resumes by default (skips structures that already have exercises) and saves
// after every structure, so Ctrl+C is safe and re-running continues where it left off.

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { STRUCTURES } from "../src/structures.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "..", "src", "banks.json");
const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const PER = Number(process.env.PER || 8);
const DELAY_MS = Number(process.env.DELAY_MS || 4500);

function argVal(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
const ONLY = (process.env.ONLY || argVal("--only") || "").split(",").map((x) => x.trim()).filter(Boolean);

if (!KEY) {
  console.error("Set GEMINI_API_KEY in your environment first. Free key: https://aistudio.google.com/apikey");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => s.replace(/\|[^\s]+/g, "");

function prompt(s) {
  return `Generate ${PER} varied HSK 1-2 Mandarin exercises that ALL use this exact structure.
Structure: ${s.name}
Pattern: ${strip(s.pattern)}
Rule: ${s.rule}
Example: ${strip(s.zh)} (${s.en})

Return ONLY a JSON array, no markdown. Each item:
{"type":"cloze"|"translate_e2c"|"translate_c2e"|"error_correction"|"production","prompt":string,"pinyin":string,"hint":string,"answer":string,"accept":string[],"vocab":[{"w":string,"py":string,"en":string}]}
- "pinyin": full pinyin (tone marks) of any Chinese in "prompt"; "" if the prompt is English.
- "accept": 2-4 other acceptable answers for grading (alternate phrasings / spellings). For production, [].
- "vocab": the key content words involved in this item (from the answer, and from the prompt if it's Chinese), each {w: the word in hanzi, py: tone-mark pinyin, en: short English gloss}. 3-6 entries, in sentence order.
- cloze: a Chinese sentence using the structure with the key word(s) shown as ___ ; answer = the missing word(s).
- translate_e2c: short English; answer = the Chinese using the structure.
- translate_c2e: short Chinese using the structure; answer = the English.
- error_correction: a Chinese sentence with ONE mistake in the structure; answer = the corrected sentence.
- production: short English instruction to write a sentence with the structure; answer = one correct example.
Mix the types. Keep fields short.`;
}

function parse(text) {
  const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
  try { return JSON.parse(clean); } catch {
    const m = clean.match(/\[[\s\S]*\]/);
    if (m) return JSON.parse(m[0]);
    throw new Error("unparseable response");
  }
}

async function gen(s, attempt = 0) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt(s) }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096, responseMimeType: "application/json" },
    }),
  });
  if (res.status === 429 && attempt < 3) {
    const wait = 20000 * (attempt + 1);
    process.stdout.write(`rate-limited, waiting ${wait / 1000}s… `);
    await sleep(wait);
    return gen(s, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("\n");
  return parse(text);
}

const FORCE = process.argv.includes("--force");
const bank = JSON.parse(readFileSync(OUT, "utf8"));

let targets = ONLY.length ? STRUCTURES.filter((s) => ONLY.includes(s.id)) : STRUCTURES;
if (ONLY.length && !targets.length) { console.error(`No structures match --only ${ONLY.join(",")}`); process.exit(1); }
// Full run (no --only) resumes by default: skip structures that already have exercises.
// Use --force to regenerate everything; --only always regenerates the listed ids.
if (!ONLY.length && !FORCE) {
  const before = targets.length;
  targets = targets.filter((s) => !(Array.isArray(bank[s.id]) && bank[s.id].length));
  const done = before - targets.length;
  if (done) console.log(`Resuming: ${done} already have exercises, skipping them (use --force to redo).`);
}
console.log(`Model: ${MODEL} · generating ${targets.length} structure(s)${ONLY.length ? ` (${ONLY.join(", ")})` : ""}\n`);

let first = true;
for (const s of targets) {
  if (!first) await sleep(DELAY_MS);
  first = false;
  try {
    process.stdout.write(`· ${s.id} … `);
    bank[s.id] = await gen(s);
    writeFileSync(OUT, JSON.stringify(bank, null, 2)); // save after each one — Ctrl+C is now safe
    console.log(`${bank[s.id].length} exercises`);
  } catch (e) {
    console.log(`skipped\n   ${e.message.slice(0, 300)}`);
  }
}
console.log(`\nDone. Wrote ${OUT}`);
