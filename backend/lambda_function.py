"""
Bollywood-ify My Day — Lambda handler
Actions:
  trailer : Nova Lite (text) → Pollinations Flux (image) → S3 → return script + posterUrl
  remix   : Nova Lite (genre-flavoured text) → Pollinations (genre poster) → S3 → return result
  story   : Nova Lite → dramatic short story
  narrate : Polly SSML synthesis + speech marks → S3 cache → return audioUrl + marks
  gallery : DynamoDB scan → last 10 entries
"""

import json
import os
import uuid
import base64
import logging
import urllib.request
import urllib.parse
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ── env vars ──────────────────────────────────────────────────────────────────
BUCKET_NAME = os.environ.get("BUCKET_NAME", "bollywood-posters-353842237441")
TABLE_NAME  = os.environ.get("TABLE_NAME",  "bollywood-logs")
REGION      = os.environ.get("AWS_REGION_NAME", "us-east-1")

NOVA_LITE_ID      = "amazon.nova-lite-v1:0"
POLLINATIONS_BASE = "https://image.pollinations.ai/prompt"

# ── Genre config ──────────────────────────────────────────────────────────────
GENRE_STYLES = {
    "horror": {
        "tone": "terrifying Bollywood horror movie — dark, suspenseful, eerie atmosphere, "
                "jump-scare moments, haunted settings, psychological dread",
        "poster": "dark moody horror poster, deep shadows, blood red and black color palette, "
                  "eerie mist, haunted atmosphere, dramatic horror lighting, gothic style",
    },
    "romance": {
        "tone": "sweeping Bollywood romance — passionate love, longing gazes, rain scenes, "
                "heartfelt emotions, poetic dialogues, eternal love story",
        "poster": "romantic Bollywood poster, soft pink and gold tones, flower petals, "
                  "glowing warm light, two silhouettes, dreamy soft-focus atmosphere",
    },
    "comedy": {
        "tone": "hilarious Bollywood comedy — slapstick chaos, misunderstandings, "
                "absurd situations, laugh-out-loud punchlines, over-the-top reactions",
        "poster": "bright colorful comedy poster, exaggerated cartoon expressions, "
                  "bold yellow and orange palette, confetti, fun bubbly energy, slapstick style",
    },
    "action": {
        "tone": "explosive Bollywood action blockbuster — car chases, fight sequences, "
                "heroic one-liners, adrenaline-pumping stunts, larger-than-life hero",
        "poster": "action movie poster, explosive orange and blue palette, dynamic action pose, "
                  "fire and sparks, muscular hero silhouette, cinematic power, high energy",
    },
    "thriller": {
        "tone": "gripping Bollywood psychological thriller — conspiracy, betrayal, "
                "plot twists, tense atmosphere, morally ambiguous characters, shocking reveals",
        "poster": "noir thriller poster, cool blue and grey tones, dramatic shadows, "
                  "mysterious silhouette, tense atmosphere, minimal stark composition",
    },
}

# ── AWS clients ───────────────────────────────────────────────────────────────
bedrock = boto3.client("bedrock-runtime", region_name=REGION)
s3      = boto3.client("s3",              region_name=REGION)
polly   = boto3.client("polly",           region_name=REGION)
dynamo  = boto3.resource("dynamodb",      region_name=REGION)
table   = dynamo.Table(TABLE_NAME)

# ── helpers ───────────────────────────────────────────────────────────────────

def cors_response(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
        },
        "body": json.dumps(body),
    }


def invoke_nova_lite(prompt: str) -> str:
    """Call Nova Lite with exponential backoff on throttle."""
    import time
    payload = {
        "messages": [{"role": "user", "content": [{"text": prompt}]}],
        "inferenceConfig": {"maxTokens": 1024, "temperature": 0.9, "topP": 0.95},
    }
    for attempt in range(5):
        try:
            response = bedrock.invoke_model(
                modelId=NOVA_LITE_ID,
                body=json.dumps(payload),
                contentType="application/json",
                accept="application/json",
            )
            result = json.loads(response["body"].read())
            return result["output"]["message"]["content"][0]["text"]
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "ThrottlingException" and attempt < 4:
                wait = (2 ** attempt) + 1
                logger.warning("Nova Lite throttled, retrying in %ss...", wait)
                time.sleep(wait)
            else:
                raise


def parse_trailer_json(raw_text: str) -> dict:
    """Strip markdown fences and parse trailer JSON from Nova Lite output."""
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    return json.loads(cleaned.strip())


