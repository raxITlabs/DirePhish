"""Tests for _evaluate_condition from run_crucible_simulation.py."""

import sys
from pathlib import Path
from unittest.mock import MagicMock

# The script imports heavy dependencies (openai, crucible, graphiti, dotenv).
# We stub them out so we can import only the helper function.
_stubs = {}
for mod_name in [
    "dotenv", "openai", "crucible", "crucible.builtins",
    "graphiti_core", "graphiti_core.driver", "graphiti_core.driver.kuzu_driver",
    "graphiti_core.llm_client", "graphiti_core.llm_client.gemini_client",
    "graphiti_core.llm_client.config", "graphiti_core.embedder",
    "graphiti_core.embedder.gemini", "graphiti_core.nodes",
    "graphiti_core.cross_encoder", "graphiti_core.cross_encoder.gemini_reranker_client",
    "app", "app.utils", "app.utils.cost_tracker",
]:
    if mod_name not in sys.modules:
        _stubs[mod_name] = MagicMock()
        sys.modules[mod_name] = _stubs[mod_name]

# crucible.__file__ is accessed at module level — give it a fake path
sys.modules["crucible"].__file__ = "/tmp/fake_crucible/__init__.py"

# Now add the scripts directory to sys.path and import
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
from run_crucible_simulation_legacy import _evaluate_condition  # noqa: E402


class TestEvaluateCondition:
    def test_returns_true_when_keywords_match(self):
        condition = {"keywords": ["isolate", "contain"], "target_systems": []}
        actions = [{"action": "isolate_server", "args": {"target": "web01"}}]
        assert _evaluate_condition(condition, actions) is True

    def test_returns_false_when_no_keywords_match(self):
        condition = {"keywords": ["isolate", "contain"], "target_systems": []}
        actions = [{"action": "send_message", "args": {"content": "hello"}}]
        assert _evaluate_condition(condition, actions) is False

    def test_returns_true_when_keywords_and_targets_match(self):
        condition = {
            "keywords": ["block", "quarantine"],
            "target_systems": ["payment", "gateway"],
        }
        actions = [
            {"action": "block_traffic", "args": {"system": "payment_gateway"}},
        ]
        assert _evaluate_condition(condition, actions) is True

    def test_returns_false_when_keywords_match_but_targets_dont(self):
        condition = {
            "keywords": ["block"],
            "target_systems": ["payment"],
        }
        actions = [
            {"action": "block_traffic", "args": {"system": "email_server"}},
        ]
        assert _evaluate_condition(condition, actions) is False

    def test_returns_false_when_keywords_list_is_empty(self):
        condition = {"keywords": [], "target_systems": ["payment"]}
        actions = [{"action": "block_payment", "args": {}}]
        assert _evaluate_condition(condition, actions) is False

    def test_handles_empty_actions_list(self):
        condition = {"keywords": ["isolate"], "target_systems": []}
        assert _evaluate_condition(condition, []) is False

    def test_keyword_match_is_case_insensitive(self):
        condition = {"keywords": ["Isolate"], "target_systems": []}
        actions = [{"action": "ISOLATE_SERVER", "args": {}}]
        assert _evaluate_condition(condition, actions) is True
