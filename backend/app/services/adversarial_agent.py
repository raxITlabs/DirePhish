"""Adversarial Agent system for DirePhish simulations (Phase 2).

Provides threat actor agents that play against defenders with asymmetric
information.  Attackers observe defender channels but act only in their
own C2 world; their actions are converted into defender-visible injects
(SIEM alerts, EDR alerts, etc.) so defenders react to consequences
without seeing attacker intent.
"""

from __future__ import annotations

import json
from typing import Any


# ---------------------------------------------------------------------------
# Agent partitioning
# ---------------------------------------------------------------------------

def partition_agents(agent_profiles: list[dict]) -> tuple[list[dict], list[dict]]:
    """Split agents into (attackers, defenders) based on agent_type field.

    Agents with ``agent_type == "threat_actor"`` are attackers.
    All others (including those without an ``agent_type`` key) are defenders.
    """
    attackers: list[dict] = []
    defenders: list[dict] = []
    for agent in agent_profiles:
        if agent.get("agent_type") == "threat_actor":
            attackers.append(agent)
        else:
            defenders.append(agent)
    return attackers, defenders


# ---------------------------------------------------------------------------
# Defender observation (what the attacker can see)
# ---------------------------------------------------------------------------

def build_defender_observation(
    world_history: dict[str, list[str]],
    observable_worlds: list[str],
) -> str:
    """Build a read-only digest of defender world histories for the attacker.

    Returns a text block summarising what the attacker has intercepted from
    the defender channels they can observe.  If no observable worlds are
    configured or all channels are empty, returns an empty string.
    """
    if not observable_worlds:
        return ""

    sections: list[str] = []
    for world_name in observable_worlds:
        messages = world_history.get(world_name)
        if not messages:
            continue
        # Show the last 15 messages to keep context window manageable
        recent = messages[-15:]
        body = "\n".join(recent)
        sections.append(f"=== #{world_name} ===\n{body}")

    if not sections:
        return ""

    header = (
        "You have compromised monitoring and can observe these defender "
        "communications:\n\n"
    )
    return header + "\n\n".join(sections)


# ---------------------------------------------------------------------------
# Detection signal scanning
# ---------------------------------------------------------------------------

_DEFAULT_DETECTION_KEYWORDS: list[str] = [
    "isolate",
    "contain",
    "block",
    "quarantine",
    "forensics",
    "detect",
    "ioc",
]


def detect_defender_actions(
    all_actions: list[dict],
    detection_keywords: list[str] | None = None,
) -> list[str]:
    """Scan action history for signs that defenders have detected the attacker.

    Searches every action's ``action`` name and stringified ``args`` for any
    of the detection keywords.  Returns a list of human-readable signal
    descriptions (one per matching action).
    """
    keywords = [k.lower() for k in (detection_keywords or _DEFAULT_DETECTION_KEYWORDS)]
    signals: list[str] = []

    for entry in all_actions:
        action_text = (
            f"{entry.get('action', '')} "
            f"{json.dumps(entry.get('args', {}), ensure_ascii=False)}"
        ).lower()

        matched = [kw for kw in keywords if kw in action_text]
        if matched:
            agent = entry.get("agent", "unknown")
            action = entry.get("action", "unknown")
            world = entry.get("world", "unknown")
            signals.append(
                f"Round {entry.get('round', '?')}: {agent} used '{action}' "
                f"in {world} (keywords: {', '.join(matched)})"
            )

    return signals


# ---------------------------------------------------------------------------
# Attacker system prompt
# ---------------------------------------------------------------------------

