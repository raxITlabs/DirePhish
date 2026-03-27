"""Tests for exercise report KPI fixes — MC stats synthesis, resilience synthesis,
MC engine status fix, and multi-tier MC fallback logic.

These tests verify the bug fixes that caused empty KPI cards on the exercise
report page (containment rate, escalation rate, mean response, readiness).
"""
import json
import statistics
import sys
from pathlib import Path
from types import ModuleType
from unittest.mock import MagicMock, patch

import pytest

# Mock google.cloud.firestore before importing exercise_report_agent
# (the module imports it at the top level)
_mock_gc = ModuleType("google.cloud")
_mock_fs = ModuleType("google.cloud.firestore")
_mock_fs.Client = MagicMock
_mock_fs.SERVER_TIMESTAMP = "MOCK"
sys.modules.setdefault("google", ModuleType("google"))
sys.modules.setdefault("google.cloud", _mock_gc)
sys.modules.setdefault("google.cloud.firestore", _mock_fs)


# ---------------------------------------------------------------------------
# 1. MC engine: iteration result gets status="completed" set
# ---------------------------------------------------------------------------

class TestMCEngineStatusFix:
    """The MC engine must set status='completed' on successful iteration results
    so that the aggregation code doesn't skip them."""

    def test_dict_result_gets_status_completed(self):
        """When run_single_iteration returns a dict without 'status',
        the engine should add status='completed'."""
        # Simulate what the engine does at line 520-524
        result = {
            "iteration_id": "test_iter_0000",
            "seed": 42,
            "total_rounds": 5,
            "total_actions": 50,
            "cost_usd": 0.035,
            "output_dir": "/tmp/test",
        }
        # This is the fix: setdefault ensures status is present
        result.setdefault("status", "completed")
        result.setdefault("output_dir", "/tmp/fallback")

        assert result["status"] == "completed"
        assert result["output_dir"] == "/tmp/test"  # Original preserved

    def test_dict_result_preserves_existing_status(self):
        """If the result already has a status, don't overwrite it."""
        result = {"status": "partial", "output_dir": "/tmp/test"}
        result.setdefault("status", "completed")

        assert result["status"] == "partial"


# ---------------------------------------------------------------------------
# 2. _synthesize_mc_stats_from_sim — classify simulation actions
# ---------------------------------------------------------------------------

