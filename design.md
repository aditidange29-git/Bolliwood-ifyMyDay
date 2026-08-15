# Design — Bollywood-ify My Day

## 1. High-Level Architecture

```
┌─────────────────────────────────────────┐
│           Frontend (Vercel/Netlify)      │
│  React + Vite + TypeScript               │
└────────────────┬────────────────────────┘
                 │ HTTPS (JSON)
                 ▼
┌─────────────────────────────────────────┐
│         API Gateway (HTTP API)           │
│  POST /bollywood-ify                     │
│  GET  /gallery          (optional)       │
└────────────────┬────────────────────────┘
                 │ Invoke
                 ▼
┌─────────────────────────────────────────┐
│         Lambda Function                  │
│  bollywood-ify-fn  (Python 3.12)         │
│                                          │
│  action = "trailer"  ──► Nova Lite (text)│
│                          Nova Canvas     │
│                          S3 upload       │
│                          DynamoDB write  │
│                          (optional)      │
│                                          │
│  action = "story"    ──► Nova Lite (text)│
│                                          │
│  action = "gallery"  ──► DynamoDB scan   │
│                          (optional)      │
└──────┬──────────┬───────────────────────┘
       │          │
       ▼          ▼
  ┌─────────┐  ┌───────────────┐  ┌────────────────┐
  │   S3    │  │ Amazon Bedrock│  │   DynamoDB     │
  │ (posters│  │ Nova Lite     │  │ bollywood-logs │
  │  bucket)│  │ Nova Canvas   │  │ (optional)     │
  └─────────┘  └───────────────┘  └────────────────┘
```

---

## 2. Component Breakdown

### 2.1 Frontend

**Stack:** React 18 + Vite + TypeScript  
**Styling:** Tailwind CSS (or plain CSS modules) — cinematic "film city" aesthetic  
**Design language:**
- Color palette: deep red (`#8B0000` / `#C0392B`), gold (`#D4AF37` / `#FFD700`), near-black (`#0A0A0A`)
- Typography: bold display font (e.g. Playfair Display or Cinzel) for generated titles; clean sans-serif for body
- Poster reveal: curtain-open CSS animation — two vertical panels slide apart to reveal the poster image
- Loading state: animated spotlight sweep across the screen while generation runs
- Section transitions: fade-in with slight upward drift

| File/Path | Purpose |
|---|---|
| `frontend/src/App.tsx` | Root component, top-level state, page layout |
| `frontend/src/components/InputForm.tsx` | Day description textarea + submit button |
| `frontend/src/components/LoadingScreen.tsx` | Animated spotlight / marquee loading state |
| `frontend/src/components/TrailerResult.tsx` | Poster image (curtain reveal) + script + tagline |
| `frontend/src/components/StoryPanel.tsx` | Full story text, shown after "Generate Full Story" click |
| `frontend/src/components/Gallery.tsx` | Past posters grid (optional) |
| `frontend/src/api.ts` | Typed fetch wrappers for all API calls |
| `frontend/src/types.ts` | Shared TypeScript interfaces (TrailerResponse, StoryResponse, GalleryEntry) |
| `frontend/src/styles/globals.css` | CSS custom properties for palette, font imports |

**State machine (client-side):**
```
IDLE → LOADING_TRAILER → TRAILER_READY → LOADING_STORY → STORY_READY
                                       ↘ LOADING_GALLERY (on page load, optional)
```

The frontend never stores AWS credentials. The API Gateway URL is the only env variable needed (`VITE_API_URL`, set on Vercel/Netlify).

---

### 2.2 Lambda Function (`bollywood-ify-fn`)

**Runtime:** Python 3.12  
**Memory:** 512 MB  
**Timeout:** 60 s (image generation can be slow)  
**IAM Role permissions:**
- `bedrock:InvokeModel` on `amazon.nova-lite-v1:0` and `amazon.nova-canvas-v1:0`
- `s3:PutObject` / `s3:GetObject` on the posters bucket
- `dynamodb:PutItem` / `dynamodb:Scan` on the logs table (optional)

