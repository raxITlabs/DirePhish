"""
DirePhish Mission Control Console
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
All output goes to the log file only (no stdout/stderr) to avoid
filling subprocess pipe buffers when run as a child process.
"""

from __future__ import annotations

import os
import re
import logging
from datetime import datetime
from logging.handlers import RotatingFileHandler

# File logger — captures everything MissionControl prints (stripped of ANSI)
# Uses propagate=False + own file handler so messages go to log file ONCE
_file_logger = logging.getLogger("direphish.console")
_file_logger.setLevel(logging.DEBUG)
_file_logger.propagate = False

if not _file_logger.handlers:
    _log_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "logs")
    os.makedirs(_log_dir, exist_ok=True)
    _fh = RotatingFileHandler(
        os.path.join(_log_dir, datetime.now().strftime("%Y-%m-%d") + ".log"),
        maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8",
    )
    _fh.setFormatter(logging.Formatter(
        "[%(asctime)s] %(levelname)s [%(name)s.%(funcName)s:%(lineno)d] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))
    _file_logger.addHandler(_fh)

_ANSI_RE = re.compile(r"\033\[[0-9;]*m")


# ── ANSI escape sequences ────────────────────────────────────────────────────

class _C:
    BOLD   = "\033[1m"
    DIM    = "\033[2m"
    RESET  = "\033[0m"
    TEAL   = "\033[36m"
    ORANGE = "\033[33m"
    RED    = "\033[31m"
    GREEN  = "\033[32m"
    BLUE   = "\033[34m"
    MAGENTA = "\033[35m"
    WHITE  = "\033[37m"
    BG_TEAL = "\033[46m"
    BG_RED  = "\033[41m"


# ── Mission Control ──────────────────────────────────────────────────────────

class MissionControl:
    """Static mission-control console for DirePhish pipeline runs."""

    LINE_WIDTH = 60

    # ── internal helpers ─────────────────────────────────────────────────

    @staticmethod
    def _out(text: str):
        """Log to file only (ANSI-stripped). No stdout/stderr to avoid pipe buffer issues."""
        clean = _ANSI_RE.sub("", text).strip()
        if clean:
            _file_logger.info(clean)

    @staticmethod
    def _ts() -> str:
        """Return a bracketed HH:MM:SS timestamp."""
        return f"{_C.DIM}[{datetime.now().strftime('%H:%M:%S')}]{_C.RESET}"

    # ── Startup ──────────────────────────────────────────────────────────

    @staticmethod
    def banner(
        features: list[str],
        gcp_project: str,
        embedding_model: str,
        embedding_dims: int,
        max_workers: int,
        rpm_limit: int,
    ):
        feat_str = " | ".join(features)
        lines = [
            "",
            f"{_C.TEAL}{_C.BOLD}  +{'=' * 56}+{_C.RESET}",
            f"{_C.TEAL}{_C.BOLD}  |{'DIREPHISH v2.0 -- Threat Simulation Engine':^56}|{_C.RESET}",
            f"{_C.TEAL}{_C.BOLD}  +{'=' * 56}+{_C.RESET}",
            "",
            f"  {_C.TEAL}{_C.BOLD}>{_C.RESET} {_C.WHITE}Features:{_C.RESET} {_C.DIM}{feat_str}{_C.RESET}",
            f"  {_C.TEAL}{_C.BOLD}>{_C.RESET} {_C.WHITE}GCP:{_C.RESET} {_C.DIM}{gcp_project}{_C.RESET}"
            f" {_C.DIM}|{_C.RESET} {_C.WHITE}Embedding:{_C.RESET} {_C.DIM}{embedding_model} @ {embedding_dims}d{_C.RESET}",
            f"  {_C.TEAL}{_C.BOLD}>{_C.RESET} {_C.WHITE}Workers:{_C.RESET} {_C.DIM}{max_workers}{_C.RESET}"
            f" {_C.DIM}|{_C.RESET} {_C.WHITE}RPM Limit:{_C.RESET} {_C.DIM}{rpm_limit}{_C.RESET}",
            "",
        ]
        MissionControl._out("\n".join(lines))

    # ── Phase Headers ────────────────────────────────────────────────────

    @staticmethod
    def phase(name: str, context: str = ""):
        ctx = f" {_C.DIM}[{context}]{_C.RESET}" if context else ""
        label = f" {name}{ctx} "
        pad = MissionControl.LINE_WIDTH - len(name) - (len(f" [{context}] ") if context else 0) - 6
        if pad < 4:
            pad = 4
        bar = (
            f"\n{_C.TEAL}{_C.BOLD}"
            f"{'=' * 3}{label}{_C.TEAL}{_C.BOLD}{'=' * pad}"
            f"{_C.RESET}\n"
        )
        MissionControl._out(bar)

    # ── Research ─────────────────────────────────────────────────────────

    @staticmethod
    def research_step(project_id: str, message: str, cost: float = 0):
        cost_str = f" {_C.DIM}(cost: ${cost:.4f}){_C.RESET}" if cost > 0 else ""
        MissionControl._out(
            f"{MissionControl._ts()} {_C.TEAL}{_C.BOLD}*{_C.RESET} {message}{cost_str}"
        )

    # ── Simulation ───────────────────────────────────────────────────────

    @staticmethod
    def round_header(sim_id: str, round_num: int, total_rounds: int):
        pct = int(round_num / total_rounds * 100) if total_rounds else 0
        bar = MissionControl.progress_bar(round_num, total_rounds, width=20)
        MissionControl._out(
            f"{MissionControl._ts()} {_C.BOLD}Round {round_num}/{total_rounds}{_C.RESET} {bar}"
        )

    @staticmethod
    def agent_action(
        agent_name: str,
        world: str,
        action: str,
        args_preview: str = "",
        is_attacker: bool = False,
    ):
        preview = (args_preview[:80] + "...") if len(args_preview) > 80 else args_preview
        if is_attacker:
            icon = f"{_C.RED}X{_C.RESET}"
            name_color = _C.RED
        else:
            icon = f"{_C.TEAL}@{_C.RESET}"
            name_color = _C.TEAL
        arrow = f"{_C.DIM}->{_C.RESET}"
        preview_str = f" {arrow} {_C.DIM}{preview}{_C.RESET}" if preview else ""
        MissionControl._out(
            f"    {icon} {_C.BOLD}{name_color}[{agent_name}]{_C.RESET}"
            f" {_C.WHITE}{world}:{_C.RESET} {action}{preview_str}"
        )

    @staticmethod
    def inject(text: str):
        MissionControl._out(
            f"    {_C.ORANGE}{_C.BOLD}!! {text}{_C.RESET}"
        )

    @staticmethod
    def arbiter(message: str, stop: bool = False):
        color = _C.RED if stop else _C.TEAL
        label = "HALT" if stop else "CONTINUE"
        MissionControl._out(
            f"    {color}{_C.BOLD}~ Arbiter [{label}]:{_C.RESET} {color}{message}{_C.RESET}"
        )

    @staticmethod
    def round_cost(round_cost: float, total_cost: float):
        MissionControl._out(
            f"    {_C.DIM}$ Round: ${round_cost:.4f}"
            f" | Total: ${total_cost:.4f}{_C.RESET}"
        )

    @staticmethod
    def sim_complete(sim_id: str, rounds: int, total_cost: float, duration_s: float):
        MissionControl._out(
            f"  {_C.GREEN}{_C.BOLD}OK{_C.RESET} {_C.BOLD}{sim_id}{_C.RESET}"
            f" {_C.DIM}-- {rounds} rounds, ${total_cost:.3f}, {duration_s:.1f}s{_C.RESET}"
        )

    # ── Monte Carlo ──────────────────────────────────────────────────────

    @staticmethod
    def mc_header(
        batch_id: str,
        mode: str,
        iterations: int,
        workers: int,
        cost_limit: float,
    ):
        MissionControl._out(
            f"{MissionControl._ts()} {_C.MAGENTA}{_C.BOLD}Monte Carlo{_C.RESET}"
            f" {_C.DIM}[{batch_id}]{_C.RESET}"
        )
        MissionControl._out(
            f"{MissionControl._ts()} {_C.WHITE}Mode:{_C.RESET} {_C.DIM}{mode}{_C.RESET}"
            f" {_C.DIM}|{_C.RESET} {_C.WHITE}Iterations:{_C.RESET} {_C.DIM}{iterations}{_C.RESET}"
            f" {_C.DIM}|{_C.RESET} {_C.WHITE}Workers:{_C.RESET} {_C.DIM}{workers}{_C.RESET}"
        )
        MissionControl._out(
            f"{MissionControl._ts()} {_C.WHITE}Cost limit:{_C.RESET} {_C.DIM}${cost_limit:.2f}{_C.RESET}"
        )

    @staticmethod
    def mc_iteration(
        index: int,
        total: int,
        status: str,
        outcome: str = "",
        round_num: int = 0,
        cost: float = 0,
        temp: float = 0,
    ):
        idx_str = f"iter {index:>{len(str(total))}}/{total}"

        if status == "completed":
            icon = f"{_C.GREEN}+{_C.RESET}"
            detail = f"{_C.GREEN}{outcome:<22}{_C.RESET}"
        elif status == "running":
            icon = f"{_C.TEAL}o{_C.RESET}"
            detail = f"{_C.TEAL}{'running...':<22}{_C.RESET}"
        else:  # pending
            icon = f"{_C.DIM}-{_C.RESET}"
            MissionControl._out(f"    {icon} {_C.DIM}{idx_str}  pending{_C.RESET}")
            return

        round_str = f"r={round_num:<3}" if round_num else "     "
        cost_str  = f"${cost:<7.4f}" if cost else "        "
        temp_str  = f"(temp={temp:.2f})" if temp else ""

        MissionControl._out(
            f"    {icon} {idx_str}  {detail} {_C.DIM}{round_str} {cost_str} {temp_str}{_C.RESET}"
        )

    @staticmethod
    def mc_progress(
        completed: int,
        total: int,
        cost_so_far: float,
        cost_limit: float,
        elapsed_s: float = 0,
    ):
        pct = int(completed / total * 100) if total else 0

        if completed > 0 and elapsed_s > 0:
            remaining = (elapsed_s / completed) * (total - completed)
            if remaining >= 60:
                eta = f"{remaining / 60:.0f}m"
            else:
                eta = f"{remaining:.0f}s"
        else:
            eta = "--"

        divider = f"{_C.DIM}{'_' * 40}{_C.RESET}"
        MissionControl._out(
            f"\n    {divider}\n"
            f"    {_C.WHITE}Progress:{_C.RESET} {_C.BOLD}{completed}/{total}{_C.RESET}"
            f" ({pct}%)"
            f" {_C.DIM}|{_C.RESET} ${cost_so_far:.2f} / ${cost_limit:.2f}"
            f" {_C.DIM}|{_C.RESET} ETA: {eta}\n"
        )

    # ── Utility ──────────────────────────────────────────────────────────

    @staticmethod
    def progress_bar(current: int, total: int, width: int = 20) -> str:
        if total == 0:
            filled = 0
        else:
            filled = int(current / total * width)
        empty = width - filled
        pct = int(current / total * 100) if total else 0
        return (
            f"{_C.TEAL}|"
            f"{_C.BOLD}{'#' * filled}{_C.RESET}"
            f"{_C.DIM}{'.' * empty}{_C.RESET}"
            f"{_C.TEAL}|{_C.RESET}"
            f" {pct}%"
        )

    @staticmethod
    def error(message: str):
        MissionControl._out(
            f"    {_C.RED}{_C.BOLD}X {message}{_C.RESET}"
        )

    @staticmethod
    def warning(message: str):
        MissionControl._out(
            f"    {_C.ORANGE}{_C.BOLD}! {message}{_C.RESET}"
        )
