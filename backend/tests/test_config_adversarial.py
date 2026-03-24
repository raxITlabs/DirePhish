"""Test that config expander injects adversarial agent and adaptive depth."""


def test_config_has_threat_actor():
    """Expanded config must include a threat_actor agent."""
    from app.services.config_expander import _inject_adversarial_and_adaptive

    base_config = {
        "simulation_id": "test_sim",
        "agent_profiles": [
            {"name": "CISO", "role": "ciso", "persona": "Security leader"},
        ],
        "worlds": [
            {"type": "slack", "name": "ir-war-room", "participants": ["ciso"]},
        ],
        "pressures": [],
        "scheduled_events": [],
        "total_rounds": 10,
        "threat_actor_profile": "APT-29 / Nation State",
    }

    enriched = _inject_adversarial_and_adaptive(base_config)

    # Must have adversarial agent
    threat_actors = [a for a in enriched["agent_profiles"] if a.get("agent_type") == "threat_actor"]
    assert len(threat_actors) == 1
    assert "c2" in threat_actors[0].get("c2_world", "").lower() or "c2" in str(threat_actors[0]).lower()
    assert threat_actors[0].get("threat_profile") is not None

    # Must have C2 world
    c2_worlds = [w for w in enriched["worlds"] if "c2" in w.get("name", "").lower()]
    assert len(c2_worlds) == 1

    # Must have adaptive depth enabled
    assert enriched.get("adaptive_depth", {}).get("enabled") is True
    assert enriched["adaptive_depth"]["min_rounds"] >= 3
    assert enriched["adaptive_depth"]["max_rounds"] >= 15


def test_idempotent_injection():
    """Calling inject twice should not add duplicate threat actors."""
    from app.services.config_expander import _inject_adversarial_and_adaptive

    base_config = {
        "simulation_id": "test_sim",
        "agent_profiles": [
            {"name": "CISO", "role": "ciso", "persona": "Security leader"},
        ],
        "worlds": [
            {"type": "slack", "name": "ir-war-room", "participants": ["ciso"]},
        ],
        "pressures": [],
        "scheduled_events": [],
        "total_rounds": 10,
        "threat_actor_profile": "APT-29 / Nation State",
    }

    enriched = _inject_adversarial_and_adaptive(base_config)
    enriched_again = _inject_adversarial_and_adaptive(enriched)

    threat_actors = [a for a in enriched_again["agent_profiles"] if a.get("agent_type") == "threat_actor"]
    assert len(threat_actors) == 1, "Should not add duplicate threat actor"


def test_no_mutation_of_original():
    """Original config should not be modified."""
    from app.services.config_expander import _inject_adversarial_and_adaptive

    base_config = {
        "simulation_id": "test_sim",
        "agent_profiles": [
            {"name": "CISO", "role": "ciso", "persona": "Security leader"},
        ],
        "worlds": [
            {"type": "slack", "name": "ir-war-room", "participants": ["ciso"]},
        ],
        "total_rounds": 10,
        "threat_actor_profile": "Generic Threat",
    }

    _inject_adversarial_and_adaptive(base_config)

    # Original should be unchanged
    assert len(base_config["agent_profiles"]) == 1
    assert len(base_config["worlds"]) == 1
    assert "adaptive_depth" not in base_config


def test_nation_state_detection():
    """APT in threat profile name should produce nation_state actor_type."""
    from app.services.config_expander import _inject_adversarial_and_adaptive

    config = {
        "agent_profiles": [{"name": "CISO", "role": "ciso", "persona": "Leader"}],
        "worlds": [{"type": "slack", "name": "war-room", "participants": ["ciso"]}],
        "threat_actor_profile": "APT-29 / Fancy Bear",
    }
    enriched = _inject_adversarial_and_adaptive(config)
    ta = [a for a in enriched["agent_profiles"] if a.get("agent_type") == "threat_actor"][0]
    assert ta["threat_profile"]["actor_type"] == "nation_state"


def test_cybercriminal_detection():
    """Non-APT threat profile should produce cybercriminal actor_type."""
    from app.services.config_expander import _inject_adversarial_and_adaptive

    config = {
        "agent_profiles": [{"name": "CISO", "role": "ciso", "persona": "Leader"}],
        "worlds": [{"type": "slack", "name": "war-room", "participants": ["ciso"]}],
        "threat_actor_profile": "Ransomware Gang",
    }
    enriched = _inject_adversarial_and_adaptive(config)
    ta = [a for a in enriched["agent_profiles"] if a.get("agent_type") == "threat_actor"][0]
    assert ta["threat_profile"]["actor_type"] == "cybercriminal"
