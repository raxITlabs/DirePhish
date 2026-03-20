# Crucible Phase 3: Agent Layer + CrucibleEnv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the agent layer — Jinja2-templated system prompts, configurable observation environment with pressure injection, enterprise agent generator, and CrucibleEnv that orchestrates multiple worlds with pressure ticking. At the end, agents can observe their world, choose actions via LLM, and act under business pressure.

**Architecture:** AgentInfo uses Jinja2 to render system prompts from platform config templates. ConfigurableEnvironment gathers observations and injects pressure text. CrucibleEnv manages multiple worlds (platforms) in parallel, ticks the pressure engine each round, and coordinates agent execution via asyncio.gather. Visibility strategies determine what each agent sees.

**Tech Stack:** Python 3.12, UV, Jinja2, asyncio, pytest, pytest-asyncio

**Depends on:** Phase 1 (config, pressure) + Phase 2 (actions, platform, channel)

---

## File Structure (Phase 3 additions)

```
src/crucible/
├── agent/
│   ├── __init__.py
│   ├── user_info.py              # AgentInfo — Jinja2 system prompts
│   └── environment.py            # ConfigurableEnvironment — observations + pressure
├── visibility/
│   ├── __init__.py
│   ├── base.py                   # VisibilityStrategy ABC
│   └── strategies/
│       ├── __init__.py
│       └── chronological.py      # Newest-first (for Slack/chat)
├── environment/
│   ├── __init__.py
│   ├── env.py                    # CrucibleEnv — multi-world orchestration
│   └── env_action.py             # ManualAction, LLMAction dataclasses
tests/
├── test_agent_info.py
├── test_environment.py
├── test_visibility.py
├── test_crucible_env.py
```

---

### Task 1: AgentInfo (Jinja2 System Prompts)

**Files:**
- Create: `src/crucible/agent/__init__.py`
- Create: `src/crucible/agent/user_info.py`
- Create: `tests/test_agent_info.py`

- [ ] **Step 1: Write failing test**

`tests/test_agent_info.py`:
```python
from crucible.agent.user_info import AgentInfo


def test_renders_system_prompt():
    template = "You are {{ name }}, a {{ role }}. {{ persona }}"
    info = AgentInfo(
        profile={"name": "Yuki Tanaka", "role": "IR Lead", "persona": "5 years IR experience."},
        system_prompt_template=template,
    )
    msg = info.to_system_message()
    assert "Yuki Tanaka" in msg
    assert "IR Lead" in msg
    assert "5 years IR experience" in msg


def test_renders_with_pressure():
    template = "You are {{ name }}.\n{% if pressures %}{{ pressures }}{% endif %}"
    info = AgentInfo(
        profile={"name": "Raj"},
        system_prompt_template=template,
    )
    msg = info.to_system_message(pressures="⚠️ GDPR: 47 hours remaining")
    assert "GDPR" in msg


def test_missing_vars_render_empty():
    template = "You are {{ name }}, role: {{ role | default('unknown') }}."
    info = AgentInfo(
        profile={"name": "Alex"},
        system_prompt_template=template,
    )
    msg = info.to_system_message()
    assert "unknown" in msg


def test_empty_template():
    info = AgentInfo(profile={"name": "Test"}, system_prompt_template="")
    msg = info.to_system_message()
    assert msg == ""
```

- [ ] **Step 2: Implement AgentInfo**

`src/crucible/agent/__init__.py`: empty

`src/crucible/agent/user_info.py`:
```python
"""Config-driven agent identity with Jinja2 system prompts."""

from typing import Any
from jinja2 import Template


class AgentInfo:
    """Agent identity that renders system prompts from templates.

    Replaces OASIS UserInfo which hardcoded 'You're a Twitter user'.
    """

    def __init__(self, profile: dict[str, Any], system_prompt_template: str):
        self.profile = profile
        self._template = Template(system_prompt_template)

    def to_system_message(self, **extra_context) -> str:
        """Render the system prompt with profile data and optional extra context."""
        context = {**self.profile, **extra_context}
        return self._template.render(**context)

    @property
    def name(self) -> str:
        return self.profile.get("name", "Unknown")

    @property
    def role(self) -> str:
        return self.profile.get("role", "unknown")
```

