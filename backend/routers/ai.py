"""AI module — grounded Q&A via local Ollama or Claude API."""

import json
import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from cache import cache_get, cache_set, TTL

router = APIRouter()
logger = logging.getLogger(__name__)

AI_MODEL = os.getenv("AI_MODEL", "claude-sonnet-4-5-20241022")


class AskRequest(BaseModel):
    question: str
    context: dict | None = None


class AskResponse(BaseModel):
    answer: str
    source: str
    model: str


async def _query_ollama(question: str, context: dict | None) -> AskResponse | None:
    import httpx

    prompt = question
    if context:
        prompt = f"Context (current screen data):\n```json\n{json.dumps(context, indent=2, default=str)[:4000]}\n```\n\nQuestion: {question}\n\nAnswer concisely using the context provided. If the context doesn't contain enough information, say so."

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": "llama3.1:8b",
                    "prompt": prompt,
                    "stream": False,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return AskResponse(
                answer=data.get("response", "").strip(),
                source="ollama",
                model="llama3.1:8b",
            )
    except Exception as exc:
        logger.debug("Ollama not available: %s", exc)
        return None


async def _query_claude(question: str, context: dict | None) -> AskResponse | None:
    import httpx

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        return None

    system_prompt = "You are SpectraTerminal AI, a concise financial research assistant. Answer using the provided context data. If context is insufficient, say so clearly. Keep answers under 200 words."

    user_content = question
    if context:
        user_content = f"Context:\n```json\n{json.dumps(context, indent=2, default=str)[:4000]}\n```\n\n{question}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": AI_MODEL,
                    "max_tokens": 1024,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_content}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            text = data.get("content", [{}])[0].get("text", "").strip()
            return AskResponse(
                answer=text,
                source="claude",
                model=AI_MODEL,
            )
    except Exception as exc:
        logger.debug("Claude API not available: %s", exc)
        return None


@router.post("/ai/ask", response_model=AskResponse)
async def ask(request: AskRequest):
    ollama_result = await _query_ollama(request.question, request.context)
    if ollama_result:
        return ollama_result

    claude_result = await _query_claude(request.question, request.context)
    if claude_result:
        return claude_result

    raise HTTPException(
        status_code=503,
        detail="No AI backend available. Start Ollama locally or set ANTHROPIC_API_KEY.",
    )