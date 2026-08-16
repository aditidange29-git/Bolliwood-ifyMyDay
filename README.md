# 🎬 Bollywood-ify My Day

> **AWS Builder Center — Weekend Creative Challenge submission**
> Tag: `#creative-expression`

Turn your ordinary day into a Bollywood blockbuster — complete with a dramatic trailer script, a cartoon movie poster, a full voiceover narration, and a genre remix button that rewrites everything in Horror, Romance, Comedy, Action, or Thriller style.

---

## What It Does

Type one sentence describing your day. Get back:

| Output | What it is |
|---|---|
| 🎬 **Movie title** | Dramatic ALL-CAPS Bollywood title |
| 💬 **Tagline** | One punchy, unforgettable line |
| 🎙️ **Trailer script** | 4–6 voiceover lines in classic Bollywood narrator style |
| 🖼️ **Movie poster** | Cartoon-illustrated poster tied to the literal scene of your day |
| 🔊 **Narration** | Amazon Polly neural voiceover with karaoke-synced line highlights |
| 🎭 **Genre remix** | Rewrite everything in Horror / Romance / Comedy / Action / Thriller |
| 📖 **Full story** | 3–4 paragraph dramatic Bollywood short story expanding your day |

**Example input:** *"Woke up late, missed the bus, and then aced my viva"*

**Example output:**
- Title: **DESTINY UNFOLDS**
- Tagline: *Sometimes, a missed moment leads to greatness.*
- Poster: A cartoon student sprinting toward a bus, papers flying — Pixar-meets-Bollywood style

---

## Live Demo

- **Frontend:** https://bollywood-ify-my-day.vercel.app
- **API:** `https://vmny1k24lg.execute-api.us-east-1.amazonaws.com/prod`
- **Repo:** https://github.com/aditidange29-git/Bolliwood-ifyMyDay

---

## Architecture

```
┌─────────────────────────────────────────────┐
│     Frontend — React + Vite + TypeScript     │
│     Deployed on Vercel (static)              │
└───────────────────┬─────────────────────────┘
                    │ HTTPS
                    ▼
┌─────────────────────────────────────────────┐
│     API Gateway (HTTP API)                   │
│     POST /bollywood-ify                      │
│     GET  /gallery                            │
└───────────────────┬─────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│     AWS Lambda — bollywood-ify-fn            │
│     Python 3.12 · 512 MB · 60s timeout       │
│                                              │
│  action=trailer ──► Amazon Bedrock Nova Lite │
│                     Pollinations.ai Flux     │
│                     S3 upload                │
│                     DynamoDB log             │
│                                              │
│  action=remix   ──► Nova Lite (genre tone)   │
│                     Pollinations Flux        │
│                     S3 upload                │
│                                              │
│  action=story   ──► Nova Lite (story text)   │
│                                              │
│  action=narrate ──► Amazon Polly (MP3+marks) │
│                     S3 cache                 │
└──────┬────────────────────┬─────────────────┘
       │                    │
       ▼                    ▼
┌────────────┐    ┌──────────────────────┐
│  Amazon S3 │    │  Amazon DynamoDB     │
│  posters/* │    │  bollywood-logs      │
│  audio/*   │    │  (PAY_PER_REQUEST)   │
│  (public)  │    └──────────────────────┘
└────────────┘
```

### AWS Services Used

| Service | Purpose |
|---|---|
| **Amazon Bedrock (Nova Lite)** | Trailer script, genre remix, full story generation |
| **Amazon Polly (Matthew neural)** | Movie trailer voiceover with SSML pacing |
| **AWS Lambda** | Single function handling all backend actions |
| **Amazon API Gateway (HTTP API)** | REST surface for the frontend |
| **Amazon S3** | Poster images + narration audio, publicly readable |
| **Amazon DynamoDB** | Generation log (on-demand billing) |
| **AWS IAM** | Least-privilege role for Lambda |

---

## Key Technical Decisions

**Single Lambda dispatch pattern** — one function handles all five actions via an `action` field in the request body. No microservices, no over-engineering for a weekend demo.

**Scene-literal poster prompts** — Nova Lite outputs a `visual_scene` field alongside the trailer JSON — a one-sentence literal description of the key visual moment (e.g. *"a determined student sprints through campus, the bus slipping away"*). This is fed directly into the Pollinations prompt, so the poster depicts your actual day rather than generic drama.

