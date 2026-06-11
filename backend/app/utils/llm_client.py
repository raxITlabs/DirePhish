"""
LLM Client Wrapper — unified Google Gen AI SDK on Vertex AI.

Migrated from the deprecated OpenAI-compatible client to the unified
``google-genai`` SDK routed through Vertex AI (Application Default
Credentials). The public ``chat()`` / ``chat_json()`` surface is unchanged
so callers (research_agent, monte_carlo_engine, report generation) are
untouched. OpenAI-style message dicts (role/content) are converted to
Gen AI ``Content`` objects; ``system`` messages become a system instruction.
Instrumented with OpenTelemetry.
"""

import json
import logging
import os
import re
from typing import Optional, Dict, Any, List

from google import genai
from google.genai import types

from ..config import Config

logger = logging.getLogger("direphish.llm")

# OpenTelemetry tracing
try:
    from opentelemetry import trace
    _tracer = trace.get_tracer("direphish.llm", "1.0.0")
except ImportError:
    _tracer = None


def _to_genai(messages: List[Dict[str, str]]):
    """Convert OpenAI-style messages → (system_instruction, contents).

    ``system`` roles are concatenated into a single system instruction;
    ``assistant`` maps to the Gen AI ``model`` role; everything else maps
    to ``user``.
    """
    system_parts: List[str] = []
    contents: List[types.Content] = []
    for m in messages:
        role = m.get("role", "user")
        text = m.get("content", "") or ""
        if role == "system":
            if text:
                system_parts.append(text)
            continue
        genai_role = "model" if role == "assistant" else "user"
        contents.append(
            types.Content(role=genai_role, parts=[types.Part.from_text(text=text)])
        )
    system_instruction = "\n\n".join(system_parts) or None
    return system_instruction, contents


