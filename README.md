# Saudi AI Workbench (MVP)

A working prototype of the social-media workflow. **Modules M1-M7 run live on GPT** through a small Node backend that keeps your OpenAI key server-side. **Modules M8-M11 are mock screens** (visually consistent, not GPT-backed in this MVP).

## Security

- Your key lives only in `app/.env` (gitignored). It is **never** sent to the browser; the browser calls this local server, which calls OpenAI.
- The key you shared was pasted in plaintext - **rotate it** at platform.openai.com after the exercise. To swap keys, edit `OPENAI_API_KEY` in `app/.env` and restart.

## Run

```bash
cd app
npm install
npm start
# open http://localhost:5050
```

Change the model in `.env` (`OPENAI_MODEL`, default `gpt-4o`).

## Deploy on Vercel

1. Push this folder to [GitHub](https://github.com/AmirKameel/Marketing-AI).
2. In [Vercel](https://vercel.com), **Add New Project** and import that repo.
3. Set **Root Directory** to `.` (repo root is this app).
4. Add environment variables in Vercel project settings:
   - `OPENAI_API_KEY` = your OpenAI key
   - `OPENAI_MODEL` = `gpt-4o` (optional)
5. Deploy. Agent runs can take 15-60 seconds; `vercel.json` requests a 60s function timeout (Pro plan may be required for long runs).

Local `.env` is not uploaded. Never commit real keys.

## Architecture

```
Browser UI (public/)  ──HTTP──>  Node/Express (server.js)  ──HTTPS──>  OpenAI
                                   reads key from .env
```

- `server.js` - serves the UI and exposes `/api/health`, `/api/modules`, `/api/run/:id`.
- `lib/openai.js` - OpenAI call; forces JSON output; appends the standard guardrail clause to every prompt.
- `lib/guardrails.js` - deterministic rule engine for M7 (no API call).
- `lib/modules.js` - per-module prompts + structured I/O.

## Module inputs / outputs

| Module | Inputs | Output (structured JSON) | Backend |
|--------|--------|--------------------------|---------|
| **M1 Trend Scout** | platform, observed signals (optional), count | Ranked trends: trend, why relevant, suggested angle, funnel stage, brand-safety 1-5, type (durable/assumption/real-citable) | GPT |
| **M2 Competitor Monitor** | competitor, platform, observations (optional) | 7-dimension scorecard + 3 ethical takeaways (hypothesis is labelled `[ASSUMPTION]` if no observations) | GPT |
| **M3 Comment Insight** | comments (one per line) | Per-comment: category, sentiment, sensitive flag, suggested action + one human insight + single-minded message | GPT |
| **M4 Insight Synthesis** | trends (M1), competitor takeaways (M2), comment insight (M3) | Weekly brief: 3-5 angles, each with audience truth, platforms, funnel stage, metric | GPT |
| **M5 Ideation Studio** | angle, platform, format, count | Ideas: hook, body, caption, hashtags, competitor-mention flag, notes | GPT |
| **M6 Saudi Localization** | approved English content, platform | White Saudi Arabic draft (labelled "AI draft - pending native review"), back-translation, native-reviewer flags | GPT |
| **M7 Guardrail Gate** | draft text (EN/AR) | Verdict PASS/FAIL/REVIEW + rule-engine flags + GPT nuance flags + summary | Rules + GPT |
| **M8 Approval Router** | - | Mock approval queue with status actions | Mock |
| **M9 Scheduler** | - | Mock weekly calendar | Mock |
| **M10 Alerts** | - | Mock alert feed (severity/recipient) | Mock |
| **M11 Performance** | - | Mock dashboard + repeat/improve/stop/test | Mock |

## Pipeline handoff

Results carry forward: M1/M2/M3 → "Send to M4"; M4 → "Use angle → M5"; M5 → "Localize → M6" / "Check → M7"; M6 → "Check draft → M7". This demonstrates the end-to-end flow live.

> All AI output is a draft for human review, never auto-published. Saudi Arabic is always flagged for a native reviewer.