- [ ] **Step 3: Run tests, commit**

```bash
uv run pytest tests/test_agent_info.py -v
git add src/crucible/agent/ tests/test_agent_info.py
git commit -m "feat: add AgentInfo with Jinja2 system prompts"
```

---

### Task 2: Visibility Strategy

**Files:**
- Create: `src/crucible/visibility/__init__.py`
- Create: `src/crucible/visibility/base.py`
- Create: `src/crucible/visibility/strategies/__init__.py`
- Create: `src/crucible/visibility/strategies/chronological.py`
- Create: `tests/test_visibility.py`

- [ ] **Step 1: Write failing test**

`tests/test_visibility.py`:
```python
import pytest
from crucible.visibility.base import VisibilityStrategy
from crucible.visibility.strategies.chronological import ChronologicalStrategy


def test_chronological_returns_newest_first():
    items = [
        {"id": 1, "created_at": "2026-03-20T01:00:00", "content": "first"},
        {"id": 2, "created_at": "2026-03-20T03:00:00", "content": "third"},
        {"id": 3, "created_at": "2026-03-20T02:00:00", "content": "second"},
    ]
    strategy = ChronologicalStrategy(limit=10)
    result = strategy.filter(items, agent_id=1)
    assert result[0]["id"] == 2  # newest first
    assert result[2]["id"] == 1  # oldest last


def test_chronological_respects_limit():
    items = [{"id": i, "created_at": f"2026-03-20T{i:02d}:00:00", "content": f"msg {i}"} for i in range(20)]
    strategy = ChronologicalStrategy(limit=5)
    result = strategy.filter(items, agent_id=1)
    assert len(result) == 5


def test_is_visibility_strategy():
    strategy = ChronologicalStrategy(limit=10)
    assert isinstance(strategy, VisibilityStrategy)
```

- [ ] **Step 2: Implement**

`src/crucible/visibility/__init__.py`:
```python
"""Visibility strategies for Crucible worlds."""
from .base import VisibilityStrategy
```

`src/crucible/visibility/base.py`:
```python
"""Abstract base for visibility strategies."""

from abc import ABC, abstractmethod
from typing import Any


class VisibilityStrategy(ABC):
    """Determines what content an agent sees in their observation."""

    @abstractmethod
    def filter(self, items: list[dict[str, Any]], agent_id: int) -> list[dict[str, Any]]:
        """Filter and order items for a specific agent."""
        ...
```

`src/crucible/visibility/strategies/__init__.py`: empty

`src/crucible/visibility/strategies/chronological.py`:
```python
"""Chronological visibility — newest first. Good for chat/Slack."""

from typing import Any
from ..base import VisibilityStrategy


class ChronologicalStrategy(VisibilityStrategy):
    """Return items sorted by created_at descending, limited to N."""

    def __init__(self, limit: int = 10):
        self.limit = limit

    def filter(self, items: list[dict[str, Any]], agent_id: int) -> list[dict[str, Any]]:
        sorted_items = sorted(items, key=lambda x: x.get("created_at", ""), reverse=True)
        return sorted_items[:self.limit]
```

- [ ] **Step 3: Run tests, commit**

```bash
uv run pytest tests/test_visibility.py -v
git add src/crucible/visibility/ tests/test_visibility.py
git commit -m "feat: add VisibilityStrategy ABC and ChronologicalStrategy"
```

---

### Task 3: ConfigurableEnvironment (Observations + Pressure)

**Files:**
- Create: `src/crucible/agent/environment.py`
- Create: `tests/test_environment.py`

- [ ] **Step 1: Write failing test**

