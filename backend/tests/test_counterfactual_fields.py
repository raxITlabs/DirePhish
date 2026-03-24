# backend/tests/test_counterfactual_fields.py
"""Test that counterfactual engine parses action fields correctly."""


def test_action_field_parsing():
    """Actions use 'agent' and 'action', not 'agent_name' and 'action_type'."""
    from app.services.counterfactual_engine import CounterfactualEngine

    actions = [
        {"round": 1, "agent": "CISO Yuki", "action": "send_message",
         "args": {"content": "Isolate the DB"}, "world": "ir-war-room"},
        {"round": 2, "agent": "SOC Lead", "action": "isolate_system",
         "args": {"target": "payment-db"}, "world": "ir-war-room"},
        {"round": 3, "agent": "CISO Yuki", "action": "send_email",
         "args": {"subject": "Board notification"}, "world": "executive"},
    ]
    config = {"agent_profiles": [{"name": "CISO Yuki"}, {"name": "SOC Lead"}]}

    # This should parse actions correctly — not return empty/unknown
    summary = CounterfactualEngine._build_action_summary(actions)
    assert "CISO Yuki" in summary
    assert "unknown" not in summary.lower()