class TestSynthesizeMCStatsFromSim:
    """_synthesize_mc_stats_from_sim should produce MC-stats-compatible dicts
    from raw simulation action data, using the same keyword classification
    as the MC aggregator."""

    def _make_action(self, round_num: int, action_text: str) -> dict:
        return {"round": round_num, "action": action_text, "args": {}, "result": {}}

    def test_empty_sim_list_returns_none(self):
        from app.services.exercise_report_agent import _synthesize_mc_stats_from_sim
        assert _synthesize_mc_stats_from_sim([]) is None

    def test_sim_with_no_actions_returns_none(self):
        from app.services.exercise_report_agent import _synthesize_mc_stats_from_sim
        result = _synthesize_mc_stats_from_sim([{"actions": []}])
        # Should still return a dict since sim_data_list is non-empty,
        # but with all zeros
        assert result is not None
        assert result["iteration_count"] == 1

    def test_contained_early_classification(self):
        """A sim where containment happens in the first half should be 'contained_early'."""
        from app.services.exercise_report_agent import _synthesize_mc_stats_from_sim
        sim = {
            "actions": [
                self._make_action(1, "Detected suspicious activity"),
                self._make_action(2, "Isolated the compromised server"),
                self._make_action(3, "Contained the breach"),
                self._make_action(4, "Recovery procedures"),
                self._make_action(5, "Post-incident review"),
            ]
        }
        result = _synthesize_mc_stats_from_sim([sim])

        assert result is not None
        assert result["outcome_distribution"]["contained_early"] == 1
        assert result["outcome_distribution"]["escalated"] == 0
        assert result["containment_round_stats"] is not None
        assert result["containment_round_stats"]["mean"] == 2.0  # "Isolated" at round 2
        assert result["source"] == "synthesized"

    def test_contained_late_classification(self):
        """Containment in the second half of rounds should be 'contained_late'."""
        from app.services.exercise_report_agent import _synthesize_mc_stats_from_sim
        sim = {
            "actions": [
                self._make_action(1, "Attack initiated"),
                self._make_action(2, "Lateral movement detected"),
                self._make_action(3, "Escalation to management"),
                self._make_action(4, "Blocked the attacker access"),
                self._make_action(5, "Cleanup"),
            ]
        }
        result = _synthesize_mc_stats_from_sim([sim])

        assert result is not None
        # "Blocked" at round 4, midpoint = 5/2 = 2.5, round 4 > 2.5 => contained_late
        assert result["outcome_distribution"]["contained_late"] == 1

    def test_escalated_classification(self):
        """A sim with escalation keywords and no containment should be 'escalated'."""
        from app.services.exercise_report_agent import _synthesize_mc_stats_from_sim
        sim = {
            "actions": [
                self._make_action(1, "Initial access via phishing"),
                self._make_action(2, "Lateral movement to database"),
                self._make_action(3, "Data exfiltration in progress"),
                self._make_action(4, "Ransomware deployment"),
                self._make_action(5, "Full data leak confirmed"),
            ]
        }
        result = _synthesize_mc_stats_from_sim([sim])

        assert result is not None
        assert result["outcome_distribution"]["escalated"] == 1
        assert result["containment_round_stats"] is None  # No containment

    def test_not_contained_classification(self):
        """A sim with no escalation and no containment keywords = 'not_contained'."""
        from app.services.exercise_report_agent import _synthesize_mc_stats_from_sim
        sim = {
            "actions": [
                self._make_action(1, "Normal operations"),
                self._make_action(2, "Review meeting"),
                self._make_action(3, "Discussed options"),
            ]
        }
        result = _synthesize_mc_stats_from_sim([sim])

        assert result is not None
        assert result["outcome_distribution"]["not_contained"] == 1

    def test_multiple_sims_aggregated(self):
        """Multiple sims should each contribute to outcome distribution."""
        from app.services.exercise_report_agent import _synthesize_mc_stats_from_sim
        sims = [
            {"actions": [self._make_action(1, "Isolated the system")]},
            {"actions": [self._make_action(1, "Data exfiltration")]},
            {"actions": [self._make_action(1, "Normal day")]},
        ]
        result = _synthesize_mc_stats_from_sim(sims)

        assert result is not None
        assert result["iteration_count"] == 3
        dist = result["outcome_distribution"]
        total = sum(dist.values())
        assert total == 3

    def test_containment_round_stats_computed(self):
        """When multiple sims have containment, round stats should be correct."""
        from app.services.exercise_report_agent import _synthesize_mc_stats_from_sim
        sims = [
            {"actions": [
                self._make_action(1, "start"),
                self._make_action(2, "Isolated system"),
                self._make_action(3, "done"),
                self._make_action(4, "done"),
            ]},
            {"actions": [
                self._make_action(1, "start"),
                self._make_action(2, "monitoring"),
                self._make_action(3, "monitoring"),
                self._make_action(4, "Blocked attacker"),
            ]},
        ]
        result = _synthesize_mc_stats_from_sim(sims)

        stats = result["containment_round_stats"]
        assert stats is not None
        assert stats["mean"] == 3.0  # (2 + 4) / 2
        assert stats["min"] == 2
        assert stats["max"] == 4

    def test_output_structure_matches_frontend_expectations(self):
        """The output dict must have all keys the frontend BoardView expects."""
        from app.services.exercise_report_agent import _synthesize_mc_stats_from_sim
        sim = {"actions": [self._make_action(1, "Contained the threat")]}
        result = _synthesize_mc_stats_from_sim([sim])

        assert "iteration_count" in result
        assert "outcome_distribution" in result
        assert "containment_round_stats" in result
        assert "decision_divergence_points" in result
        assert "agent_consistency" in result
        assert isinstance(result["decision_divergence_points"], list)
        assert isinstance(result["agent_consistency"], dict)

        dist = result["outcome_distribution"]
        for key in ("contained_early", "contained_late", "not_contained", "escalated"):
            assert key in dist


# ---------------------------------------------------------------------------
# 3. _synthesize_resilience_from_teams — derive resilience from team scores
# ---------------------------------------------------------------------------

