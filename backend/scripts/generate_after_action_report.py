#!/usr/bin/env python3
"""Generate an after-action report from Crucible simulation output.

Reads actions.jsonl and the simulation config, then uses LLM to produce
a structured after-action report analyzing agent decisions, timeline,
key tensions, and recommendations.

Usage:
    uv run python scripts/generate_after_action_report.py \
        --config uploads/test_crucible_config.json \
        --actions uploads/simulations/crucible_test/actions.jsonl \
        --output uploads/simulations/crucible_test/after_action_report.md
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from dotenv import load_dotenv

_env_path = Path(__file__).parent.parent.parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path, override=True)

import os
from openai import OpenAI


def load_actions(actions_path: str) -> list[dict]:
    """Load actions from JSONL file."""
    actions = []
    with open(actions_path) as f:
        for line in f:
            line = line.strip()
            if line:
                actions.append(json.loads(line))
    return actions


def format_timeline(actions: list[dict]) -> str:
    """Format actions into a readable timeline."""
    lines = []
    current_round = 0
    for a in actions:
        if a["round"] != current_round:
            current_round = a["round"]
            lines.append(f"\n### Round {current_round}")

        action_detail = ""
        if a["action"] == "send_message":
            content = a.get("args", {}).get("content", "")[:300]
            action_detail = f"posted in {a['world']}: \"{content}\""
        elif a["action"] == "send_email":
            to = a.get("args", {}).get("to", "?")
            subj = a.get("args", {}).get("subject", "")
            action_detail = f"sent email to {to}: \"{subj}\""
        elif a["action"] == "reply_in_thread":
            content = a.get("args", {}).get("content", "")[:300]
            action_detail = f"replied in thread: \"{content}\""
        elif a["action"] == "reply_email":
            content = a.get("args", {}).get("body", "")[:300]
            action_detail = f"replied to email: \"{content}\""
        elif a["action"] == "do_nothing":
            action_detail = "took no action"
        else:
            action_detail = f"{a['action']}: {json.dumps(a.get('args', {}))[:200]}"

        lines.append(f"- **{a['agent']}** ({a['role']}) [{a['world']}]: {action_detail}")

    return "\n".join(lines)


def generate_report(config: dict, actions: list[dict], client: OpenAI, model: str) -> str:
    """Use LLM to generate the after-action report."""
    timeline = format_timeline(actions)
    scenario = config.get("scenario", "Not provided")
    agents = ", ".join(f"{a['name']} ({a['role']})" for a in config["agent_profiles"])
    pressures = ", ".join(p["name"] for p in config["pressures"])
    total_rounds = config["total_rounds"]
    total_actions = len(actions)

    prompt = f"""You are an expert incident response analyst. Based on the following simulation of a cybersecurity incident response, write a detailed after-action report.

## Simulation Context

**Company:** {config.get('company_name', 'Unknown')}
**Scenario:** {scenario}
**Agents:** {agents}
**Business Pressures:** {pressures}
**Duration:** {total_rounds} rounds ({total_rounds} hours simulated)
**Total Actions:** {total_actions}

## Simulation Timeline

{timeline}

## Report Requirements

Write a comprehensive after-action report with these sections:

1. **Executive Summary** (3-4 sentences)
2. **Incident Timeline** (key decision points and their outcomes)
3. **Key Decisions Analyzed** (what was decided, by whom, the reasoning, and whether it was the right call)
4. **Tensions and Conflicts** (where did stakeholders disagree? how was it resolved?)
5. **Communication Effectiveness** (how well did the team coordinate across Slack and Email?)
6. **Pressure Impact** (how did GDPR deadlines and business pressures influence decisions?)
7. **Gaps and Missed Actions** (what should have been done but wasn't?)
8. **Recommendations** (specific, actionable improvements for the IR process)
9. **Scores** (rate each participant 1-10 on: response speed, communication clarity, decision quality, collaboration)

Be specific. Reference actual quotes and actions from the timeline. Be critical where warranted — this is a learning exercise, not a praise report."""

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "You are a senior incident response consultant writing an after-action report. Be thorough, specific, and constructively critical."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=4096,
    )

    return response.choices[0].message.content


def main():
    parser = argparse.ArgumentParser(description="Generate after-action report from Crucible simulation")
    parser.add_argument("--config", required=True, help="Path to simulation config JSON")
    parser.add_argument("--actions", required=True, help="Path to actions.jsonl")
    parser.add_argument("--output", required=True, help="Output path for the report (.md)")
    args = parser.parse_args()

    config = json.loads(Path(args.config).read_text())
    actions = load_actions(args.actions)

    client = OpenAI(
        api_key=os.environ.get("LLM_API_KEY", ""),
        base_url=os.environ.get("LLM_BASE_URL"),
    )
    model = os.environ.get("LLM_MODEL_NAME", "gpt-4o-mini")

    print(f"Generating after-action report from {len(actions)} actions...")
    report = generate_report(config, actions, client, model)

    Path(args.output).write_text(report)
    print(f"Report saved to {args.output}")
    print(f"\n{'='*60}")
    print(report[:2000])
    if len(report) > 2000:
        print(f"\n... ({len(report)} chars total, see full report at {args.output})")


if __name__ == "__main__":
    main()
