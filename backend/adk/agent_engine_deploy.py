"""Deploys the ContainmentJudge to Vertex AI Agent Engine.

Usage:
    cd backend && uv run python -m adk.agent_engine_deploy

Requires:
    GOOGLE_CLOUD_PROJECT
    GOOGLE_CLOUD_LOCATION=us-central1 (Agent Engine-supported region;
        does NOT support 'global')
    Application Default Credentials (ADC) — gcloud auth application-default login

Notes:
    Vertex AI Agent Engine has a documented SSE double-encoding bug
    (CopilotKit issue 2871). For this reason DirePhish only deploys the
    Judge (no SSE) to Agent Engine; the orchestrator + war-room SSE bus
    stay on Cloud Run.
"""

from __future__ import annotations

import logging
import os
import sys

logger = logging.getLogger("direphish.adk.deploy")


def deploy() -> int:
    project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    if not project:
        print("error: GOOGLE_CLOUD_PROJECT not set", file=sys.stderr)
        return 2

    location = os.environ.get("VERTEX_AGENT_ENGINE_LOCATION", "us-central1")

    try:
        # Vertex AI SDK path — the exact module name varies across SDK
        # versions. Adjust if your installed google-cloud-aiplatform is older/newer.
        from vertexai.preview import reasoning_engines  # type: ignore
        import vertexai
    except ImportError as e:
        print(f"error: install google-cloud-aiplatform first ({e})", file=sys.stderr)
        return 3

    from adk.agents.personas import make_containment_judge
    from adk.models import init_models

    init_models()
    vertexai.init(project=project, location=location)

    judge = make_containment_judge()

    logger.info("Deploying ContainmentJudge to Agent Engine project=%s loc=%s",
                project, location)

    try:
        deployed = reasoning_engines.ReasoningEngine.create(
            reasoning_engine=judge,
            display_name="direphish-containment-judge",
            description="Round-by-round IR simulation scorer.",
            requirements=["google-adk>=1.32", "google-genai>=1.0"],
        )
    except Exception as e:
        print(f"error: deploy failed — {e}", file=sys.stderr)
        return 4

    print(f"Deployed: {deployed.resource_name}")
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    sys.exit(deploy())