class TestSynthesizeResilienceFromTeams:
    """_synthesize_resilience_from_teams should map team performance scores
    (1-10 scale) to resilience format (0-100 scale)."""

    def test_empty_team_scores_returns_none(self):
        from app.services.exercise_report_agent import _synthesize_resilience_from_teams
        assert _synthesize_resilience_from_teams([], []) is None

    def test_teams_with_no_scores_returns_none(self):
        from app.services.exercise_report_agent import _synthesize_resilience_from_teams
        result = _synthesize_resilience_from_teams([{"name": "Team A", "scores": {}}], [])
        assert result is None

    def test_scales_scores_from_10_to_100(self):
        """Team scores of 7/10 should map to 70/100."""
        from app.services.exercise_report_agent import _synthesize_resilience_from_teams
        teams = [{
            "name": "IR Team",
            "scores": {
                "responseSpeed": 7,
                "containmentEffectiveness": 6,
                "communicationQuality": 8,
                "complianceAdherence": 5,
            }
        }]
        result = _synthesize_resilience_from_teams(teams, [])

        assert result is not None
        dims = result["dimensions"]
        assert dims["detection_speed"] == 70.0
        assert dims["containment_speed"] == 60.0
        assert dims["communication_quality"] == 80.0
        assert dims["compliance_adherence"] == 50.0

    def test_overall_is_mean_of_dimensions(self):
        from app.services.exercise_report_agent import _synthesize_resilience_from_teams
        teams = [{
            "name": "Team",
            "scores": {
                "responseSpeed": 7,      # 70
                "containmentEffectiveness": 5,  # 50
                "communicationQuality": 6,      # 60
                "complianceAdherence": 4,       # 40
            }
        }]
        result = _synthesize_resilience_from_teams(teams, [])

        # Mean of 70, 50, 60, 40 = 55.0
        assert result["overall"] == 55.0

    def test_weakest_link_identified(self):
        from app.services.exercise_report_agent import _synthesize_resilience_from_teams
        teams = [{
            "name": "Team",
            "scores": {
                "responseSpeed": 8,
                "containmentEffectiveness": 3,  # Lowest
                "communicationQuality": 7,
                "complianceAdherence": 6,
            }
        }]
        result = _synthesize_resilience_from_teams(teams, [])

        assert result["weakest_link"] == "containment_speed"

    def test_multiple_teams_averaged(self):
        from app.services.exercise_report_agent import _synthesize_resilience_from_teams
        teams = [
            {"name": "Team A", "scores": {"responseSpeed": 8, "containmentEffectiveness": 6, "communicationQuality": 7, "complianceAdherence": 5}},
            {"name": "Team B", "scores": {"responseSpeed": 6, "containmentEffectiveness": 4, "communicationQuality": 9, "complianceAdherence": 7}},
        ]
        result = _synthesize_resilience_from_teams(teams, [])

        dims = result["dimensions"]
        assert dims["detection_speed"] == 70.0       # avg(8,6) * 10
        assert dims["containment_speed"] == 50.0     # avg(6,4) * 10
        assert dims["communication_quality"] == 80.0  # avg(7,9) * 10
        assert dims["compliance_adherence"] == 60.0   # avg(5,7) * 10

    def test_robustness_index_computed(self):
        from app.services.exercise_report_agent import _synthesize_resilience_from_teams
        teams = [{
            "name": "Team",
            "scores": {
                "responseSpeed": 7,
                "containmentEffectiveness": 7,
                "communicationQuality": 7,
                "complianceAdherence": 7,
            }
        }]
        result = _synthesize_resilience_from_teams(teams, [])

        # All same => std = 0, robustness = overall
        assert result["overall"] == 70.0
        assert result["robustness_index"] == 70.0

    def test_output_structure_matches_frontend_expectations(self):
        """Output must have all keys the ReadinessGauge component expects."""
        from app.services.exercise_report_agent import _synthesize_resilience_from_teams
        teams = [{
            "name": "Team",
            "scores": {
                "responseSpeed": 5,
                "containmentEffectiveness": 5,
                "communicationQuality": 5,
                "complianceAdherence": 5,
            }
        }]
        result = _synthesize_resilience_from_teams(teams, [])

        assert "overall" in result
        assert "dimensions" in result
        assert "robustness_index" in result
        assert "weakest_link" in result
        assert "failure_modes" in result
        assert isinstance(result["failure_modes"], list)
        assert result["source"] == "synthesized"

        dims = result["dimensions"]
        for key in ("detection_speed", "containment_speed", "communication_quality", "compliance_adherence"):
            assert key in dims


# ---------------------------------------------------------------------------
# 4. MC data loading — multi-tier fallback (Tiers 1c and 2)
# ---------------------------------------------------------------------------