`tests/test_environment.py`:
```python
import pytest
from crucible.agent.environment import ConfigurableEnvironment


def test_renders_observation():
    template = "Messages:\n{% for m in messages %}{{ m.author }}: {{ m.content }}\n{% endfor %}"
    env = ConfigurableEnvironment(observation_template=template)

    observations = {"messages": [
        {"author": "Yuki", "content": "Breach confirmed"},
        {"author": "Raj", "content": "Escalating to CEO"},
    ]}
    text = env.render(observations)
    assert "Yuki: Breach confirmed" in text
    assert "Raj: Escalating to CEO" in text


def test_injects_pressure():
    template = "{% if pressures %}{{ pressures }}\n{% endif %}Messages: {{ messages | length }}"
    env = ConfigurableEnvironment(observation_template=template)

    observations = {"messages": [{"content": "test"}]}
    pressure_text = "⚠️ GDPR: 47 hours [HIGH]"
    text = env.render(observations, pressure_text=pressure_text)
    assert "GDPR" in text
    assert "Messages: 1" in text


def test_empty_observations():
    template = "{% if messages %}Has messages{% else %}No messages{% endif %}"
    env = ConfigurableEnvironment(observation_template=template)
    text = env.render({})
    assert "No messages" in text
```

- [ ] **Step 2: Implement**

`src/crucible/agent/environment.py`:
```python
"""Configurable observation environment for Crucible agents."""

from typing import Any
from jinja2 import Template


class ConfigurableEnvironment:
    """Renders what an agent observes each round.

    Uses Jinja2 templates from platform config. Injects business
    pressure text when available.
    """

    def __init__(self, observation_template: str):
        self._template = Template(observation_template)

    def render(self, observations: dict[str, Any], pressure_text: str = "") -> str:
        """Render the observation prompt for an agent."""
        context = {**observations}
        if pressure_text:
            context["pressures"] = pressure_text
        return self._template.render(**context)
```

- [ ] **Step 3: Run tests, commit**

```bash
uv run pytest tests/test_environment.py -v
git add src/crucible/agent/environment.py tests/test_environment.py
git commit -m "feat: add ConfigurableEnvironment with pressure injection"
```

---

### Task 4: Environment Action Types

**Files:**
- Create: `src/crucible/environment/__init__.py`
- Create: `src/crucible/environment/env_action.py`

- [ ] **Step 1: Create action types**

`src/crucible/environment/__init__.py`: empty

`src/crucible/environment/env_action.py`:
```python
"""Action types for CrucibleEnv.step()."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ManualAction:
    """An action with predetermined type and arguments."""
    action_type: str
    action_args: dict[str, Any] = field(default_factory=dict)


@dataclass
class LLMAction:
    """Let the LLM agent decide what action to take."""
    pass
```

- [ ] **Step 2: Verify import**

```bash
uv run python -c "from crucible.environment.env_action import ManualAction, LLMAction; print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add src/crucible/environment/
git commit -m "feat: add ManualAction and LLMAction dataclasses"
```

---

### Task 5: CrucibleEnv (Multi-World Orchestration)

**Files:**
- Create: `src/crucible/environment/env.py`
- Create: `tests/test_crucible_env.py`

- [ ] **Step 1: Write failing test**