**Dispatch logic:**
```python
def handler(event, context):
    body = json.loads(event["body"])
    action = body.get("action", "trailer")

    if action == "trailer":
        return handle_trailer(body)
    elif action == "story":
        return handle_story(body)
    elif action == "gallery":
        return handle_gallery()
```

---

### 2.3 Amazon Bedrock — Nova Lite (Text)

**Model ID:** `amazon.nova-lite-v1:0`  
**API:** `bedrock-runtime.invoke_model`

**Trailer prompt template:**
```
You are a dramatic Bollywood movie trailer narrator. 
The user's day: "{day_text}"

Respond ONLY with valid JSON in this exact format:
{
  "title": "DRAMATIC TITLE IN CAPS",
  "tagline": "One unforgettable line here",
  "script": [
    "Line 1 of voiceover...",
    "Line 2...",
    "Line 3...",
    "Line 4..."
  ]
}

Rules: title must be 3-7 words all caps. Tagline max 15 words. 
Script must be 4-6 lines. Tone: over-the-top, dramatic, filmy, fun.
```

**Story prompt template:**
```
You are a Bollywood screenplay writer. 
Movie title: "{title}"
Tagline: "{tagline}"
Original day: "{day_text}"

Write a dramatic 3-4 paragraph short story based on this day, 
in the over-the-top style of a Bollywood blockbuster. 
Include dramatic twists, emotions, and cinematic flair.
Return plain text only, no JSON.
```

---

### 2.4 Image Generation — Pollinations.ai Flux

**Endpoint:** `GET https://image.pollinations.ai/prompt/{encoded_prompt}`  
**Model:** Flux (default)  
**Cost:** Free, no API key required  
**Called from:** Lambda via `urllib.request` (stdlib, no extra dependencies)

**Request construction:**
```python
image_prompt = (
    f"Bollywood movie poster, title: {title}, tagline: {tagline}, "
    "vibrant red and gold color palette, dramatic cinematic lighting, "
    "ornate Indian decorative border, heroic central figure, "
    "Indian film aesthetic, high detail, no text overlays"
)
url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(image_prompt)}"
    "?width=512&height=768&model=flux&nologo=true"
```

Returns raw JPEG bytes directly. Lambda uploads to S3 as `image/jpg`.

---

### 2.5 S3 Bucket (`bollywood-posters-<account-id>`)

- **Region:** `us-east-1`
- **Bucket-level Block Public Access:** remains **fully enabled** (all four block settings ON)
- **Object access:** public `GetObject` granted only on the `posters/*` prefix via a bucket policy statement — the bucket itself stays private
- **Bucket policy statement:**
```json
{
  "Sid": "PublicReadPosters",
  "Effect": "Allow",
  "Principal": "*",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/posters/*"
}
```
> Note: To allow a bucket policy that permits public access while keeping Block Public Access on, you must disable **"Block public access to buckets and objects granted through new bucket policies"** (the second toggle) only. The other three toggles stay ON. This scopes exposure to the `posters/` prefix exclusively.
- **Object naming:** `posters/{uuid}.png`
- **URL format returned to frontend:** `https://{bucket}.s3.{region}.amazonaws.com/posters/{uuid}.png` (permanent, no expiry)
- **Lifecycle rule:** Delete objects older than 7 days (keeps Free Tier storage minimal)
- **Lambda IAM:** needs only `s3:PutObject` on `arn:aws:s3:::YOUR-BUCKET/posters/*` — no pre-signed URL generation required

---

### 2.6 DynamoDB Table `bollywood-logs` (Optional)

| Attribute | Type | Notes |
|---|---|---|
| `id` | String (PK) | UUID v4 |
| `dayText` | String | Original input |
| `title` | String | Generated title |
| `tagline` | String | Generated tagline |
| `posterUrl` | String | Permanent S3 public URL (`https://{bucket}.s3...amazonaws.com/posters/{uuid}.png`) |
| `timestamp` | String | ISO 8601 UTC |

