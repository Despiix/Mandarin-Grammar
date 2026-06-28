# Frame — Mandarin grammar trainer

An offline-first study app for drilling Mandarin grammar patterns. Installs to
your phone as a PWA, works with no connection, and uses **AI grading whenever
you're online** — falling back to local grading (with an offline bar) when
you're not.

## How grading works

- **Online:** every answer is graded by Claude via a tiny serverless function
  (`/api/grade`) that keeps your API key server-side. You get real feedback, and
  even "write your own" gets judged properly.
- **Offline:** a bar appears at the top and grading falls back to matching
  against the accepted answers baked into the pre-generated bank. "Write your
  own" switches to reveal-a-model-answer + self-mark.

Exercises themselves are always served from `src/banks.json` (pre-generated), so
practice works with zero connection. Progress (New / Learning / Known) is saved
per-device in `localStorage`.

## Run locally

Requires Node 18+.

```bash
npm install
npm run dev        # http://localhost:5173
```

Ships with a starter bank (是 / 的 / adjective predicate) so it runs immediately.
The `/api/grade` function only runs on a real host (see deploy), so locally you'll
get the offline fallback unless you run `vercel dev`.

## Fill the full exercise bank

Runs on your machine, never on the deployed site. Costs a few cents.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run gen        # writes src/banks.json for every structure
```

## Add your own structures

1. Add an entry to `src/structures.js` (hanzi tokens are `char|pinyin`).
2. Run `npm run gen`.

## Deploy free (Vercel — recommended, runs the AI grader)

The grading function needs a server, which GitHub Pages can't provide — so deploy
on Vercel's free tier. Your code still lives on GitHub.

1. Push to a GitHub repo:
   ```bash
   git init && git add . && git commit -m "init"
   git remote add origin https://github.com/<you>/<repo>.git
   git branch -M main && git push -u origin main
   ```
2. On [vercel.com](https://vercel.com): **Add New → Project → import your repo**.
   Vercel auto-detects Vite; just deploy.
3. In the project's **Settings → Environment Variables**, add
   `ANTHROPIC_API_KEY` = your key, then redeploy.
4. Live at `https://<project>.vercel.app`. The `/api/grade` function is picked up
   automatically from the `api/` folder.

On your phone: open the URL → **Add to Home Screen**. It installs and runs
offline; AI grading kicks in whenever you have a connection.

> Prefer GitHub Pages? You can still deploy the static app there using the
> included `.github/workflows/deploy.yml`, but the AI grader won't run — it'll
> behave as if permanently offline (local grading only). Cloudflare Pages is
> another free option that *does* support functions, with a slightly different
> function signature.

## Cost summary

- Hosting (Vercel Hobby): free.
- Offline use: free — no API calls.
- Online grading: a few cents' worth of API usage per session, billed to your key.
- `npm run gen`: a few cents, only when you rebuild the bank.