`tests/test_crucible_env.py`:
```python
import asyncio
import pytest
from crucible.environment.env import CrucibleEnv
from crucible.environment.env_action import ManualAction
from crucible.config.platform_config import (
    PlatformConfig, ActionConfig, ParamConfig, VisibilityConfig,
    SchemaConfig, SchemaTableConfig, SchemaColumnConfig,
)
from crucible.config.pressure_config import PressureConfig


def _test_platform():
    return PlatformConfig(
        name="test_chat",
        display_name="Test Chat",
        system_prompt_template="You are {{ name }}.",
        observation_template="Round {{ round }}.",
        actions=[
            ActionConfig(name="send_message", description="Send", parameters=[
                ParamConfig(name="channel_name", type="string", description="Channel"),
                ParamConfig(name="content", type="string", description="Message"),
            ]),
            ActionConfig(name="do_nothing", description="Nothing", parameters=[]),
        ],
        schema=SchemaConfig(tables=[
            SchemaTableConfig(name="message", columns=[
                SchemaColumnConfig(name="message_id", type="INTEGER", primary_key=True, autoincrement=True),
                SchemaColumnConfig(name="channel_name", type="TEXT"),
                SchemaColumnConfig(name="user_id", type="INTEGER"),
                SchemaColumnConfig(name="content", type="TEXT"),
                SchemaColumnConfig(name="created_at", type="DATETIME"),
            ]),
            SchemaTableConfig(name="trace", columns=[
                SchemaColumnConfig(name="trace_id", type="INTEGER", primary_key=True, autoincrement=True),
                SchemaColumnConfig(name="user_id", type="INTEGER"),
                SchemaColumnConfig(name="action", type="TEXT"),
                SchemaColumnConfig(name="info", type="TEXT"),
                SchemaColumnConfig(name="created_at", type="DATETIME"),
            ]),
        ]),
        visibility=VisibilityConfig(strategy="chronological"),
    )


def _test_pressures():
    return [PressureConfig(
        name="Test deadline",
        type="countdown",
        hours=10,
        affects_roles=["tester"],
    )]


def test_env_creates(tmp_path):
    env = CrucibleEnv(
        world_configs=[_test_platform()],
        pressure_configs=_test_pressures(),
        db_dir=str(tmp_path),
        hours_per_round=1.0,
    )
    assert len(env.worlds) == 1
    assert env.pressure_engine is not None
    assert env.current_round == 0
    env.close()


@pytest.mark.asyncio
async def test_env_step_with_manual_action(tmp_path):
    env = CrucibleEnv(
        world_configs=[_test_platform()],
        pressure_configs=_test_pressures(),
        db_dir=str(tmp_path),
        hours_per_round=1.0,
    )
    await env.start()

    # Execute a manual action on world 0
    actions = {
        0: [  # world index
            (1, ManualAction(action_type="send_message", action_args={"channel_name": "#general", "content": "Hello"})),
        ]
    }
    results = await env.step(actions)
    assert env.current_round == 1

    # Pressure should have ticked
    active = env.pressure_engine.get_all_active()
    assert active[0].remaining_hours == 9.0

    await env.stop()


def test_env_pressure_format(tmp_path):
    env = CrucibleEnv(
        world_configs=[_test_platform()],
        pressure_configs=_test_pressures(),
        db_dir=str(tmp_path),
        hours_per_round=1.0,
    )
    text = env.get_pressure_text("tester")
    assert "Test deadline" in text
    env.close()
```

- [ ] **Step 2: Implement CrucibleEnv**

`src/crucible/environment/env.py`:
```python
"""CrucibleEnv — multi-world simulation orchestrator."""

import asyncio
import os
from typing import Any

from ..config.platform_config import PlatformConfig
from ..config.pressure_config import PressureConfig
from ..platform.configurable_platform import ConfigurablePlatform
from ..platform.channel import Channel
from ..pressure.engine import PressureEngine
from .env_action import ManualAction, LLMAction


class CrucibleEnv:
    """Orchestrates multiple worlds with pressure ticking.

    Each world is a ConfigurablePlatform running on its own Channel.
    Each round: tick pressure, execute agent actions across all worlds.
    """

    def __init__(
        self,
        world_configs: list[PlatformConfig],
        pressure_configs: list[PressureConfig] | None = None,
        db_dir: str = "/tmp/crucible",
        hours_per_round: float = 1.0,
    ):
        self.hours_per_round = hours_per_round
        self.current_round = 0
        os.makedirs(db_dir, exist_ok=True)

        # Create pressure engine
        self.pressure_engine = PressureEngine(
            configs=pressure_configs or [],
            hours_per_round=hours_per_round,
        )

        # Create worlds (platforms)
        self.worlds: list[ConfigurablePlatform] = []
        self._channels: list[Channel] = []
        self._platform_tasks: list[asyncio.Task] = []

        for i, config in enumerate(world_configs):
            channel = Channel()
            db_path = os.path.join(db_dir, f"world_{i}_{config.name}.db")
            platform = ConfigurablePlatform(
                platform_config=config,
                db_path=db_path,
                channel=channel,
            )
            self.worlds.append(platform)
            self._channels.append(channel)

    async def start(self):
        """Start all world platform loops in background."""
        for platform in self.worlds:
            task = asyncio.create_task(platform.running())
            self._platform_tasks.append(task)

    async def step(self, actions: dict[int, list[tuple[int, ManualAction]]] | None = None) -> dict:
        """Execute one simulation round.

        Args:
            actions: Dict mapping world_index -> list of (agent_id, ManualAction) tuples

        Returns:
            Dict of results per world
        """
        # Tick pressure
        self.pressure_engine.tick()
        self.current_round += 1

        results: dict[int, list] = {}

        if actions:
            for world_idx, agent_actions in actions.items():
                if world_idx >= len(self.worlds):
                    continue
                channel = self._channels[world_idx]
                world_results = []

                for agent_id, action in agent_actions:
                    if isinstance(action, ManualAction):
                        # Build message from action args
                        params = action.action_args
                        if params:
                            message = tuple(params.values())
                        else:
                            message = None

                        msg_id = await channel.write_to_receive_queue(
                            (agent_id, message, action.action_type)
                        )
                        response = await channel.read_from_send_queue(msg_id)
                        world_results.append(response[2])

                results[world_idx] = world_results

        return results

    async def stop(self):
        """Stop all worlds."""
        for channel in self._channels:
            await channel.write_to_receive_queue((0, None, "exit"))
        for task in self._platform_tasks:
            await task
        self._platform_tasks.clear()

    def close(self):
        """Close all database connections (sync cleanup)."""
        for platform in self.worlds:
            try:
                platform.db.close()
            except Exception:
                pass

    def get_pressure_text(self, role: str) -> str:
        """Get formatted pressure text for an agent role."""
        return self.pressure_engine.format_for_prompt(role)
```

