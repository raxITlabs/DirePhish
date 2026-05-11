"""summary.json writer — per-sim final summary.

Written once at sim-end. Frontend's status route reads
``uploads/simulations/<sim_id>/summary.json`` for completion state.

Field set is intentionally open-ended (legacy contract allowed extra
keys) — the sink writes whatever the caller passes.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class SummaryJsonSink:
    """Writes a single summary.json at sim-end."""

    def __init__(self, *, output_dir: Path) -> None:
        self.path = Path(output_dir) / "summary.json"
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def finalize(self, **fields: Any) -> None:
        """Write summary.json with the given fields + finalized_at timestamp."""
        payload: dict[str, Any] = {
            **fields,
            "finalized_at": datetime.now(timezone.utc).isoformat(),
        }
        self.path.write_text(json.dumps(payload, indent=2, default=str))
