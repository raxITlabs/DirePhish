"""Business-metric HTML report — Track 2's measurable claim.

Reads refinement-loop iteration results, computes 'containment time'
proxy + cost delta, renders the headline as HTML for the demo video.

Usage:
    uv run python scripts/eval_report.py <run1.json> <run2.json> ... <output.html>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Iterable


def compute_business_metrics(eval_runs: Iterable[dict]) -> dict:
    """Aggregate per-run scores into the headline business metric.

    Containment-time proxy: the first round where containment >= 8.0.
    Defaults to total_rounds when threshold never reached.
    """
    runs = list(eval_runs)
    if not runs:
        return {}

    baseline = runs[0]
    final = runs[-1]

    def _ctime(run: dict) -> int:
        for r in run.get("rounds", []):
            if r.get("containment", 0) >= 8.0:
                return r["round"]
        return run.get("total_rounds", 15)

    base_t = _ctime(baseline)
    final_t = _ctime(final)
    return {
        "baseline_containment_round": base_t,
        "final_containment_round": final_t,
        "improvement_pct": round(100.0 * (base_t - final_t) / base_t, 1) if base_t else 0,
        "baseline_cost_usd": baseline.get("total_cost_usd", 0.0),
        "final_cost_usd": final.get("total_cost_usd", 0.0),
    }


def render_html(metrics: dict, out_path: Path) -> None:
    """Write a one-page HTML headline for the demo video."""
    html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>DirePhish Eval Report</title>
<style>
body {{ font-family: -apple-system, sans-serif; max-width: 720px; margin: 64px auto; }}
h1 {{ color: #b8860b; }}
.metric {{ font-size: 1.4em; margin: 16px 0; }}
.delta {{ color: #2e8b57; font-weight: bold; }}
</style></head>
<body>
<h1>DirePhish — Eval-Driven Refinement</h1>
<p class="metric">Containment time reduced from
<strong>round {metrics.get('baseline_containment_round', 'N/A')}</strong>
to <strong>round {metrics.get('final_containment_round', 'N/A')}</strong>
<span class="delta">({metrics.get('improvement_pct', 0)}% improvement)</span>
after refinement.</p>
<p class="metric">Cost per round:
${metrics.get('baseline_cost_usd', 0.0):.4f} → ${metrics.get('final_cost_usd', 0.0):.4f}</p>
</body></html>"""
    out_path.write_text(html)


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: eval_report.py <run1.json> [<run2.json> ...] <output.html>", file=sys.stderr)
        return 2
    *run_paths, out_path = sys.argv[1:]
    runs = [json.loads(Path(p).read_text()) for p in run_paths]
    metrics = compute_business_metrics(runs)
    render_html(metrics, Path(out_path))
    print(json.dumps(metrics, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
