"""Defender + adversary + judge personas for the IR simulation.

Persona modules each expose:
- Identity constants (e.g., ``IR_LEAD_NAME``, ``IR_LEAD_ROLE``,
  ``IR_LEAD_SLUG``).
- A factory function (e.g., ``make_ir_lead()``) returning a configured
  ADK ``LlmAgent`` wired to the appropriate MCP toolsets and the
  ``track_cost`` after_model_callback.

The defender team (5 personas) runs as a ``ParallelAgent`` inside the
orchestrator. The adversary runs on Claude (via Vertex Model Garden).
The judge runs on Gemini Pro for evaluative consistency.

``PERSONA_BY_AGENT_NAME`` is the static map from ``ActionEvent.agent``
to persona slug (per §11.6 of the crucible-adk-hooks plan — needed
because ``ActionEvent.role`` is a strict enum that collapses persona
identity).
"""

from .ir_lead import (
    IR_LEAD_NAME,
    IR_LEAD_ROLE,
    IR_LEAD_SLUG,
    IRLeadPersona,
    make_ir_lead,
)
from .ciso import CISO_NAME, CISO_ROLE, CISO_SLUG, make_ciso
from .soc_analyst import (
    SOC_ANALYST_NAME,
    SOC_ANALYST_ROLE,
    SOC_ANALYST_SLUG,
    make_soc_analyst,
)
from .legal import LEGAL_NAME, LEGAL_ROLE, LEGAL_SLUG, make_legal
from .ceo import CEO_NAME, CEO_ROLE, CEO_SLUG, make_ceo
from .threat_actor import (
    THREAT_ACTOR_NAME,
    THREAT_ACTOR_ROLE,
    THREAT_ACTOR_SLUG,
    make_threat_actor,
)
from .containment_judge import (
    JUDGE_NAME,
    JUDGE_ROLE,
    make_containment_judge,
    parse_judge_output,
)


PERSONA_BY_AGENT_NAME: dict[str, str] = {
    IR_LEAD_NAME: IR_LEAD_SLUG,
    CISO_NAME: CISO_SLUG,
    SOC_ANALYST_NAME: SOC_ANALYST_SLUG,
    LEGAL_NAME: LEGAL_SLUG,
    CEO_NAME: CEO_SLUG,
    THREAT_ACTOR_NAME: THREAT_ACTOR_SLUG,
    # Legacy persona-name → slug entries from W1's PERSONA_BY_AGENT_NAME.
    # Kept until W3 clears the legacy report-agent code paths.
    "Marcus Thorne": "infrastructure_lead",
    "Elena Rodriguez": "security_engineer",
    "Sam Altman": "ceo",
    "Fidji Simo": "ceo_of_applications",
    "Jakub Pachocki": "chief_scientist",
    "Greg Brockman": "president",
    "Che Chang": "general_counsel",
    "Sarah Friar": "cfo",
}


# Observe-then-act protocol. Reads (read_channel / check_inbox) now return real
# world state (crucible serves observation_actions), but under the one-write-
# action-per-round budget a defender that *reads instead of acts* wastes its
# turn. This protocol tells defenders to OBSERVE FIRST (free — reads don't
# consume the action) and THEN take their single informed write, so situational
# awareness raises coordination without costing containment actions. Toggle with
# DIREPHISH_OBSERVE_THEN_ACT=0 (used for A/B baselines).
_OBSERVE_THEN_ACT = """

OBSERVE-THEN-ACT PROTOCOL (follow every round):
1. OBSERVE FIRST. Before acting, call `slack_read_channel` for the
   "incident-war-room" channel to see what teammates have already done this
   incident (and `email_check_inbox` if you work over email). These are reads
   — they do NOT use up your action for the round.
2. ACT ONCE. Then take EXACTLY ONE write action (e.g. `slack_send_message`)
   that builds on what you observed — do not duplicate a step a teammate has
   already taken; cover the most important open gap for the current state.
3. End your turn with the line: ROUND COMPLETE.
"""


def make_defender_team(*, model_key: str = "flash"):
    """Construct all 5 defenders as ``LlmAgent`` instances.

    Returns the list in canonical order:
    ``[ciso, ir_lead, soc_analyst, legal, ceo]``. Wrap in a
    ``ParallelAgent`` (or SequentialAgent under tight quota) when
    assembling the orchestrator's defender branch.

    Each defender gets the observe-then-act protocol appended (unless
    ``DIREPHISH_OBSERVE_THEN_ACT=0``) so they read shared world state before
    spending their single action.

    Args:
        model_key: ``"flash"`` (default) or ``"pro"``. Flash is the
            default because new GCP projects ship with ~5 RPM of Pro
            quota — 7 calls per round (5 defenders + adversary + judge)
            exceeds that. Flip strategic personas (CISO, IR Lead) back
            to Pro after a quota lift if you want deeper reasoning.
    """
    import os

    team = [
        make_ciso(model_key=model_key),
        make_ir_lead(model_key=model_key),
        make_soc_analyst(model_key=model_key),
        make_legal(model_key=model_key),
        make_ceo(model_key=model_key),
    ]
    if os.environ.get("DIREPHISH_OBSERVE_THEN_ACT", "1") != "0":
        for defender in team:
            defender.instruction = (defender.instruction or "") + _OBSERVE_THEN_ACT
    return team


__all__ = [
    # IR Lead
    "IR_LEAD_NAME",
    "IR_LEAD_ROLE",
    "IR_LEAD_SLUG",
    "IRLeadPersona",
    "make_ir_lead",
    # CISO
    "CISO_NAME",
    "CISO_ROLE",
    "CISO_SLUG",
    "make_ciso",
    # SOC Analyst
    "SOC_ANALYST_NAME",
    "SOC_ANALYST_ROLE",
    "SOC_ANALYST_SLUG",
    "make_soc_analyst",
    # Legal
    "LEGAL_NAME",
    "LEGAL_ROLE",
    "LEGAL_SLUG",
    "make_legal",
    # CEO
    "CEO_NAME",
    "CEO_ROLE",
    "CEO_SLUG",
    "make_ceo",
    # Threat Actor
    "THREAT_ACTOR_NAME",
    "THREAT_ACTOR_ROLE",
    "THREAT_ACTOR_SLUG",
    "make_threat_actor",
    # Judge
    "JUDGE_NAME",
    "JUDGE_ROLE",
    "make_containment_judge",
    "parse_judge_output",
    # Composition + legacy
    "make_defender_team",
    "PERSONA_BY_AGENT_NAME",
]
