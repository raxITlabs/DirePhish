"""Defender personas for the IR simulation.

The persona registry maps named agent identities (the ``agent`` field on
``ActionEvent``) to persona slugs. This is the recovery path for slug
information that the strict ``ActionEvent.role`` enum collapses (per
§11.6 of the crucible-adk-hooks plan).

Persona classes are constructed once at orchestrator boot from this
registry. Missing entries surface as ``KeyError`` — loud failure is
preferred over silent fallback to a default persona.
"""

from .ir_lead import IRLeadPersona

# Static map: ``ActionEvent.agent`` → persona slug. Sourced from the
# legacy fixture survey under §11.2; extend as new personas land.
PERSONA_BY_AGENT_NAME: dict[str, str] = {
    "Dane Stuckey": "ciso",
    "Marcus Thorne": "infrastructure_lead",
    "Elena Rodriguez": "security_engineer",
    "Sam Altman": "ceo",
    "Fidji Simo": "ceo_of_applications",
    "Jakub Pachocki": "chief_scientist",
    "Greg Brockman": "president",
    "Che Chang": "general_counsel",
    "Sarah Friar": "cfo",
}

__all__ = ["IRLeadPersona", "PERSONA_BY_AGENT_NAME"]
