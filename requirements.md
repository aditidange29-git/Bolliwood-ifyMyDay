# Requirements — Bollywood-ify My Day

## 1. Overview

A single-page web app that takes a user's plain-text day description and transforms it into a dramatic Bollywood movie trailer experience: a scripted voiceover, a punchy title, a tagline, and a generated movie poster image. An optional follow-up generates a full short story in the same dramatic tone.

---

## 2. Functional Requirements

### FR-1: Day Input
- The user must be able to type a free-text description of their day (max ~500 characters recommended, no hard server limit).
- A "Bollywood-ify!" button submits the input.
- The button must be disabled and show a loading state while the backend is processing.
- Empty input must be blocked client-side with a clear message.

### FR-2: Trailer Script Generation
- The backend must call **Amazon Nova Lite** (text model via Amazon Bedrock) with the day description.
- The model must be prompted to return a structured JSON response containing:
  - `title` — a dramatic, punchy Bollywood movie title (all caps, 3–7 words)
  - `tagline` — one short tagline line (≤15 words)
  - `script` — 4–6 voiceover lines in over-the-top Bollywood narrator style
- The frontend must display all three fields clearly.

### FR-3: Movie Poster Image Generation
- After extracting `title` and `tagline`, the backend must call **Amazon Nova Canvas** (image model via Amazon Bedrock) to generate a movie-poster-style image.
- The prompt passed to Nova Canvas must be derived from the title and tagline (e.g., "Bollywood movie poster for '[title]' — [tagline], vibrant colors, dramatic lighting, cinematic").
- The generated image must be uploaded to an **S3 bucket** with public-read access (or a pre-signed URL).
- The image URL must be returned to the frontend and displayed alongside the script.

### FR-4: Generate Full Story (Optional — shown after trailer loads)
- A "Generate Full Story" button must appear **only after** the trailer result is displayed.
- On click, it must call the same Lambda with an additional `action: "story"` parameter, passing:
  - Original `dayText`
  - Generated `title`
  - Generated `tagline`
- The Lambda prompts Amazon Nova Lite to write a **3–4 paragraph dramatic short story** expanding on the day in Bollywood style.
- The story is displayed below (or replacing) the trailer view on the same page.
- The button must show a loading state while generating.

### FR-5: Past Posters Gallery (Optional — if time allows)
- Every successful generation is logged to a **DynamoDB table** (on-demand billing) with:
  - `id` (UUID), `dayText`, `title`, `tagline`, `posterUrl`, `timestamp`
- A small gallery section at the bottom of the page shows the last 10 entries (title, tagline, poster thumbnail).
- Gallery data is fetched on page load via the same API Gateway (a `GET /gallery` endpoint).

---

## 3. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| Cost | All AWS usage must stay within **Free Tier** — Lambda on-demand, Bedrock pay-per-token, DynamoDB on-demand, S3 standard |
| Latency | P50 end-to-end (text + image gen) should be under 30 s; a progress indicator must be shown |
| Availability | No always-on compute; Lambda cold starts are acceptable for a weekend demo |
| Security | CORS must be restricted to the deployed frontend origin in production; no secrets in frontend code |
| Scalability | Not a concern for MVP — single-user weekend demo |

---

## 4. Constraints

- **Single Lambda function** handles all backend actions (differentiated by an `action` field in the request body).
- Frontend deployed to **Vercel or Netlify** (free tier) — static HTML/JS or React.
- Backend (Lambda + API Gateway + S3 + optional DynamoDB) stays on **AWS**.
- No multiple microservices, no ECS/EC2, no always-on resources.
- Amazon Nova models accessed via **Amazon Bedrock** in `us-east-1`.

---

## 5. Out of Scope (MVP)

- User accounts / authentication
- Sharing / social features
- Video or audio generation
- Mobile-native app
- CI/CD pipeline (manual deploy for weekend)