**Polly karaoke sync** — speech marks (sentence timing metadata) from Polly's `SynthesizeSpeech` API drive the frontend highlight animation via `requestAnimationFrame` against `audio.currentTime`. No fixed delays, no guessing — each line lights up exactly when Matthew speaks it.

**S3 scoped public access** — `posters/*` and `audio/*` prefixes are publicly readable via a bucket policy. Bucket-level Block Public Access stays mostly enabled. The rest of the bucket is private.

**Cost near zero** — Nova Lite is ~$0.0001/request, Polly neural ~$0.000016/character, S3 and DynamoDB on-demand bill fractions of a cent. Pollinations.ai is completely free. The whole app runs within AWS Free Tier for a weekend demo.

---

## Challenges Encountered

**Nova Canvas LEGACY block** — The only Bedrock image model (Nova Canvas) throws a hard access-denied on new accounts. All Stability AI models require an AWS Marketplace payment instrument. Switched to Pollinations.ai Flux, which works perfectly from Lambda with zero credentials.

**Polly SSML neural restrictions** — `<emphasis>` tags throw `InvalidSsmlException: Unsupported Neural feature` on Matthew neural. Diagnosed by testing each SSML tag in isolation locally. Stripped to `<prosody rate>`, `<break>`, and `<p>` — all confirmed supported.

**IAM explicit Deny** — An inline cost-lockdown policy on the dev user had `Deny` on `bedrock:InvokeModel` and `lambda:InvokeFunction`. Explicit Deny always overrides Allow, including AdministratorAccess. Fixed by replacing the blanket deny with scoped `Allow` statements covering only the specific resources needed for this app.

**Poster quality** — Flux defaults to photorealistic/mythological art regardless of cartoon keywords. Fixed by restructuring the prompt to scene-literal first (`"Bollywood movie poster of [person doing specific action]"`) combined with `"Pixar-meets-Bollywood illustration, bold flat colors, exaggerated expressions, comic-book energy"` style keywords.

---

## Project Structure

```
Bolliwood-ifyMyDay/
├── README.md
├── requirements.md          # Functional requirements
├── design.md                # Architecture & design decisions
├── backend/
│   ├── lambda_function.py   # All Lambda actions
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── api.ts           # Typed API wrappers
│       ├── types.ts         # Shared TypeScript interfaces
│       ├── components/
│       │   ├── InputForm.tsx
│       │   ├── LoadingScreen.tsx
│       │   ├── TrailerResult.tsx
│       │   ├── GenreRemix.tsx
│       │   ├── ActionBar.tsx
│       │   ├── NarratorPlayer.tsx
│       │   └── StoryPanel.tsx
│       └── styles/
│           └── globals.css
└── infra/
    ├── s3-bucket-policy.json
    ├── iam-lambda-policy.json
    ├── bollywood-ify-cost-lockdown-build.json
    └── deploy.md            # Step-by-step AWS CLI deploy guide
```

---

## Running Locally

```bash
# Frontend
cd frontend
npm install
# Create .env.local
echo "VITE_API_URL=https://vmny1k24lg.execute-api.us-east-1.amazonaws.com/prod" > .env.local
npm run dev
# → http://localhost:5173
```

The backend is fully deployed on AWS — no local backend needed.

---

## Deploying to Vercel

1. Import the repo on [vercel.com](https://vercel.com)
2. Set **Root Directory** → `frontend`
3. Add environment variable: `VITE_API_URL` = `https://vmny1k24lg.execute-api.us-east-1.amazonaws.com/prod`
4. Deploy

---

## What I Learned

- Bedrock model availability requires an actual API call to verify — the model list shows ACTIVE but invocation can still fail on new accounts
- Polly neural SSML is a strict subset of standard SSML — test each tag individually
- Scene-first prompt structure produces dramatically better image generation results than style-first prompts
- A dedicated `visual_scene` field generated by the same LLM that writes the trailer is a cheap, effective way to get grounded image prompts without a separate vision model
- S3 prefix-scoped public access keeps security tight while enabling direct browser delivery of generated assets

---

Built in one weekend for the **AWS Builder Center Weekend Creative Challenge**.
