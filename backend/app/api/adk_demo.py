"""ADK demo API — cost dashboard surface for the war-room frontend."""

from __future__ import annotations

from flask import Blueprint, jsonify

from app.utils.cost_tracker import get_or_create_tracker

adk_demo_bp = Blueprint("adk_demo", __name__)


@adk_demo_bp.route("/cost-dashboard/<sim_id>", methods=["GET"])
def cost_dashboard(sim_id: str):
    """Return CostTracker.summary() for the given sim_id.

    Always returns 200 — a fresh tracker for an unknown sim_id is
    valid (just empty totals). Frontend polls this on each round.
    """
    tracker = get_or_create_tracker(sim_id)
    return jsonify(tracker.summary())