def fetch_pollinations_image(title: str, tagline: str,
                             visual_scene: str = "",
                             genre_style: str = "") -> bytes:
    """
    Generate a Bollywood movie poster via Pollinations Flux (model=flux, nologo=true).
    Uses a scene-literal prompt anchored to visual_scene — a one-sentence description
    of the key visual moment from the story — rather than abstract mood words.
    Returns JPEG bytes.
    """
    import time

    # ── Scene-literal prompt ───────────────────────────────────────────────────
    # visual_scene is something like "a student sprinting toward a bus with papers flying"
    scene = visual_scene if visual_scene else "a dramatic Indian protagonist in an expressive pose"

    if genre_style:
        # Genre remix — blend scene with genre-specific art direction
        image_prompt = (
            f"Bollywood movie poster, {genre_style}, "
            f"showing {scene}, "
            f"bold poster typography space at bottom for title '{title}', "
            "2D animated movie poster style, Pixar-meets-Bollywood illustration, "
            "bold flat colors, exaggerated expressions, comic-book energy, "
            "vibrant saturated colors, dramatic lighting, no watermarks"
        )
    else:
        # Default — scene-literal cartoon poster
        image_prompt = (
            f"Bollywood movie poster of {scene}, "
            "dramatic lighting, exaggerated cartoon-illustrated style, "
            "2D animated movie poster style, Pixar-meets-Bollywood illustration, "
            "bold flat colors, exaggerated expressions, comic-book energy, "
            f"bold poster typography at the bottom reading '{title}', "
            "vibrant saturated colors, movie poster composition with title text space, "
            "no watermarks, sharp detail"
        )

    logger.info("=== POLLINATIONS IMAGE PROMPT ===\n%s\n=== END PROMPT ===", image_prompt)

    encoded = urllib.parse.quote(image_prompt)
    url = f"{POLLINATIONS_BASE}/{encoded}?width=512&height=768&model=flux&nologo=true&enhance=true"

    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "BollywoodifyMyDay/1.0"})
            with urllib.request.urlopen(req, timeout=55) as resp:
                if resp.status == 200:
                    data = resp.read()
                    logger.info("Pollinations returned %d bytes", len(data))
                    return data
                raise RuntimeError(f"Pollinations HTTP {resp.status}")
        except Exception as exc:
            if attempt < 3:
                wait = (2 ** attempt) + 1
                logger.warning("Pollinations attempt %d failed: %s, retry in %ss", attempt + 1, exc, wait)
                time.sleep(wait)
            else:
                raise RuntimeError(f"Pollinations failed: {exc}") from exc


def upload_file(key: str, data: bytes, content_type: str) -> str:
    """Upload bytes to S3 and return the permanent public URL."""
    s3.put_object(Bucket=BUCKET_NAME, Key=key, Body=data, ContentType=content_type)
    url = f"https://{BUCKET_NAME}.s3.{REGION}.amazonaws.com/{key}"
    logger.info("Uploaded: %s", url)
    return url


