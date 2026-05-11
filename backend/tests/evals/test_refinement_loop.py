"""Refinement loop primitives — pure-logic unit tests (no Vertex needed)."""

import pytest
from scripts.refine_prompts import pick_winner_by_target_rubric


def test_pick_winner_chooses_highest_target_rubric():
    candidates = [
        ("instr_v1", {"containment": 5.0, "evidence": 6.0, "communication": 7.0, "business_impact": 6.0}),
        ("instr_v2", {"containment": 7.5, "evidence": 5.5, "communication": 6.5, "business_impact": 6.0}),
        ("instr_v3", {"containment": 6.0, "evidence": 7.0, "communication": 7.5, "business_impact": 7.0}),
    ]
    winner_instr, winner_scores = pick_winner_by_target_rubric(candidates, target="containment")
    assert winner_instr == "instr_v2"
    assert winner_scores["containment"] == 7.5


def test_pick_winner_handles_empty_candidates_safely():
    with pytest.raises((ValueError, IndexError)):
        pick_winner_by_target_rubric([], target="containment")


def test_pick_winner_handles_missing_rubric_key():
    """Treat missing as 0.0."""
    candidates = [
        ("a", {"containment": 5.0}),
        ("b", {"evidence": 8.0}),  # missing containment
    ]
    winner, _ = pick_winner_by_target_rubric(candidates, target="containment")
    assert winner == "a"


def test_identify_weakest_rubric():
    from scripts.refine_prompts import identify_weakest_rubric
    scores = {"containment": 7.0, "evidence": 4.5, "communication": 6.0, "business_impact": 7.5}
    assert identify_weakest_rubric(scores, exclude=()) == "evidence"


def test_compute_business_metrics_shows_improvement():
    from scripts.eval_report import compute_business_metrics

    # Baseline: containment hits 8.0 at round 9
    baseline_rounds = [{"round": i, "containment": min(8.0, 3.0 + i*0.6)} for i in range(15)]
    # Final: containment hits 8.0 at round 6 (faster)
    final_rounds = [{"round": i, "containment": min(8.0, 4.0 + i*0.8)} for i in range(15)]

    runs = [
        {"rounds": baseline_rounds, "total_rounds": 15, "total_cost_usd": 0.10},
        {"rounds": final_rounds, "total_rounds": 15, "total_cost_usd": 0.08},
    ]
    m = compute_business_metrics(runs)
    assert m["final_containment_round"] < m["baseline_containment_round"]
    assert m["improvement_pct"] > 0


def test_compute_business_metrics_handles_no_containment():
    from scripts.eval_report import compute_business_metrics
    runs = [
        {"rounds": [{"round": i, "containment": 2.0} for i in range(10)], "total_rounds": 10, "total_cost_usd": 0.05},
    ]
    m = compute_business_metrics(runs)
    # Should default to total_rounds when threshold never reached
    assert m["baseline_containment_round"] == 10


def test_render_html_creates_file(tmp_path):
    from scripts.eval_report import compute_business_metrics, render_html
    runs = [
        {"rounds": [{"round": i, "containment": 5.0+i*0.5} for i in range(15)], "total_rounds": 15, "total_cost_usd": 0.10},
    ]
    m = compute_business_metrics(runs)
    out = tmp_path / "report.html"
    render_html(m, out)
    assert out.exists()
    content = out.read_text()
    assert "DirePhish" in content
