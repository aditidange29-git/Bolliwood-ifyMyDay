"""
Bollywood-ify My Day — Lambda handler
Actions:
  trailer : Nova Lite (text) → Pollinations.ai Flux (image) → S3 upload → return script + posterUrl
  story   : Nova Lite (text) → return full dramatic story
  gallery : DynamoDB scan → return last 10 entries
"""

import json
import os
import uuid
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

NOVA_LITE_ID = "amazon.nova-lite-v1:0"

# Pollinations.ai Flux — free, no API key, pure HTTPS GET
POLLINATIONS_BASE = "https://image.pollinations.ai/prompt"

# ── AWS clients ───────────────────────────────────────────────────────────────
bedrock = boto3.client("bedrock-runtime", region_name=REGION)
s3      = boto3.client("s3",              region_name=REGION)
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
    """Call Nova Lite with exponential backoff on throttle. Returns text."""
    import time
    payload = {
        "messages": [
            {"role": "user", "content": [{"text": prompt}]}
        ],
        "inferenceConfig": {
            "maxTokens": 1024,
            "temperature": 0.9,
            "topP": 0.95,
        },
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


def fetch_pollinations_image(title: str, tagline: str) -> bytes:
    """
    Call Pollinations.ai Flux to generate a Bollywood movie poster image.
    Returns raw image bytes (JPEG).
    """
    import time
    image_prompt = (
        f"Bollywood movie poster, title: {title}, tagline: {tagline}, "
        "vibrant red and gold color palette, dramatic cinematic lighting, "
        "ornate Indian decorative border, heroic central figure, "
        "Indian film aesthetic, high detail, no text overlays"
    )
    encoded_prompt = urllib.parse.quote(image_prompt)
    url = (
        f"{POLLINATIONS_BASE}/{encoded_prompt}"
        "?width=512&height=768&model=flux&nologo=true"
    )
    logger.info("Fetching Pollinations image, prompt length: %d", len(image_prompt))

    for attempt in range(4):
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "BollywoodifyMyDay/1.0"},
            )
            with urllib.request.urlopen(req, timeout=55) as resp:
                if resp.status == 200:
                    data = resp.read()
                    logger.info("Pollinations returned %d bytes", len(data))
                    return data
                raise RuntimeError(f"Pollinations returned HTTP {resp.status}")
        except Exception as exc:
            if attempt < 3:
                wait = (2 ** attempt) + 1
                logger.warning("Pollinations attempt %d failed (%s), retrying in %ss...",
                               attempt + 1, exc, wait)
                time.sleep(wait)
            else:
                raise RuntimeError(f"Pollinations failed after retries: {exc}") from exc


def upload_poster(image_bytes: bytes, ext: str = "jpg") -> str:
    """Upload image to S3 posters/ prefix, return the permanent public URL."""
    key = f"posters/{uuid.uuid4()}.{ext}"
    s3.put_object(
        Bucket=BUCKET_NAME,
        Key=key,
        Body=image_bytes,
        ContentType=f"image/{ext}",
    )
    url = f"https://{BUCKET_NAME}.s3.{REGION}.amazonaws.com/{key}"
    logger.info("Uploaded poster: %s", url)
    return url


def log_to_dynamo(entry_id: str, day_text: str, title: str,
                  tagline: str, poster_url: str) -> None:
    """Write generation record to DynamoDB (best-effort, non-fatal)."""
    try:
        table.put_item(Item={
            "id":        entry_id,
            "dayText":   day_text,
            "title":     title,
            "tagline":   tagline,
            "posterUrl": poster_url,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except ClientError as exc:
        logger.warning("DynamoDB write failed (non-fatal): %s", exc)


# ── action handlers ───────────────────────────────────────────────────────────

def handle_trailer(body: dict) -> dict:
    day_text = (body.get("dayText") or "").strip()
    if not day_text:
        return cors_response(400, {"error": "dayText is required"})

    # 1. Generate script via Nova Lite ─────────────────────────────────────────
    text_prompt = f"""You are a dramatic Bollywood movie trailer narrator.
The user's day: "{day_text}"

Respond ONLY with valid JSON — no markdown, no code fences, no extra text.
Use this exact structure:
{{
  "title": "DRAMATIC TITLE IN CAPS",
  "tagline": "One unforgettable line here",
  "script": [
    "Line 1 of voiceover...",
    "Line 2...",
    "Line 3...",
    "Line 4..."
  ]
}}

Rules:
- title: 3-7 words, ALL CAPS
- tagline: maximum 15 words, punchy
- script: exactly 4-6 lines, over-the-top dramatic Bollywood narrator tone
- Return raw JSON only — nothing else."""

    logger.info("Calling Nova Lite for trailer script...")
    raw_text = invoke_nova_lite(text_prompt)
    logger.info("Nova Lite raw response: %.300s", raw_text)

    # Strip markdown fences if model wraps output anyway
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.error("JSON parse failed: %s | Raw: %.300s", exc, raw_text)
        return cors_response(502, {"error": "Model returned malformed JSON. Please try again."})

    title   = parsed.get("title", "UNTITLED BLOCKBUSTER")
    tagline = parsed.get("tagline", "")
    script  = parsed.get("script", [])

    # 2. Generate poster via Pollinations.ai Flux ──────────────────────────────
    logger.info("Calling Pollinations.ai for poster image...")
    image_bytes = fetch_pollinations_image(title, tagline)

    # 3. Upload to S3 ──────────────────────────────────────────────────────────
    poster_url = upload_poster(image_bytes, ext="jpg")

    # 4. Log to DynamoDB (non-fatal) ───────────────────────────────────────────
    log_to_dynamo(str(uuid.uuid4()), day_text, title, tagline, poster_url)

    return cors_response(200, {
        "title":     title,
        "tagline":   tagline,
        "script":    script,
        "posterUrl": poster_url,
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
Tone: over-the-top Bollywood blockbuster — full of emotion, dramatic twists,
cinematic flair, rich imagery, and filmy dialogue.
Do NOT use bullet points or headers. Return plain paragraphs only.
Each paragraph should be 3-5 sentences."""

    logger.info("Calling Nova Lite for full story...")
    story_text = invoke_nova_lite(story_prompt)

    return cors_response(200, {"story": story_text.strip()})


def handle_gallery() -> dict:
    try:
        result = table.scan(Limit=50)
        items  = result.get("Items", [])
        items.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        return cors_response(200, {"entries": items[:10]})
    except ClientError as exc:
        logger.error("DynamoDB scan failed: %s", exc)
        return cors_response(502, {"error": "Could not load gallery."})


# ── main handler ──────────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    logger.info("Event: %.500s", json.dumps(event))

    # CORS preflight
    method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if method == "OPTIONS":
        return cors_response(200, {})

    # Gallery: GET /gallery
    route = event.get("routeKey", "")
    if route == "GET /gallery" or method == "GET":
        return handle_gallery()

    # Parse body — support both API Gateway (body is a string) and direct invocation
    if "body" in event:
        raw_body = event.get("body") or "{}"
        try:
            body = json.loads(raw_body)
        except json.JSONDecodeError:
            return cors_response(400, {"error": "Invalid JSON body"})
    else:
        body = event  # direct Lambda invocation

    action = body.get("action", "trailer")

    if action == "trailer":
        return handle_trailer(body)
    elif action == "story":
        return handle_story(body)
    elif action == "gallery":
        return handle_gallery()
    else:
        return cors_response(400, {"error": f"Unknown action: {action}"})