def log_to_dynamo(entry_id: str, day_text: str, title: str,
                  tagline: str, poster_url: str) -> None:
    try:
        table.put_item(Item={
            "id": entry_id, "dayText": day_text, "title": title,
            "tagline": tagline, "posterUrl": poster_url,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except ClientError as exc:
        logger.warning("DynamoDB write failed (non-fatal): %s", exc)


def build_trailer_ssml(title: str, tagline: str, script: list) -> str:
    """
    Build SSML for Polly Matthew neural voice.
    Supported: speak, break, p, prosody rate (named or %), volume
    NOT supported by Matthew neural: emphasis, prosody pitch
    """
    lines_ssml = ""
    for line in script:
        lines_ssml += (
            f'<p><prosody rate="slow">{line}</prosody>'
            '<break time="700ms"/></p>'
        )

    ssml = (
        '<speak>'
        '<break time="500ms"/>'
        f'{lines_ssml}'
        '<break time="900ms"/>'
        f'<prosody rate="x-slow" volume="loud">{title}</prosody>'
        '<break time="700ms"/>'
        f'<prosody rate="slow">{tagline}</prosody>'
        '<break time="800ms"/>'
        '</speak>'
    )
    return ssml


# ── action handlers ───────────────────────────────────────────────────────────

def handle_trailer(body: dict) -> dict:
    day_text = (body.get("dayText") or "").strip()
    if not day_text:
        return cors_response(400, {"error": "dayText is required"})

    text_prompt = f"""You are a dramatic Bollywood movie trailer narrator.
The user's day: "{day_text}"

Respond ONLY with valid JSON — no markdown, no code fences, no extra text.
Use this exact structure:
{{
  "title": "DRAMATIC TITLE IN CAPS",
  "tagline": "One unforgettable line here",
  "script": ["Line 1", "Line 2", "Line 3", "Line 4"],
  "visual_scene": "one literal sentence describing the key visual moment of the day, e.g. a college student sprinting toward a bus with papers flying out of their bag"
}}

Rules:
- title: 3-7 words ALL CAPS
- tagline: max 15 words, punchy
- script: 4-6 lines, over-the-top dramatic Bollywood narrator tone
- visual_scene: ONE sentence, concrete and literal — describe the person (infer student/office worker/etc from context) and the specific physical action that is the heart of the story. No abstract moods. Think: what would the KEY shot in the movie poster show?
- Return raw JSON only — nothing else."""

    logger.info("Calling Nova Lite for trailer...")
    raw = invoke_nova_lite(text_prompt)
    logger.info("Nova Lite response: %.300s", raw)

    try:
        parsed = parse_trailer_json(raw)
    except json.JSONDecodeError as exc:
        logger.error("JSON parse failed: %s | Raw: %.300s", exc, raw)
        return cors_response(502, {"error": "Model returned malformed JSON. Please try again."})

    title        = parsed.get("title", "UNTITLED BLOCKBUSTER")
    tagline      = parsed.get("tagline", "")
    script       = parsed.get("script", [])
    visual_scene = parsed.get("visual_scene", "")
    logger.info("visual_scene: %s", visual_scene)

    image_bytes = fetch_pollinations_image(title, tagline, visual_scene=visual_scene)
    poster_url  = upload_file(f"posters/{uuid.uuid4()}.jpg", image_bytes, "image/jpeg")
    log_to_dynamo(str(uuid.uuid4()), day_text, title, tagline, poster_url)

    return cors_response(200, {
        "title": title, "tagline": tagline, "script": script,
        "posterUrl": poster_url, "visualScene": visual_scene,
    })


def handle_remix(body: dict) -> dict:
    """Re-generate trailer + poster in a chosen genre tone."""
    day_text = (body.get("dayText") or "").strip()
    genre    = (body.get("genre")   or "").strip().lower()

    if not day_text:
        return cors_response(400, {"error": "dayText is required"})
    if genre not in GENRE_STYLES:
        return cors_response(400, {"error": f"Unknown genre '{genre}'. Choose from: {', '.join(GENRE_STYLES)}"})

    genre_cfg = GENRE_STYLES[genre]

    text_prompt = f"""You are a Bollywood movie trailer narrator specialising in {genre.upper()} films.
The user's day: "{day_text}"
Genre tone: {genre_cfg['tone']}

Rewrite this day as a {genre.upper()} Bollywood movie trailer.
Respond ONLY with valid JSON — no markdown, no code fences, no extra text.
Use this exact structure:
{{
  "title": "GENRE TITLE IN CAPS",
  "tagline": "One unforgettable {genre} line here",
  "script": ["Line 1", "Line 2", "Line 3", "Line 4"],
  "visual_scene": "one literal sentence describing the key visual moment for this {genre} version, e.g. a terrified student running down dark corridors"
}}

Rules: title 3-7 words ALL CAPS, tagline max 15 words,
script 4-6 lines matching the {genre.upper()} genre tone.
visual_scene: ONE concrete sentence showing the person and key action in {genre} style.
Return raw JSON only."""

    logger.info("Calling Nova Lite for %s remix...", genre)
    raw = invoke_nova_lite(text_prompt)

    try:
        parsed = parse_trailer_json(raw)
    except json.JSONDecodeError as exc:
        logger.error("Remix JSON parse failed: %s", exc)
        return cors_response(502, {"error": "Model returned malformed JSON. Please try again."})

    title        = parsed.get("title", "UNTITLED REMIX")
    tagline      = parsed.get("tagline", "")
    script       = parsed.get("script", [])
    visual_scene = parsed.get("visual_scene", "")
    logger.info("Remix visual_scene: %s", visual_scene)

    image_bytes = fetch_pollinations_image(
        title, tagline,
        visual_scene=visual_scene,
        genre_style=genre_cfg["poster"],
    )
    poster_url = upload_file(f"posters/{uuid.uuid4()}.jpg", image_bytes, "image/jpeg")

    return cors_response(200, {
        "title": title, "tagline": tagline, "script": script,
        "posterUrl": poster_url, "genre": genre, "visualScene": visual_scene,
    })


def handle_narrate(body: dict) -> dict:
    """
    Synthesise Polly narration + speech marks for a trailer.
    Caches both in S3 under the same uuid so replays are free.
    Returns: { audioUrl, speechMarks, cached }
    """
    title   = (body.get("title")   or "").strip()
    tagline = (body.get("tagline") or "").strip()
    script  = body.get("script", [])
    # Optional: client passes posterId (uuid part of posterUrl) so we can check cache
    poster_id = (body.get("posterId") or "").strip()

    if not title or not script:
        return cors_response(400, {"error": "title and script are required"})

    # ── Cache check ────────────────────────────────────────────────────────────
    audio_key  = f"audio/{poster_id}.mp3"   if poster_id else None
    marks_key  = f"audio/{poster_id}.json"  if poster_id else None

    if poster_id:
        try:
            s3.head_object(Bucket=BUCKET_NAME, Key=audio_key)
            # Both files exist — return cached URLs
            audio_url = f"https://{BUCKET_NAME}.s3.{REGION}.amazonaws.com/{audio_key}"
            marks_obj = s3.get_object(Bucket=BUCKET_NAME, Key=marks_key)
            marks_data = json.loads(marks_obj["Body"].read().decode("utf-8"))
            logger.info("Returning cached narration for %s", poster_id)
            return cors_response(200, {
                "audioUrl": audio_url, "speechMarks": marks_data, "cached": True,
            })
        except ClientError:
            pass  # Not cached yet — generate

    # ── Build SSML ─────────────────────────────────────────────────────────────
    ssml = build_trailer_ssml(title, tagline, script)
    logger.info("Synthesising Polly audio (Matthew neural)...")

    # ── Synthesise audio (MP3) ─────────────────────────────────────────────────
    audio_resp = polly.synthesize_speech(
        Text=ssml,
        TextType="ssml",
        OutputFormat="mp3",
        VoiceId="Matthew",
        Engine="neural",
    )
    audio_bytes = audio_resp["AudioStream"].read()

    # ── Synthesise speech marks (sentence timing) ──────────────────────────────
    marks_resp = polly.synthesize_speech(
        Text=ssml,
        TextType="ssml",
        OutputFormat="json",
        SpeechMarkTypes=["sentence", "word"],
        VoiceId="Matthew",
        Engine="neural",
    )
    # Polly returns one JSON object per line (not a JSON array)
    raw_marks = marks_resp["AudioStream"].read().decode("utf-8")
    marks_list = [json.loads(line) for line in raw_marks.strip().splitlines() if line.strip()]

    # ── Upload to S3 ───────────────────────────────────────────────────────────
    # Use a fresh uuid if no posterId was provided
    cache_id  = poster_id or str(uuid.uuid4())
    audio_key = f"audio/{cache_id}.mp3"
    marks_key = f"audio/{cache_id}.json"

    audio_url = upload_file(audio_key, audio_bytes, "audio/mpeg")
    upload_file(marks_key, json.dumps(marks_list).encode("utf-8"), "application/json")

    return cors_response(200, {
        "audioUrl": audio_url, "speechMarks": marks_list, "cached": False,
    })


def handle_story(body: dict) -> dict:
    day_text = (body.get("dayText") or "").strip()
    title    = (body.get("title")   or "").strip()
    tagline  = (body.get("tagline") or "").strip()

    if not day_text or not title:
        return cors_response(400, {"error": "dayText and title are required"})

    story_prompt = f"""You are a Bollywood screenplay writer and master storyteller.
Movie title: "{title}"
Tagline: "{tagline}"
The day that inspired it: "{day_text}"

Write a dramatic 3-4 paragraph short story based on this day.
Tone: over-the-top Bollywood blockbuster — emotion, dramatic twists, cinematic flair.
Plain paragraphs only, no bullets or headers. Each paragraph 3-5 sentences."""

    story_text = invoke_nova_lite(story_prompt)
    return cors_response(200, {"story": story_text.strip()})


def handle_gallery() -> dict:
    try:
        result = table.scan(Limit=50)
        items  = sorted(result.get("Items", []),
                        key=lambda x: x.get("timestamp", ""), reverse=True)
        return cors_response(200, {"entries": items[:10]})
    except ClientError as exc:
        logger.error("DynamoDB scan failed: %s", exc)
        return cors_response(502, {"error": "Could not load gallery."})


# ── main handler ──────────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    logger.info("Event: %.500s", json.dumps(event))

    method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if method == "OPTIONS":
        return cors_response(200, {})

    route = event.get("routeKey", "")
    if route == "GET /gallery" or method == "GET":
        return handle_gallery()

    if "body" in event:
        try:
            body = json.loads(event.get("body") or "{}")
        except json.JSONDecodeError:
            return cors_response(400, {"error": "Invalid JSON body"})
    else:
        body = event

    action = body.get("action", "trailer")

    if action == "trailer":
        return handle_trailer(body)
    elif action == "remix":
        return handle_remix(body)
    elif action == "narrate":
        return handle_narrate(body)
    elif action == "story":
        return handle_story(body)
    elif action == "gallery":
        return handle_gallery()
    else:
        return cors_response(400, {"error": f"Unknown action: {action}"})
