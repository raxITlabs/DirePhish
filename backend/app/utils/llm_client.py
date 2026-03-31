"""
LLM Client Wrapper
Unified calls using OpenAI format. Instrumented with OpenTelemetry.
"""

import json
import re
from typing import Optional, Dict, Any, List
from openai import OpenAI

from ..config import Config

# OpenTelemetry tracing
try:
    from opentelemetry import trace
    _tracer = trace.get_tracer("direphish.llm", "1.0.0")
except ImportError:
    _tracer = None


class LLMClient:
    """LLM Client"""
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None
    ):
        self.api_key = api_key or Config.LLM_API_KEY
        self.base_url = base_url or Config.LLM_BASE_URL
        self.model = model or Config.LLM_MODEL_NAME
        
        if not self.api_key:
            raise ValueError("LLM_API_KEY is not configured")
        
        self.client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url
        )
        self.last_usage: Optional[Dict[str, int]] = None
    
    def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: Optional[Dict] = None
    ) -> str:
        """
        Send chat request
        
        Args:
            messages: List of messages
            temperature: Temperature parameter
            max_tokens: Maximum number of tokens
            response_format: Response format (e.g., JSON mode)
            
        Returns:
            Model response text
        """
        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        if response_format:
            kwargs["response_format"] = response_format

        # Wrap in OpenTelemetry span
        span_ctx = _tracer.start_as_current_span(
            "llm.chat",
            attributes={
                "llm.model": self.model,
                "llm.temperature": temperature,
                "llm.max_tokens": max_tokens,
                "llm.message_count": len(messages),
                "llm.has_json_mode": response_format is not None,
            },
        ) if _tracer else None

        try:
            if span_ctx:
                span_ctx.__enter__()

            response = self.client.chat.completions.create(**kwargs)
            # Capture token usage for cost tracking
            if response.usage:
                self.last_usage = {
                    "input_tokens": response.usage.prompt_tokens or 0,
                    "output_tokens": response.usage.completion_tokens or 0,
                    "cached_tokens": getattr(response.usage, "cached_prompt_tokens", 0) or 0,
                }
                # Record token usage in span
                if span_ctx and _tracer:
                    span = trace.get_current_span()
                    span.set_attribute("llm.input_tokens", self.last_usage["input_tokens"])
                    span.set_attribute("llm.output_tokens", self.last_usage["output_tokens"])
                    span.set_attribute("llm.cached_tokens", self.last_usage["cached_tokens"])
            else:
                self.last_usage = None
            content = response.choices[0].message.content
            # Some models (e.g., MiniMax M2.5) include <think> content in the response, which needs to be removed
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
        max_tokens: int = 4096
    ) -> Dict[str, Any]:
        """
        Send chat request and return JSON
        
        Args:
            messages: List of messages
            temperature: Temperature parameter
            max_tokens: Maximum number of tokens
            
        Returns:
            Parsed JSON object
        """
        response = self.chat(
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"}
        )
        # Clean markdown code block markers
        cleaned_response = response.strip()
        cleaned_response = re.sub(r'^```(?:json)?\s*\n?', '', cleaned_response, flags=re.IGNORECASE)
        cleaned_response = re.sub(r'\n?```\s*$', '', cleaned_response)
        cleaned_response = cleaned_response.strip()

        try:
            return json.loads(cleaned_response)
        except json.JSONDecodeError:
            # Recovery: LLM sometimes appends trailing garbage after valid JSON
            # (common when json_object mode conflicts with array-returning prompts).
            # Try to extract the outermost balanced JSON structure.
            extracted = self._extract_json(cleaned_response)
            if extracted is not None:
                return extracted
            raise ValueError(f"Invalid JSON format returned by LLM: {cleaned_response}")

    @staticmethod
    def _extract_json(text: str):
        """Extract the first balanced JSON object or array from *text*.

        Handles trailing tokens the LLM appends after the valid JSON body.
        Returns the parsed value or ``None`` if nothing could be recovered.
        """
        # Try whichever bracket appears first in the text so we don't
        # accidentally match a later `{` when the real payload starts with `[`.
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

