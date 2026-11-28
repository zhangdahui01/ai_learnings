# 首尔生活助手 Seoul Life

A phone web app for living in Seoul without Korean: photograph a supermarket shelf, a menu, a cosmetics label or a subway sign and get what each thing is in Chinese and English, a recommendation for the need you typed, unit prices, and the Korean words worth remembering saved to a word list.

Live at https://seoul-life-app.vercel.app. On an iPhone, open it in Safari and use Share → Add to Home Screen.

```text
seoul-life-app/
├── app/            Next.js App Router: one page with tabs, plus the /api/scan route
├── components/     Login, Scan, Vocab, Me
├── lib/            Supabase clients, scenes and prompts, unit price maths, Korean speech
├── public/         App icons
└── sql/            Database schema (tables, row level security, storage buckets)
```

## How it works

- The phone shrinks the photo to 1568 px on the long edge and posts it to `/api/scan` with the scene and the typed need.
- The route checks the signed-in user, counts the scan against a daily limit of 50, and asks Claude (Haiku 5.5 by default) for a structured result through a forced tool call.
- Unit prices (per 100 g, per 100 ml, per piece, with 1+1 and 2+1 promotions folded in) are computed in `lib/unitPrice.ts`, never by the model.
- The scan, its items, the photo and the new words are saved under the user's own rows. Saving is best effort: a failed write does not hide the result.
- Korean is read aloud with the phone's built-in voice, so it costs nothing.
- The cosmetics scene only translates and explains; it gives no medical or treatment advice.

## Run it

```bash
cp env.example .env.local   # fill in the Supabase URL and publishable key, and an Anthropic API key
npm ci
npm run dev
```

Apply `sql/001_init.sql` to a new Supabase project first. In Supabase Auth settings, set the Site URL to the address the app is served from so confirmation emails return to it.

Without `ANTHROPIC_API_KEY` the app still runs; a scan answers "AI 密钥尚未配置".

## Tests

The cases are the `seoul-*` specs in [`clientx-autopilot`](../clientx-autopilot/README.md) (`automation/web/specs`), run against a production build with Supabase and the scan route replaced by in-memory stand-ins:

```bash
npm ci                                             # here, once
cd ../clientx-autopilot/automation/web && npm ci
npm run test:seoul
```

They run in mobile Chromium. iPhone Safari behaviour (camera sheet, home-screen mode, the Korean voice) is not covered and needs a check on a real phone.

## Not built yet

Speak-for-me, live captions, pronunciation scoring, spaced review, online reference prices, Google sign-in and subscriptions. The tables for them already exist.
