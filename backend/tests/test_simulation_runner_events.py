"""Tests for scheduled event parsing in the simulation runner.

These tests replicate the event resolution logic from run_crucible_simulation.py
(lines 322-330) without importing the heavy script.
"""


def _resolve_event(event, all_actions):
    """Replicate the scheduled event resolution logic from the simulation runner."""
    if isinstance(event, dict) and event.get("condition"):
        from tests.test_evaluate_condition import _evaluate_condition
        condition_met = _evaluate_condition(event["condition"], all_actions)
        return event["condition"]["alternative"] if condition_met else event["description"]
    elif isinstance(event, dict):
        return event.get("description", str(event))
    else:
        return str(event)


# Import _evaluate_condition once — it was already stubbed by test_evaluate_condition
import sys
from pathlib import Path
from unittest.mock import MagicMock

for mod_name in [
    "dotenv", "openai", "crucible", "crucible.builtins",
    "graphiti_core", "graphiti_core.driver", "graphiti_core.driver.kuzu_driver",
    "graphiti_core.llm_client", "graphiti_core.llm_client.gemini_client",
    "graphiti_core.llm_client.config", "graphiti_core.embedder",
    "graphiti_core.embedder.gemini", "graphiti_core.nodes",
    "graphiti_core.cross_encoder", "graphiti_core.cross_encoder.gemini_reranker_client",
    "app.utils.cost_tracker",
]:
    if mod_name not in sys.modules:
        sys.modules[mod_name] = MagicMock()

# crucible.__file__ is accessed at module level
if hasattr(sys.modules.get("crucible"), "__file__") is False or isinstance(sys.modules["crucible"].__file__, MagicMock):
    sys.modules["crucible"].__file__ = "/tmp/fake_crucible/__init__.py"

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
from run_crucible_simulation import _evaluate_condition  # noqa: E402


def _resolve_event_real(event, all_actions):
    """Use the real _evaluate_condition for proper integration."""
    if isinstance(event, dict) and event.get("condition"):
        condition_met = _evaluate_condition(event["condition"], all_actions)
        return event["condition"]["alternative"] if condition_met else event["description"]
    elif isinstance(event, dict):
        return event.get("description", str(event))
    else:
        return str(event)


class TestScheduledEventParsing:
    def test_plain_string_event_backward_compat(self):
        result = _resolve_event_real("SIEM alert detected", [])
        assert result == "SIEM alert detected"

    def test_dict_event_without_condition(self):
        event = {"round": 1, "description": "Phishing email lands"}
        result = _resolve_event_real(event, [])
        assert result == "Phishing email lands"

    def test_dict_event_with_condition_not_met(self):
        event = {
            "round": 3,
            "description": "Attacker pivots to DB",
            "condition": {
                "keywords": ["isolate", "contain"],
                "target_systems": ["payment"],
                "alternative": "Attacker blocked at boundary",
            },
        }
        # No matching actions — condition NOT met — use original description
        result = _resolve_event_real(event, [])
        assert result == "Attacker pivots to DB"

    def test_conditional_event_uses_alternative_when_condition_met(self):
        event = {
            "round": 3,
            "description": "Attacker pivots to DB",
            "condition": {
                "keywords": ["isolate", "contain"],
                "target_systems": ["payment"],
                "alternative": "Attacker blocked at boundary",
            },
        }
        actions = [{"action": "contain_breach", "args": {"system": "payment_gateway"}}]
        result = _resolve_event_real(event, actions)
        assert result == "Attacker blocked at boundary"

    def test_conditional_event_uses_description_when_condition_not_met(self):
        event = {
            "round": 3,
            "description": "Data exfiltration begins",
            "condition": {
                "keywords": ["block", "firewall"],
                "target_systems": ["egress"],
                "alternative": "Exfiltration attempt blocked by firewall rule",
            },
        }
        # Actions don't match
        actions = [{"action": "send_message", "args": {"content": "checking logs"}}]
        result = _resolve_event_real(event, actions)
        assert result == "Data exfiltration begins"

    def test_integer_event_converted_to_string(self):
        result = _resolve_event_real(42, [])
        assert result == "42"
