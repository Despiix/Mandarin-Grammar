# Adding structures without Claude Code

You don't need Claude Code (or any special tool) to add grammar patterns. A
structure is just an entry in `src/structures.js`; its practice questions are an
entry in `src/banks.json`. Both are plain text files you can edit by hand.

The only "AI" step is drafting those entries from your lesson notes — and **any
chatbot can do it** (claude.ai free tier, Gemini, ChatGPT, …) using the
copy-paste prompt below. Pick the path that matches what you have available.

---

## Path A — you have Node installed (easiest)

1. Add the structure entry to the `STRUCTURES` array in `src/structures.js`
   (use the chatbot prompt below for just **step 1**, or hand-write it).
2. Build the exercises automatically:
   ```powershell
   $env:GEMINI_API_KEY="your-free-key"; npm run gen
   ```
   (Free key: https://aistudio.google.com/apikey)
3. Commit `src/structures.js` **and** `src/banks.json`, then push. Vercel redeploys.

## Path B — browser only (no Node, no Claude Code)

The chatbot generates the structure entry **and** its exercises; you paste both in.

1. Run the prompt below in any chatbot, pasting your lesson text at the bottom.
2. Paste each **structure object** into the `STRUCTURES` array in
   `src/structures.js`, inside the matching category group.
3. Paste each **exercises array** into `src/banks.json` as a new
   `"id": [ … ]` key in the top-level object.
4. Commit both files and push (you can edit files directly on github.com if you
   have no editor — use the pencil icon, then "Commit changes").

> Keep `banks.json` valid JSON: comma between entries, **no trailing comma** after
> the last one. If the site shows a blank page after editing, that's almost always
> a stray/missing comma here.

---

## The copy-paste prompt

Paste everything in this box into the chatbot, then paste your lesson text where
it says `<PASTE LESSON TEXT HERE>`.

```
You are helping me add Mandarin grammar patterns to my study app. I'll give you
lesson notes. Find each NEW grammar pattern (ignore plain vocabulary and pinyin
glosses). For EACH pattern output two things.

(1) A structure entry — a JavaScript object in EXACTLY this shape:
{ id: "short-slug", cat: "<category>", name: "汉字 — short English gloss",
  pattern: "...", rule: "1-2 English sentences with a Chinese example.",
  zh: "char|pinyin char|pinyin ...", en: "English translation." }

Field rules:
- id: short unique lowercase slug (e.g. "cong-dao"). Must not clash with existing ids.
- cat: ONE of: identity | question | location | action | degree | quantity | extra
- name: the Chinese pattern + " — " + a short English gloss.
- pattern: write fixed Chinese words as char|pinyin (e.g. 就|jiù). Write blanks as
  one of these slot tokens: A B C S O N V X adj adv num mw place time sb sth
  vehicle thing 方位词. Leave symbols/English as plain text (／ + ? … etc.).
- zh: ONE natural example sentence. EVERY Chinese character written as char|pinyin,
  space-separated, one token per character, with tone-mark pinyin
  (e.g. "我|wǒ 在|zài 家|jiā"). No English here.
- en: plain English translation of the zh sentence.

(2) An exercises array for that same id. Generate 8 varied HSK 1-2 exercises that
all use the pattern. Each item:
{"type":"cloze"|"translate_e2c"|"translate_c2e"|"error_correction"|"production",
 "prompt":string,"pinyin":string,"hint":string,"answer":string,"accept":string[],
 "vocab":[{"w":string,"py":string,"en":string}]}
- pinyin: tone-mark pinyin of any Chinese in "prompt"; "" if the prompt is English.
- accept: 2-4 other acceptable answers (alternate phrasings/spellings); [] for production.
- vocab: 3-6 key content words involved (from the answer, and from the prompt if it's
  Chinese), each {w: hanzi, py: tone-mark pinyin, en: short gloss}, in sentence order.
- cloze: a Chinese sentence using the pattern with the key word(s) shown as ___ ;
  answer = the missing word(s).
- translate_e2c: short English; answer = the Chinese using the pattern.
- translate_c2e: short Chinese using the pattern; answer = the English.
- error_correction: a Chinese sentence with ONE mistake; answer = the corrected sentence.
- production: short English instruction to write a sentence; answer = one example.
Mix the types. Keep fields short.

Output format: first list all structure objects, then a single JSON object mapping
each id to its exercises array. Nothing else.

Lesson text:
<PASTE LESSON TEXT HERE>
```

---

## Worked example of the two file edits

A finished **structure entry** (in `src/structures.js`):

```js
{ id: "jiu", cat: "action", name: "就 — then / soon (…就 V 了)", pattern: "… 就|jiù V 了|le",
  rule: "就 says something happens right away or sooner than expected: 十分钟就到了. Often closed with 了.",
  zh: "十|shí 分|fēn 钟|zhōng 就|jiù 到|dào 了|le", en: "You'll be there in ten minutes." },
```

Its **exercises** (in `src/banks.json`, as a new top-level key):

```json
"jiu": [
  { "type": "translate_e2c", "prompt": "Go straight ahead and you'll be there.", "pinyin": "", "hint": "use 就…了", "answer": "往前走就到了。", "accept": ["往前走就到了"],
    "vocab": [{ "w": "往前走", "py": "wǎng qián zǒu", "en": "go forward" }, { "w": "就", "py": "jiù", "en": "then / right away" }, { "w": "到", "py": "dào", "en": "arrive" }] }
]
```

That's the whole system. Edit two files, commit, push.