- [ ] **Step 3: Run tests, commit**

```bash
uv run pytest tests/test_crucible_env.py -v
git add src/crucible/environment/ tests/test_crucible_env.py
git commit -m "feat: add CrucibleEnv multi-world orchestrator with pressure"
```

---

### Task 6: Update Exports and Full Suite

**Files:**
- Modify: `src/crucible/agent/__init__.py`
- Modify: `src/crucible/visibility/__init__.py`
- Modify: `src/crucible/environment/__init__.py`
- Modify: `src/crucible/__init__.py`

- [ ] **Step 1: Update all __init__.py**

`src/crucible/agent/__init__.py`:
```python
"""Agent layer for Crucible."""
from .user_info import AgentInfo
from .environment import ConfigurableEnvironment
```

`src/crucible/environment/__init__.py`:
```python
"""Simulation environment for Crucible."""
from .env import CrucibleEnv
from .env_action import ManualAction, LLMAction
```

Add to `src/crucible/__init__.py`:
```python
from .agent import AgentInfo, ConfigurableEnvironment
from .environment import CrucibleEnv, ManualAction, LLMAction
from .visibility import VisibilityStrategy
```

- [ ] **Step 2: Run full test suite**

```bash
uv run pytest tests/ -v
```
Expected: ~47+ tests all passing

- [ ] **Step 3: Verify imports**

```bash
uv run python -c "from crucible import CrucibleEnv, AgentInfo, ConfigurableEnvironment, ManualAction, LLMAction, VisibilityStrategy; print('Phase 3 OK')"
```

- [ ] **Step 4: Commit and push**

```bash
git add src/crucible/ tests/
git commit -m "feat: complete Phase 3 - agent layer, visibility, CrucibleEnv"
git push origin main
```

---

## Phase 3 Completion Checklist

- [ ] AgentInfo renders Jinja2 system prompts from profile data
- [ ] ConfigurableEnvironment renders observations with pressure injection
- [ ] ChronologicalStrategy sorts items newest-first with limit
- [ ] CrucibleEnv creates multiple worlds from config
- [ ] CrucibleEnv.step() ticks pressure and executes manual actions
- [ ] Pressure text available per role via env.get_pressure_text()
- [ ] All tests pass (~47+)
- [ ] Pushed to `raxITlabs/crucible`

**Next:** Phase 4 — Wire into MiroFish-IR-Simulation, run NovaPay end-to-end