- Billing mode: **PAY_PER_REQUEST** (Free Tier: 25 GB storage, 200M requests/month)
- Gallery endpoint returns last 10 items sorted by timestamp (Scan + client-side sort, acceptable at this scale)

---

## 3. API Contract

### POST /bollywood-ify

**Action: trailer**

Request:
```json
{
  "action": "trailer",
  "dayText": "I spilled coffee on my laptop and then got a promotion"
}
```

Response `200`:
```json
{
  "title": "THE COFFEE OF DESTINY",
  "tagline": "Some spills change everything.",
  "script": [
    "In a world where keyboards hold secrets...",
    "One cup of coffee... would seal a fate.",
    "He lost everything. Then gained the universe.",
    "THE COFFEE OF DESTINY. Coming this monsoon."
  ],
  "posterUrl": "https://bollywood-posters-<account-id>.s3.us-east-1.amazonaws.com/posters/uuid.png"
}
```

**Action: story**

Request:
```json
{
  "action": "story",
  "dayText": "I spilled coffee on my laptop and then got a promotion",
  "title": "THE COFFEE OF DESTINY",
  "tagline": "Some spills change everything."
}
```

Response `200`:
```json
{
  "story": "It was an ordinary Tuesday morning when Arjun reached for his cup..."
}
```

**Action: gallery** (optional)

Request: `GET /gallery`

Response `200`:
```json
{
  "entries": [
    {
      "id": "uuid",
      "title": "THE COFFEE OF DESTINY",
      "tagline": "Some spills change everything.",
      "posterUrl": "https://...",
      "timestamp": "2026-08-14T10:30:00Z"
    }
  ]
}
```

**Error response (all actions):**
```json
{
  "error": "Human-readable error message"
}
```

---

## 4. Data Flow — Trailer Generation

```
1. User submits dayText
2. Frontend POST /bollywood-ify  { action:"trailer", dayText }
3. Lambda → Bedrock Nova Lite (text prompt) → JSON { title, tagline, script }
4. Lambda → Bedrock Nova Canvas (image prompt) → base64 PNG
5. Lambda → S3 PutObject posters/{uuid}.png (public via bucket policy)
6. Lambda → DynamoDB PutItem (optional)
7. Lambda → return { title, tagline, script, posterUrl } (permanent S3 URL)
8. Frontend renders script + poster image with curtain-reveal animation
9. Frontend shows "Generate Full Story" button
```

---

## 5. Data Flow — Full Story Generation

```
1. User clicks "Generate Full Story"
2. Frontend POST /bollywood-ify  { action:"story", dayText, title, tagline }
3. Lambda → Bedrock Nova Lite (story prompt) → plain text story
4. Lambda → return { story }
5. Frontend renders story below trailer
```

---

## 6. Frontend UI Layout

```
┌─────────────────────────────────────────────────────┐
│  ✦ BOLLYWOOD-IFY MY DAY  ✦   (gold on black header) │
│  "Turn your ordinary day into a blockbuster"         │
│  [ marquee ticker of past titles scrolling below ]   │
├─────────────────────────────────────────────────────┤
│  [ Describe your day...                           ]  │
│                    [ 🎭 Bollywood-ify! ]              │
├─────────────────────────────────────────────────────┤
│  LOADING STATE (animated spotlight sweep)            │
│       ◈  Lights, camera… generating!  ◈              │
├─────────────────────────────────────────────────────┤
│  RESULT VIEW                                         │
│  ┌─── curtain-left ─┐  ┌──────────────────────────┐ │
│  │  [curtains slide  │  │  ✦ MOVIE TITLE (display) │ │
│  │   open to reveal  │  │  — Tagline here —         │ │
│  │   poster image]   │  │                           │ │
│  │   512×768 PNG     │  │  TRAILER SCRIPT           │ │
│  └───────────────────┘  │  "In a world..."          │ │
│                         │  "One cup of coffee..."   │ │
│                         └──────────────────────────┘ │
│              [ 📖 Generate Full Story ]               │
├─────────────────────────────────────────────────────┤
│  FULL STORY  (fade-in after button click)            │
│  ▌Paragraph 1...                                     │
│  ▌Paragraph 2...                                     │
│  ▌Paragraph 3...                                     │
├─────────────────────────────────────────────────────┤
│  PAST POSTERS GALLERY  (optional, 3-col grid)        │
│  [ poster ]  [ poster ]  [ poster ]                  │
│  Title · Tagline · Date                              │
└─────────────────────────────────────────────────────┘
```

