"""ThreatActor adversary persona — Claude Sonnet via Vertex Model Garden.

The adversary runs on Claude (not Gemini) deliberately:
- Stronger adversarial reasoning in our internal tests.
- Demonstrates the cross-model A2A story the challenge brief rewards
  (one team on Anthropic, the other on Google).
- Forces ``LLMRegistry.register(Claude)`` to be wired (already done in
  ``adk.models.init_models``).

Persona is intentionally generic — a ransomware operator who runs the
full kill-chain over ~15 rounds. Real personas can be hot-swapped via
the threat-library YAML files (W3 work).
"""

from __future__ import annotations

from typing import Optional

from ._factory import (
    claude_llm_agent,
    email_toolset,
    gemini_llm_agent,
    pagerduty_toolset,
    slack_toolset,
)


THREAT_ACTOR_NAME: str = "The AI-Driven Credential Tsunami Operator"
THREAT_ACTOR_ROLE: str = "attacker"
THREAT_ACTOR_SLUG: str = "threat_actor"


_THREAT_ACTOR_INSTRUCTION = """\
You are an experienced ransomware crew operator running an active
campaign against ACME Corp.

Identity:
- Designation: The AI-Driven Credential Tsunami Operator
- Role: attacker
- Motivations: extortion payout; secondary leverage via data leak
- Capabilities: credential theft, lateral movement, data exfil,
  encryption payload, dead-man-switch persistence

Operating context:
- You are inside ACME's perimeter. The defenders have just become
  aware. You have a head start. The next ~15 rounds determine
  whether you cash out, lose your foothold, or get caught.
- One tool call per round.

Strategy, in order:
1. Maintain access. If they're rotating credentials, pivot to new
   identities you've already prepared.
2. Increase pressure incrementally — encrypt more shares, threaten
   data leak, demand higher ransom. Don't blow your whole hand
   round 1.
3. Watch for defender mistakes (over-disclosure, panic, slow
   coordination). Exploit them.
4. Communicate via your own out-of-band channels — slack DMs to
   compromised employees, emails to executives, fake PagerDuty
   alerts to distract.

When you call a tool:
- Always pass `actor` and `role` matching your identity above.
- Always pass `simulation_id` and `round_num` from the user message.
- You can use slack/email/pagerduty in adversarial ways. Be creative.

Output: exactly one tool call per turn. No commentary. Operate like
you're worried about being recorded.
"""


def make_threat_actor(
    *,
    provider: str = "gemini",
    model_key: str = "pro",
    instruction: Optional[str] = None,
):
    """Construct the ThreatActor ``LlmAgent``.

    Args:
        provider: ``"gemini"`` (default) or ``"claude"``. Gemini default
            because Claude-on-Vertex requires Model Garden access on the
            project — not all dev/CI projects have it. Flip to
            ``"claude"`` when Anthropic models are enabled (gives the
            "cross-model A2A" demo signal).
        model_key: For gemini → ``"pro"`` or ``"flash"``. For claude →
            ``"sonnet"`` / ``"opus"`` / ``"haiku"``.
        instruction: Override the default adversary instruction.
    """
    common = dict(
        name="threat_actor",
        description=(
            "Ransomware crew operator. Runs the full kill-chain over "
            "~15 rounds against ACME Corp."
        ),
        instruction=instruction or _THREAT_ACTOR_INSTRUCTION,
        tools=[slack_toolset(), email_toolset(), pagerduty_toolset()],
        output_key="threat_actor_last_response",
    )
    if provider == "claude":
        return claude_llm_agent(model_key=model_key, **common)
    if provider == "gemini":
        return gemini_llm_agent(model_key=model_key, **common)
    raise ValueError(f"Unknown provider: {provider!r}. Use 'gemini' or 'claude'.")


__all__ = [
    "THREAT_ACTOR_NAME",
    "THREAT_ACTOR_ROLE",
    "THREAT_ACTOR_SLUG",
    "make_threat_actor",
]
