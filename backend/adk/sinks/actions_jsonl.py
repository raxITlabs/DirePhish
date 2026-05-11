"""actions.jsonl writer matching the legacy run_crucible_simulation.py format.

One JSON line per ActionEvent. Frontend's
``GET /api/crucible/simulations/<id>/actions?from_round=N`` reads this
file with no transformation — schema must match the legacy writer exactly.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TextIO

from crucible.events import ActionEvent


class ActionsJsonlSink:
    """Appends one JSON line per ActionEvent. File is opened lazily."""

    def __init__(self, *, output_dir: Path) -> None:
        self.path = Path(output_dir) / "actions.jsonl"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._fh: TextIO | None = None

    def _open(self) -> TextIO:
        if self._fh is None:
            self._fh = self.path.open("a", encoding="utf-8")
        return self._fh

    def write(self, event: ActionEvent) -> None:
        """Append one event as a single JSON line."""
        line = json.dumps(event.model_dump(), default=str, ensure_ascii=False)
        self._open().write(line + "\n")
        self._fh.flush()  # for live tailing by the frontend SSE poller

    def close(self) -> None:
        if self._fh is not None:
            self._fh.close()
            self._fh = None
