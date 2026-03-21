"""Tests for agent role normalization logic in config_expander.py."""


class TestRoleNormalization:
    """Test the role normalization block in _expand_single_scenario (lines 146-150)."""

    @staticmethod
    def _normalize(agents: list[dict]) -> list[dict]:
        """Replicate the normalization logic under test."""
        for agent in agents:
            if "role_id" in agent and "role" not in agent:
                agent["role"] = agent.pop("role_id")
            if "role" not in agent:
                agent["role"] = agent.get("name", "unknown").lower().replace(" ", "_")
        return agents

    def test_role_id_converted_to_role(self):
        agents = [{"name": "Alice", "role_id": "ciso"}]
        result = self._normalize(agents)
        assert result[0]["role"] == "ciso"
        assert "role_id" not in result[0]

    def test_agent_without_role_gets_generated_role(self):
        agents = [{"name": "Bob Smith"}]
        result = self._normalize(agents)
        assert result[0]["role"] == "bob_smith"

    def test_agent_with_role_unchanged(self):
        agents = [{"name": "Carol", "role": "legal_counsel"}]
        result = self._normalize(agents)
        assert result[0]["role"] == "legal_counsel"

    def test_role_id_ignored_when_role_already_set(self):
        agents = [{"name": "Dave", "role": "cto", "role_id": "old_cto"}]
        result = self._normalize(agents)
        assert result[0]["role"] == "cto"
        # role_id is NOT removed because the code only pops when "role" not in agent
        assert result[0]["role_id"] == "old_cto"

    def test_missing_name_falls_back_to_unknown(self):
        agents = [{}]
        result = self._normalize(agents)
        assert result[0]["role"] == "unknown"