**Visual notes:**
- Header: full-width black band, gold Cinzel/Playfair Display font, subtle star/sparkle dividers
- Marquee ticker: thin red strip scrolling previously generated titles across the top
- Curtain reveal: two deep-red velvet panels animate apart (CSS `translateX`) over ~0.8 s when poster URL loads
- Spotlight loader: radial gradient `conic-animation` sweeping across a dark background
- Script lines: each line styled as a white card with a thin gold left border
- "Generate Full Story" button: outlined gold, fills deep red on hover
- Gallery cards: black background, gold border, poster thumbnail + bold title overlay

---

## 7. Folder Structure

```
Bolliwood-ifyMyDay/
├── requirements.md
├── design.md
├── frontend/                        # React + Vite + TypeScript
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── package.json
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api.ts
│       ├── types.ts
│       ├── styles/
│       │   └── globals.css
│       └── components/
│           ├── InputForm.tsx
│           ├── LoadingScreen.tsx
│           ├── TrailerResult.tsx
│           ├── StoryPanel.tsx
│           └── Gallery.tsx
├── backend/
│   ├── lambda_function.py
│   └── requirements.txt             # boto3 already in Lambda runtime
└── infra/
    └── deploy.md                    # Manual deploy steps
```

---

## 8. Deployment Steps (Summary)

1. **S3** — Create bucket `bollywood-posters-<your-account-id>`; keep all four Block Public Access toggles ON except "Block public access to buckets and objects granted through new bucket policies" (toggle 2 OFF); attach bucket policy with `PublicReadPosters` statement on `posters/*`; add 7-day lifecycle rule
2. **IAM** — Create role `bollywood-lambda-role` with Bedrock + S3 (`PutObject` on `posters/*`) + DynamoDB policies
3. **Lambda** — Create function `bollywood-ify-fn`, runtime Python 3.12, attach role, set env vars (`BUCKET_NAME`, `AWS_REGION`, `TABLE_NAME`)
4. **API Gateway** — HTTP API, POST `/bollywood-ify` + GET `/gallery`, Lambda integration, enable CORS for frontend origin
5. **DynamoDB** — Create table `bollywood-logs`, PK `id` (String), on-demand billing (optional)
6. **Frontend** — `npm create vite@latest frontend -- --template react-ts`, set `VITE_API_URL` env var on Vercel/Netlify, deploy `frontend/` folder

---

## 9. Key Technical Decisions

| Decision | Choice | Reason |
|---|---|---|
| Text model | Amazon Nova Lite | Cheapest Nova tier, sufficient for creative text tasks |
| Image model | Pollinations.ai Flux (free HTTP API) | Nova Canvas LEGACY-blocked in account; Stability AI requires AWS Marketplace payment; Pollinations is free, no key, real Flux text-to-image |
| Image serving | S3 permanent public URL (scoped to `posters/*` prefix via bucket policy) | No URL expiry — safe for gallery; bucket itself stays private |
| Frontend framework | React 18 + Vite + TypeScript | Type safety, component model maps cleanly to UI states; Vite deploys as static output |
| Design aesthetic | Cinematic film city — deep red/gold/black palette, Cinzel/Playfair Display fonts, curtain-reveal + spotlight animations | Matches Bollywood premiere energy |
| Lambda runtime | Python 3.12 | boto3 built-in, concise for Bedrock calls |
| API style | HTTP API (not REST API) | Lower cost, simpler CORS config |
| Single Lambda dispatch | `action` param | Avoids over-engineering with multiple functions |