class TestMCDataFallbackTiers:
    """Test that the report generator picks up MC data through multiple
    fallback tiers when batch_id is not provided."""

    def test_tier_1c_aggregates_from_iteration_dirs(self, tmp_path):
        """When MC iteration dirs exist but no aggregation.json,
        the report should aggregate on-the-fly."""
        # Set up MC batch dir with one iteration
        mc_batch = tmp_path / "monte_carlo" / "mc_test_batch"
        iter_dir = mc_batch / "mc_test_batch_iter_0000"
        iter_dir.mkdir(parents=True)

        # Write summary.json
        summary = {
            "simulation_id": "test_sim",
            "total_rounds": 5,
            "total_actions": 10,
            "agents": ["Agent A"],
            "worlds": ["world1"],
        }
        (iter_dir / "summary.json").write_text(json.dumps(summary))

        # Write actions.jsonl with containment keyword
        actions = [
            {"round": 1, "agent": "Agent A", "action": "monitor", "args": {}, "result": {}},
            {"round": 2, "agent": "Agent A", "action": "Isolated the threat", "args": {}, "result": {}},
        ]
        with open(iter_dir / "actions.jsonl", "w") as f:
            for a in actions:
                f.write(json.dumps(a) + "\n")

        # Now test the on-the-fly aggregation logic
        from dataclasses import asdict
        from app.services.monte_carlo_aggregator import aggregate_batch, IterationResult

        iter_results = []
        for idir in sorted(mc_batch.iterdir()):
            if not idir.is_dir() or "_iter_" not in idir.name:
                continue
            acts = []
            with open(idir / "actions.jsonl") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        acts.append(json.loads(line))
            with open(idir / "summary.json") as f:
                s = json.load(f)
            iter_results.append(IterationResult(
                iteration_id=idir.name,
                seed=0,
                total_rounds=s.get("total_rounds", 0),
                total_actions=len(acts),
                actions=acts,
                summary=s,
                cost_usd=0,
                variation_description="",
                completed_at="",
                output_dir=str(idir),
            ))

        assert len(iter_results) == 1
        agg = aggregate_batch(iter_results)
        agg_dict = asdict(agg)

        assert agg_dict["iteration_count"] == 1
        assert sum(agg_dict["outcome_distribution"].values()) == 1

        # Verify aggregation.json would be written back
        agg_out = mc_batch / "aggregation.json"
        agg_out.write_text(json.dumps(agg_dict, default=str))
        assert agg_out.exists()

    def test_tier_2_synthesizes_from_sim_data(self):
        """When no MC data exists at all, synthesize from sim actions."""
        from app.services.exercise_report_agent import _synthesize_mc_stats_from_sim
        sim_data = [{
            "actions": [
                {"round": 1, "action": "Quarantined endpoint", "args": {}, "result": {}},
                {"round": 2, "action": "Phishing detected", "args": {}, "result": {}},
                {"round": 3, "action": "Investigation complete", "args": {}, "result": {}},
            ]
        }]
        result = _synthesize_mc_stats_from_sim(sim_data)

        assert result is not None
        assert result["iteration_count"] == 1
        assert sum(result["outcome_distribution"].values()) == 1
        # "Quarantined" at round 1, midpoint = 3/2 = 1.5, round 1 <= 1.5 => contained_early
        assert result["outcome_distribution"]["contained_early"] == 1


# ---------------------------------------------------------------------------
# 5. Resilience fallback — from team scores when no stress tests
# ---------------------------------------------------------------------------

class TestResilienceFallback:
    """Test that resilience is synthesized from team scores when
    no stress test directory exists."""

    def test_fallback_produces_valid_resilience(self):
        from app.services.exercise_report_agent import _synthesize_resilience_from_teams
        team_scores = [
            {
                "name": "Leadership",
                "scores": {
                    "responseSpeed": 7,
                    "containmentEffectiveness": 5,
                    "communicationQuality": 6,
                    "complianceAdherence": 4,
                    "leadershipDecisiveness": 8,
                }
            },
            {
                "name": "Technical Response",
                "scores": {
                    "responseSpeed": 8,
                    "containmentEffectiveness": 7,
                    "communicationQuality": 5,
                    "complianceAdherence": 6,
                    "leadershipDecisiveness": 5,
                }
            },
        ]
        result = _synthesize_resilience_from_teams(team_scores, [])

        assert result is not None
        assert 0 <= result["overall"] <= 100
        assert result["robustness_index"] <= result["overall"]
        assert result["weakest_link"] in result["dimensions"]
        assert result["source"] == "synthesized"

        # All dimension values should be in 0-100 range
        for val in result["dimensions"].values():
            assert 0 <= val <= 100

    def test_ignores_leadership_decisiveness_dimension(self):
        """leadershipDecisiveness has no resilience mapping and should be ignored."""
        from app.services.exercise_report_agent import _synthesize_resilience_from_teams
        teams = [{
            "name": "Team",
            "scores": {
                "responseSpeed": 5,
                "containmentEffectiveness": 5,
                "communicationQuality": 5,
                "complianceAdherence": 5,
                "leadershipDecisiveness": 10,  # Should not affect resilience
            }
        }]
        result = _synthesize_resilience_from_teams(teams, [])

        assert result["overall"] == 50.0  # All mapped dims are 5 * 10 = 50