class LLMClient:
    """LLM Client (Gemini via Vertex AI / google-genai)."""

    def __init__(
        self,
        api_key: Optional[str] = None,  # accepted for backward compat; unused on Vertex
        base_url: Optional[str] = None,  # accepted for backward compat; unused on Vertex
        model: Optional[str] = None,
    ):
        self.model = model or Config.LLM_MODEL_NAME
        # Vertex routing via ADC. project/location come from env
        # (GOOGLE_CLOUD_PROJECT / GOOGLE_CLOUD_LOCATION); passing them
        # explicitly keeps behaviour deterministic if only one is set.
        self.client = genai.Client(
            vertexai=True,
            project=Config.GCP_PROJECT_ID or None,
            location=os.environ.get("GOOGLE_CLOUD_LOCATION", "global"),
        )
        self.last_usage: Optional[Dict[str, int]] = None

    def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: Optional[Dict] = None,
    ) -> str:
        """Send a chat request, return the model's text response."""
        system_instruction, contents = _to_genai(messages)

        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
            system_instruction=system_instruction,
        )
        # Any response_format (json_object OR a json_schema) means the caller
        # wants JSON — treat all of them as JSON mode so thinking is disabled and
        # the budget produces the answer. (Graph extraction passes a json_schema,
        # which previously slipped through with thinking ON -> empty/MAX_TOKENS.)
        json_mode = bool(response_format)
        if json_mode:
            config.response_mime_type = "application/json"
            # Gemini 3.x flash is a thinking model: in JSON mode a tight output
            # budget gets consumed by thinking, leaving response.text EMPTY
            # (finish_reason=MAX_TOKENS). Disable thinking for structured
            # extraction and give the answer ample room so the JSON always lands.
            try:
                config.thinking_config = types.ThinkingConfig(thinking_budget=0)
            except Exception:  # noqa: BLE001 - older SDK/model without the field
                pass
            if max_tokens < 16384:
                config.max_output_tokens = 16384

        span_ctx = _tracer.start_as_current_span(
            "llm.chat",
            attributes={
                "llm.model": self.model,
                "llm.temperature": temperature,
                "llm.max_tokens": max_tokens,
                "llm.message_count": len(messages),
                "llm.has_json_mode": json_mode,
            },
        ) if _tracer else None

        try:
            if span_ctx:
                span_ctx.__enter__()

            response = self.client.models.generate_content(
                model=self.model,
                contents=contents,
                config=config,
            )

            # Capture token usage for cost tracking
            usage = getattr(response, "usage_metadata", None)
            if usage:
                self.last_usage = {
                    "input_tokens": getattr(usage, "prompt_token_count", 0) or 0,
                    "output_tokens": getattr(usage, "candidates_token_count", 0) or 0,
                    "cached_tokens": getattr(usage, "cached_content_token_count", 0) or 0,
                }
                if span_ctx and _tracer:
                    span = trace.get_current_span()
                    span.set_attribute("llm.input_tokens", self.last_usage["input_tokens"])
                    span.set_attribute("llm.output_tokens", self.last_usage["output_tokens"])
                    span.set_attribute("llm.cached_tokens", self.last_usage["cached_tokens"])
            else:
                self.last_usage = None

            content = response.text or ""
            # Surface empty responses (safety block / MAX_TOKENS) with the
            # finish_reason instead of silently returning "" — which downstream
            # JSON parsing turned into an opaque "Invalid JSON" error.
            if not content.strip():
                finish_reason = None
                try:
                    finish_reason = response.candidates[0].finish_reason
                except Exception:  # noqa: BLE001
                    pass
                raise RuntimeError(
                    f"Empty LLM response (model={self.model}, "
                    f"finish_reason={finish_reason}, max_tokens={max_tokens})"
                )
            # Some models include <think> content in the response — strip it.
            content = re.sub(r'<think>[\s\S]*?</think>', '', content).strip()
            return content
        except Exception as e:
            if span_ctx and _tracer:
                span = trace.get_current_span()
                span.set_attribute("llm.error", str(e))
                span.set_status(trace.StatusCode.ERROR, str(e))
            raise
        finally:
            if span_ctx:
                span_ctx.__exit__(None, None, None)

    def chat_json(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> Dict[str, Any]:
        """Send a chat request and return parsed JSON.

        Retries on empty/degenerate/truncated responses (e.g. a lone "{") — the
        model occasionally returns malformed JSON under load; a re-call almost
        always succeeds, which keeps the multi-call config/threat stages robust.
        """
        last_bad: Optional[str] = None
        for attempt in range(3):
            try:
                response = self.chat(
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    response_format={"type": "json_object"},
                )
            except RuntimeError as exc:  # empty response surfaced by chat()
                last_bad = str(exc)
                logger.warning("chat_json empty response (attempt %d/3): %s", attempt + 1, exc)
                continue

            # Clean markdown code block markers
            cleaned_response = response.strip()
            cleaned_response = re.sub(r'^```(?:json)?\s*\n?', '', cleaned_response, flags=re.IGNORECASE)
            cleaned_response = re.sub(r'\n?```\s*$', '', cleaned_response)
            cleaned_response = cleaned_response.strip()

            try:
                return json.loads(cleaned_response)
            except json.JSONDecodeError:
                # Recovery: extract the outermost balanced JSON structure.
                extracted = self._extract_json(cleaned_response)
                if extracted is not None:
                    return extracted
                last_bad = cleaned_response
                logger.warning(
                    "chat_json invalid JSON (attempt %d/3): %.100s", attempt + 1, cleaned_response
                )

        raise ValueError(f"Invalid JSON format returned by LLM after 3 attempts: {last_bad}")

    @staticmethod
    def _extract_json(text: str):
        """Extract the first balanced JSON object or array from *text*.

        Handles trailing tokens the LLM appends after the valid JSON body.
        Returns the parsed value or ``None`` if nothing could be recovered.
        """
        pairs = [("{", "}"), ("[", "]")]
        positions = [(text.find(s), s, e) for s, e in pairs]
        positions = [(p, s, e) for p, s, e in positions if p != -1]
        positions.sort(key=lambda x: x[0])
        for _, start_char, end_char in positions:
            start = text.find(start_char)
            if start == -1:
                continue
            depth = 0
            in_string = False
            escape = False
            for i in range(start, len(text)):
                ch = text[i]
                if escape:
                    escape = False
                    continue
                if ch == "\\":
                    escape = True
                    continue
                if ch == '"':
                    in_string = not in_string
                    continue
                if in_string:
                    continue
                if ch == start_char:
                    depth += 1
                elif ch == end_char:
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(text[start:i + 1])
                        except json.JSONDecodeError:
                            break
        return None