def build_adversarial_system_prompt(
    agent: dict,
    defender_observations: str,
    round_num: int,
    total_rounds: int,
) -> str:
    """Build the system prompt for a threat actor agent.

    Includes:
    - Agent persona from config
    - Threat profile (actor_type, sophistication, objectives, tools)
    - Current attack phase estimation
    - What the attacker has observed from defender channels
    - Adaptive rules (if detected pivot; if isolated activate backup)
    """
    name = agent.get("name", "Threat Actor")
    role = agent.get("role", "attacker")
    persona = agent.get("persona", "A sophisticated threat actor.")
    threat_profile = agent.get("threat_profile", {})

    actor_type = threat_profile.get("actor_type", "APT")
    sophistication = threat_profile.get("sophistication", "advanced")
    objectives = threat_profile.get("objectives", ["maintain access", "exfiltrate data"])
    tools_available = threat_profile.get("tools", ["lateral movement", "credential theft", "data exfiltration"])

    # Estimate attack phase based on round progression
    progress = round_num / total_rounds
    if progress <= 0.2:
        phase = "INITIAL ACCESS / RECONNAISSANCE"
        phase_guidance = "Focus on establishing footholds and mapping the environment."
    elif progress <= 0.5:
        phase = "LATERAL MOVEMENT / PRIVILEGE ESCALATION"
        phase_guidance = "Expand access, escalate privileges, identify high-value targets."
    elif progress <= 0.8:
        phase = "OBJECTIVE EXECUTION"
        phase_guidance = "Execute primary objectives (exfiltration, disruption, etc.)."
    else:
        phase = "PERSISTENCE / CLEANUP"
        phase_guidance = "Ensure persistence mechanisms, cover tracks, prepare exit."

    objectives_text = "\n".join(f"  - {obj}" for obj in objectives)
    tools_text = "\n".join(f"  - {t}" for t in tools_available)

    prompt_parts = [
        f"You are {name}, a {sophistication} {actor_type} threat actor.",
        f"Role: {role}",
        f"Persona: {persona}",
        "",
        "== THREAT PROFILE ==",
        f"Actor type: {actor_type}",
        f"Sophistication: {sophistication}",
        f"Objectives:\n{objectives_text}",
        f"Available tools/techniques:\n{tools_text}",
        "",
        f"== ATTACK PHASE: {phase} (Round {round_num}/{total_rounds}) ==",
        phase_guidance,
        "",
        "== ADAPTIVE RULES ==",
        "- If defenders appear to have DETECTED your activity, pivot techniques and change IOCs.",
        "- If defenders have ISOLATED a compromised system, activate backup access or move to a different target.",
        "- If defenders are NOT aware of you, continue methodically toward objectives.",
        "- Always prefer stealth over speed unless time is running out.",
        "",
        "== COMMUNICATION ==",
        "You communicate only through your C2 channel. Your messages represent",
        "commands to implants, status updates, and coordination with your team.",
        "Defenders CANNOT see your C2 channel directly.",
    ]

    if defender_observations:
        prompt_parts.extend([
            "",
            "== INTERCEPTED DEFENDER COMMUNICATIONS ==",
            defender_observations,
        ])

    return "\n".join(prompt_parts)


# ---------------------------------------------------------------------------
# Attacker actions → defender-visible injects
# ---------------------------------------------------------------------------

# Maps attacker action names to (alert_template, is_silent) tuples.
# Silent actions produce no defender-visible alert.
_ACTION_INJECT_MAP: dict[str, tuple[str, bool]] = {
    "exfiltrate_data": ("SIEM Alert: Unusual outbound data transfer detected", False),
    "lateral_move": ("Network: New authentication from unexpected source", False),
    "deploy_payload": ("EDR Alert: Suspicious process execution detected", False),
    "escalate_privileges": ("AD: Privilege escalation attempt logged", False),
    "establish_persistence": ("", True),   # silent
    "send_message": ("", True),            # C2 comms are invisible
    "reply_in_thread": ("", True),         # C2 comms are invisible
}


def attacker_actions_to_injects(
    attacker_actions: list[dict],
    round_num: int,
) -> list[str]:
    """Convert attacker actions into observable consequences for defenders.

    Only actions that map to a non-silent alert template produce output.
    Actions not in the mapping are treated as silent by default.
    """
    injects: list[str] = []
    for action_entry in attacker_actions:
        action_name = action_entry.get("action", "")
        template, is_silent = _ACTION_INJECT_MAP.get(action_name, ("", True))
        if is_silent or not template:
            continue

        # Enrich the alert with round context
        args_snippet = json.dumps(
            action_entry.get("args", {}), ensure_ascii=False
        )[:100]
        inject_text = f"[Round {round_num}] {template} (details: {args_snippet})"
        injects.append(inject_text)

    return injects
