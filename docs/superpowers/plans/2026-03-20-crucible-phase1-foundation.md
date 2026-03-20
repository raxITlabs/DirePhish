# Crucible Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork OASIS into `raxITlabs/crucible`, set up the project structure, build the YAML config system (Pydantic models + loader + registry), create the PressureEngine, and write builtin channel/preset YAML configs. At the end of this phase, configs load and validate correctly, and the pressure engine ticks.

**Architecture:** Fork OASIS, restructure into `src/crucible/` layout, add config layer on top. OASIS source files are copied and reorganized (not imported as a dependency). New config system uses Pydantic v2 for validation, PyYAML for loading, Jinja2 for templates.

**Tech Stack:** Python 3.12, UV, Pydantic v2, PyYAML, Jinja2, pytest

**Spec:** `docs/superpowers/specs/2026-03-20-crucible-design.md`

**Note:** This is Phase 1 of 4. Phases 2-4 (dynamic actions, platform, agent layer, integration) get their own plans after Phase 1 is complete and tested.

---

## File Structure

### New Files (Phase 1)

```
raxITlabs/crucible/
├── pyproject.toml                           # Package config
├── src/crucible/
│   ├── __init__.py                          # Public API
│   ├── config/
│   │   ├── __init__.py
│   │   ├── enterprise_config.py             # EnterpriseConfig, OrgConfig Pydantic models
│   │   ├── platform_config.py               # PlatformConfig, ActionConfig, VisibilityConfig models
│   │   ├── pressure_config.py               # PressureConfig models
│   │   └── loader.py                        # YAML loader + validator
│   ├── registry.py                          # PlatformRegistry singleton
│   ├── pressure/
│   │   ├── __init__.py
│   │   ├── types.py                         # ActivePressure, PressureSeverity
│   │   └── engine.py                        # PressureEngine (tick, get_for_role, format)
│   └── builtins/
│       ├── channels/
│       │   ├── slack.yaml                   # Slack channel config
│       │   └── email.yaml                   # Email channel config
│       └── presets/
│           └── cybersecurity_ir.yaml        # IR enterprise preset
├── tests/
│   ├── __init__.py
│   ├── test_config_loading.py               # Config YAML → Pydantic validation
│   ├── test_registry.py                     # Platform registry load/get
│   └── test_pressure_engine.py              # Pressure tick/format/role filtering
```

### Copied from OASIS (reorganized, Phase 2+)
These files will be copied in Phase 2. Phase 1 does NOT touch OASIS source — it only builds the config + pressure layer.

---

### Task 1: Create Crucible Repo and Project Structure

**Files:**
- Create: `pyproject.toml`
- Create: `src/crucible/__init__.py`
- Create: `src/crucible/config/__init__.py`
- Create: `src/crucible/pressure/__init__.py`
- Create: `tests/__init__.py`

- [ ] **Step 1: Clone OASIS and create the crucible repo**

```bash
cd /Users/adeshgairola/Documents/raxIT/code/testing-folder
git clone https://github.com/camel-ai/oasis.git crucible
cd crucible
git remote remove origin
```

- [ ] **Step 2: Create private repo on GitHub**

```bash
gh repo create raxITlabs/crucible --private --description "Crucible - Configurable Enterprise Simulation Engine"
git remote add origin https://github.com/raxITlabs/crucible.git
```

- [ ] **Step 3: Create pyproject.toml**

```toml
[project]
name = "crucible-sim"
version = "0.1.0"
description = "Crucible - Configurable Enterprise Simulation Engine"
requires-python = ">=3.11"
license = { text = "AGPL-3.0" }
authors = [{ name = "raxIT Labs" }]

dependencies = [
    "pydantic>=2.0.0",
    "pyyaml>=6.0.0",
    "jinja2>=3.1.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.23.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/crucible"]

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
```

- [ ] **Step 4: Create package init files**

`src/crucible/__init__.py`:
```python
"""Crucible - Configurable Enterprise Simulation Engine."""
__version__ = "0.1.0"
```

`src/crucible/config/__init__.py`:
```python
"""Configuration models and loaders for Crucible."""
from .enterprise_config import EnterpriseConfig
from .platform_config import PlatformConfig, ActionConfig
from .pressure_config import PressureConfig
from .loader import load_enterprise_config, load_platform_config
```

`src/crucible/pressure/__init__.py`:
```python
"""Business pressure simulation engine."""
from .engine import PressureEngine
from .types import ActivePressure
```

`tests/__init__.py`: empty file.

- [ ] **Step 5: Install dependencies and verify**

```bash
uv sync
uv run pytest --co  # Should collect 0 tests (no test files yet)
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: initialize crucible project structure with pyproject.toml"
git push origin main
```

---

### Task 2: Platform Config Pydantic Models

**Files:**
- Create: `src/crucible/config/platform_config.py`
- Create: `tests/test_config_loading.py`

- [ ] **Step 1: Write failing test for PlatformConfig**

`tests/test_config_loading.py`:
```python
import pytest
from crucible.config.platform_config import (
    PlatformConfig, ActionConfig, ParamConfig, VisibilityConfig
)


def test_action_config_creation():
    action = ActionConfig(
        name="send_message",
        description="Send a message to a channel",
        parameters=[
            ParamConfig(name="channel_name", type="string", description="Target channel"),
            ParamConfig(name="content", type="string", description="Message content"),
        ],
        category="communication",
    )
    assert action.name == "send_message"
    assert len(action.parameters) == 2


def test_platform_config_creation():
    config = PlatformConfig(
        name="slack",
        display_name="Slack Workspace",
        system_prompt_template="You are {{ name }}, a {{ role }}.",
        observation_template="You see: {{ messages }}",
        actions=[
            ActionConfig(
                name="send_message",
                description="Send a message",
                parameters=[
                    ParamConfig(name="content", type="string", description="Message"),
                ],
            ),
            ActionConfig(
                name="do_nothing",
                description="No action",
                parameters=[],
            ),
        ],
        visibility=VisibilityConfig(strategy="chronological"),
    )
    assert config.name == "slack"
    assert len(config.actions) == 2
    assert config.visibility.strategy == "chronological"


def test_platform_config_requires_at_least_one_action():
    with pytest.raises(Exception):
        PlatformConfig(
            name="empty",
            display_name="Empty",
            system_prompt_template="",
            observation_template="",
            actions=[],
            visibility=VisibilityConfig(strategy="chronological"),
        )
```

- [ ] **Step 2: Run test to verify it fails**

```bash
uv run pytest tests/test_config_loading.py -v
```
Expected: FAIL — `crucible.config.platform_config` does not exist.

- [ ] **Step 3: Implement PlatformConfig models**

`src/crucible/config/platform_config.py`:
```python
"""Platform configuration models for Crucible worlds."""

from typing import Optional
from pydantic import BaseModel, field_validator


class ParamConfig(BaseModel):
    """Configuration for a single action parameter."""
    name: str
    type: str  # "string", "integer", "boolean"
    description: str = ""


class ActionConfig(BaseModel):
    """Configuration for a single agent action."""
    name: str
    description: str
    parameters: list[ParamConfig] = []
    category: str = "default"


class VisibilityConfig(BaseModel):
    """Visibility/feed strategy configuration."""
    strategy: str  # "chronological", "priority", "assignment", "random"
    config: dict = {}


class SchemaColumnConfig(BaseModel):
    """Database column definition."""
    name: str
    type: str  # "INTEGER", "TEXT", "DATETIME", "BOOLEAN"
    primary_key: bool = False
    autoincrement: bool = False
    nullable: bool = True
    unique: bool = False
    default: Optional[str] = None
    foreign_key: Optional[str] = None


class SchemaTableConfig(BaseModel):
    """Database table definition."""
    name: str
    columns: list[SchemaColumnConfig]


class SchemaConfig(BaseModel):
    """Full database schema configuration."""
    tables: list[SchemaTableConfig] = []


class AgentProfileField(BaseModel):
    """Field definition for agent profiles."""
    name: str
    type: str = "string"
    required: bool = False
    enum: Optional[list[str]] = None


class PlatformConfig(BaseModel):
    """Complete configuration for a Crucible world/platform."""
    name: str
    display_name: str
    system_prompt_template: str
    observation_template: str = ""
    observation_actions: list[str] = []
    actions: list[ActionConfig]
    schema: SchemaConfig = SchemaConfig()
    visibility: VisibilityConfig
    agent_profile_fields: list[AgentProfileField] = []

    @field_validator("actions")
    @classmethod
    def must_have_actions(cls, v):
        if not v:
            raise ValueError("Platform must define at least one action")
        return v
```

- [ ] **Step 4: Run tests**

```bash
uv run pytest tests/test_config_loading.py -v
```
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/crucible/config/platform_config.py tests/test_config_loading.py
git commit -m "feat: add PlatformConfig Pydantic models with validation"
```

---

### Task 3: Pressure Config and Enterprise Config Models

**Files:**
- Create: `src/crucible/config/pressure_config.py`
- Create: `src/crucible/config/enterprise_config.py`
- Modify: `tests/test_config_loading.py`

- [ ] **Step 1: Write failing tests**

Append to `tests/test_config_loading.py`:
```python
from crucible.config.pressure_config import PressureConfig
from crucible.config.enterprise_config import EnterpriseConfig, OrgConfig, WorldRef


def test_pressure_config_countdown():
    p = PressureConfig(
        name="GDPR 72-hour clock",
        type="countdown",
        hours=72,
        affects_roles=["legal_counsel", "ciso"],
        severity_at_50pct="high",
        severity_at_25pct="critical",
    )
    assert p.type == "countdown"
    assert p.hours == 72


def test_pressure_config_threshold():
    p = PressureConfig(
        name="Payment queue",
        type="threshold",
        value=4200000,
        unit="USD",
        affects_roles=["vp_engineering"],
    )
    assert p.value == 4200000


def test_enterprise_config():
    config = EnterpriseConfig(
        name="NovaPay Inc.",
        industry="fintech",
        size="medium",
        worlds=[
            WorldRef(type="slack", name="IR War Room"),
            WorldRef(type="email", name="Corporate Email"),
        ],
        pressures=[
            PressureConfig(
                name="GDPR clock",
                type="countdown",
                hours=72,
                affects_roles=["legal"],
            ),
        ],
        org=OrgConfig(
            departments=["security", "engineering"],
            reporting_lines={"ir_lead": "ciso", "ciso": "ceo"},
        ),
    )
    assert config.name == "NovaPay Inc."
    assert len(config.worlds) == 2
    assert len(config.pressures) == 1
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_config_loading.py -v
```

- [ ] **Step 3: Implement PressureConfig**

`src/crucible/config/pressure_config.py`:
```python
"""Pressure configuration models."""

from typing import Optional
from pydantic import BaseModel


class PressureConfig(BaseModel):
    """Configuration for a single business pressure."""
    name: str
    type: str  # "countdown", "deadline", "threshold", "triggered"
    affects_roles: list[str] = []

    # For countdown type
    hours: Optional[float] = None

    # For deadline type
    hours_until: Optional[float] = None

    # For threshold type
    value: Optional[float] = None
    unit: Optional[str] = None

    # For triggered type
    triggered_by: Optional[str] = None

    # Severity escalation
    severity_at_50pct: Optional[str] = None  # severity when 50% time remaining
    severity_at_25pct: Optional[str] = None  # severity when 25% time remaining
```

- [ ] **Step 4: Implement EnterpriseConfig**

`src/crucible/config/enterprise_config.py`:
```python
"""Enterprise configuration models."""

from typing import Optional
from pydantic import BaseModel

from .pressure_config import PressureConfig


class WorldRef(BaseModel):
    """Reference to a world/platform type."""
    type: str       # "slack", "email", "siem", etc.
    name: str       # Display name for this instance


class OrgConfig(BaseModel):
    """Organization structure configuration."""
    departments: list[str] = []
    reporting_lines: dict[str, str] = {}  # role -> reports_to


class EnterpriseConfig(BaseModel):
    """Complete enterprise simulation configuration."""
    name: str
    industry: str = ""
    size: str = "medium"  # small, medium, large
    preset: Optional[str] = None

    worlds: list[WorldRef] = []
    pressures: list[PressureConfig] = []
    org: OrgConfig = OrgConfig()
```

- [ ] **Step 5: Run tests**

```bash
uv run pytest tests/test_config_loading.py -v
```
Expected: 6 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/crucible/config/pressure_config.py src/crucible/config/enterprise_config.py tests/test_config_loading.py
git commit -m "feat: add PressureConfig and EnterpriseConfig Pydantic models"
```

---

### Task 4: YAML Loader

**Files:**
- Create: `src/crucible/config/loader.py`
- Modify: `tests/test_config_loading.py`

- [ ] **Step 1: Write failing test**

Append to `tests/test_config_loading.py`:
```python
import tempfile
import os
from crucible.config.loader import load_platform_config, load_enterprise_config


def test_load_platform_config_from_yaml(tmp_path):
    yaml_content = """
platform:
  name: test_slack
  display_name: "Test Slack"
  system_prompt_template: "You are {{ name }}."
  observation_template: "You see messages."
  actions:
    - name: send_message
      description: "Send a message"
      parameters:
        - name: content
          type: string
          description: "The message"
    - name: do_nothing
      description: "No action"
      parameters: []
  visibility:
    strategy: chronological
"""
    yaml_file = tmp_path / "test_slack.yaml"
    yaml_file.write_text(yaml_content)

    config = load_platform_config(str(yaml_file))
    assert config.name == "test_slack"
    assert len(config.actions) == 2


def test_load_enterprise_config_from_yaml(tmp_path):
    yaml_content = """
enterprise:
  name: "TestCorp"
  industry: fintech
  size: small
  worlds:
    - type: slack
      name: "War Room"
  pressures:
    - name: "Deadline"
      type: countdown
      hours: 24
      affects_roles: [manager]
  org:
    departments: [engineering]
    reporting_lines:
      engineer: manager
"""
    yaml_file = tmp_path / "test_enterprise.yaml"
    yaml_file.write_text(yaml_content)

    config = load_enterprise_config(str(yaml_file))
    assert config.name == "TestCorp"
    assert len(config.worlds) == 1
    assert config.pressures[0].hours == 24
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_config_loading.py::test_load_platform_config_from_yaml -v
```

- [ ] **Step 3: Implement loader**

`src/crucible/config/loader.py`:
```python
"""YAML configuration loader for Crucible."""

import yaml
from pathlib import Path

from .platform_config import PlatformConfig
from .enterprise_config import EnterpriseConfig


def load_platform_config(path: str) -> PlatformConfig:
    """Load a PlatformConfig from a YAML file."""
    with open(path) as f:
        data = yaml.safe_load(f)

    platform_data = data.get("platform", data)
    return PlatformConfig(**platform_data)


def load_enterprise_config(path: str) -> EnterpriseConfig:
    """Load an EnterpriseConfig from a YAML file."""
    with open(path) as f:
        data = yaml.safe_load(f)

    enterprise_data = data.get("enterprise", data)
    return EnterpriseConfig(**enterprise_data)
```

- [ ] **Step 4: Run tests**

```bash
uv run pytest tests/test_config_loading.py -v
```
Expected: 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/crucible/config/loader.py tests/test_config_loading.py
git commit -m "feat: add YAML config loader for platform and enterprise configs"
```

---

### Task 5: Platform Registry

**Files:**
- Create: `src/crucible/registry.py`
- Create: `tests/test_registry.py`

- [ ] **Step 1: Write failing test**

`tests/test_registry.py`:
```python
import pytest
from crucible.registry import PlatformRegistry
from crucible.config.platform_config import (
    PlatformConfig, ActionConfig, VisibilityConfig
)


@pytest.fixture(autouse=True)
def clear_registry():
    """Clear registry between tests."""
    PlatformRegistry._platforms.clear()
    yield
    PlatformRegistry._platforms.clear()


def _make_config(name: str) -> PlatformConfig:
    return PlatformConfig(
        name=name,
        display_name=name.title(),
        system_prompt_template="You are {{ name }}.",
        observation_template="",
        actions=[ActionConfig(name="do_nothing", description="No action")],
        visibility=VisibilityConfig(strategy="chronological"),
    )


def test_register_and_get():
    config = _make_config("slack")
    PlatformRegistry.register(config)
    assert PlatformRegistry.get("slack").name == "slack"


def test_get_unknown_raises():
    with pytest.raises(KeyError):
        PlatformRegistry.get("nonexistent")


def test_load_from_yaml(tmp_path):
    yaml_content = """
platform:
  name: test_platform
  display_name: "Test"
  system_prompt_template: "Hello"
  actions:
    - name: do_nothing
      description: "Nothing"
  visibility:
    strategy: chronological
"""
    f = tmp_path / "test.yaml"
    f.write_text(yaml_content)

    PlatformRegistry.load_from_yaml(str(f))
    assert PlatformRegistry.get("test_platform").display_name == "Test"


def test_list_platforms():
    PlatformRegistry.register(_make_config("slack"))
    PlatformRegistry.register(_make_config("email"))
    names = PlatformRegistry.list()
    assert set(names) == {"slack", "email"}
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_registry.py -v
```

- [ ] **Step 3: Implement registry**

`src/crucible/registry.py`:
```python
"""Platform registry for Crucible."""

from .config.platform_config import PlatformConfig
from .config.loader import load_platform_config


class PlatformRegistry:
    """Singleton registry of available platform configurations."""

    _platforms: dict[str, PlatformConfig] = {}

    @classmethod
    def register(cls, config: PlatformConfig) -> None:
        """Register a platform configuration."""
        cls._platforms[config.name] = config

    @classmethod
    def get(cls, name: str) -> PlatformConfig:
        """Get a registered platform by name."""
        if name not in cls._platforms:
            raise KeyError(f"Platform '{name}' not registered. Available: {list(cls._platforms.keys())}")
        return cls._platforms[name]

    @classmethod
    def load_from_yaml(cls, path: str) -> PlatformConfig:
        """Load a platform config from YAML and register it."""
        config = load_platform_config(path)
        cls.register(config)
        return config

    @classmethod
    def list(cls) -> list[str]:
        """List all registered platform names."""
        return list(cls._platforms.keys())
```

- [ ] **Step 4: Run tests**

```bash
uv run pytest tests/test_registry.py -v
```
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/crucible/registry.py tests/test_registry.py
git commit -m "feat: add PlatformRegistry for loading and retrieving platform configs"
```

---

### Task 6: Pressure Engine

**Files:**
- Create: `src/crucible/pressure/types.py`
- Create: `src/crucible/pressure/engine.py`
- Create: `tests/test_pressure_engine.py`

- [ ] **Step 1: Write failing tests**

`tests/test_pressure_engine.py`:
```python
import pytest
from crucible.pressure.engine import PressureEngine
from crucible.pressure.types import ActivePressure
from crucible.config.pressure_config import PressureConfig


def _gdpr_config():
    return PressureConfig(
        name="GDPR 72-hour clock",
        type="countdown",
        hours=72,
        affects_roles=["legal", "ciso"],
        severity_at_50pct="high",
        severity_at_25pct="critical",
    )


def _payment_config():
    return PressureConfig(
        name="Payment queue",
        type="threshold",
        value=4200000,
        unit="USD",
        affects_roles=["vp_eng"],
    )


def _retainer_config():
    return PressureConfig(
        name="CrowdStrike SLA",
        type="countdown",
        hours=4,
        triggered_by="retainer_activated",
        affects_roles=["ciso"],
    )


def test_countdown_ticks_down():
    engine = PressureEngine([_gdpr_config()], hours_per_round=1.0)
    engine.tick()
    pressures = engine.get_all_active()
    assert len(pressures) == 1
    assert pressures[0].remaining_hours == 71.0


def test_countdown_severity_escalation():
    engine = PressureEngine([_gdpr_config()], hours_per_round=1.0)
    # Tick 37 times → 35 hours remaining (< 50%)
    for _ in range(37):
        engine.tick()
    p = engine.get_all_active()[0]
    assert p.severity == "high"

    # Tick 18 more → 17 hours remaining (< 25%)
    for _ in range(18):
        engine.tick()
    p = engine.get_all_active()[0]
    assert p.severity == "critical"


def test_role_filtering():
    engine = PressureEngine([_gdpr_config(), _payment_config()], hours_per_round=1.0)
    legal_pressures = engine.get_for_role("legal")
    assert len(legal_pressures) == 1
    assert legal_pressures[0].name == "GDPR 72-hour clock"

    vp_pressures = engine.get_for_role("vp_eng")
    assert len(vp_pressures) == 1
    assert vp_pressures[0].name == "Payment queue"


def test_triggered_pressure_not_active_until_triggered():
    engine = PressureEngine([_retainer_config()], hours_per_round=1.0)
    assert len(engine.get_all_active()) == 0

    engine.trigger("retainer_activated")
    assert len(engine.get_all_active()) == 1


def test_triggered_pressure_ticks_after_trigger():
    engine = PressureEngine([_retainer_config()], hours_per_round=1.0)
    engine.trigger("retainer_activated")
    engine.tick()
    p = engine.get_all_active()[0]
    assert p.remaining_hours == 3.0


def test_format_for_prompt():
    engine = PressureEngine([_gdpr_config()], hours_per_round=1.0)
    engine.tick()  # 71 hours remaining
    text = engine.format_for_prompt("legal")
    assert "GDPR 72-hour clock" in text
    assert "71" in text


def test_format_empty_for_unaffected_role():
    engine = PressureEngine([_gdpr_config()], hours_per_round=1.0)
    text = engine.format_for_prompt("engineer")
    assert text == ""
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_pressure_engine.py -v
```

- [ ] **Step 3: Implement pressure types**

`src/crucible/pressure/types.py`:
```python
"""Pressure runtime types."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class ActivePressure:
    """A pressure that is currently active in the simulation."""
    name: str
    type: str
    affects_roles: list[str]
    remaining_hours: Optional[float] = None
    value: Optional[float] = None
    unit: Optional[str] = None
    severity: str = "medium"
    triggered: bool = True  # False for triggered-type until activated
```

- [ ] **Step 4: Implement PressureEngine**

`src/crucible/pressure/engine.py`:
```python
"""Business pressure simulation engine."""

from ..config.pressure_config import PressureConfig
from .types import ActivePressure


class PressureEngine:
    """Manages business pressures that tick each simulation round."""

    def __init__(self, configs: list[PressureConfig], hours_per_round: float = 1.0):
        self.hours_per_round = hours_per_round
        self._pressures: list[ActivePressure] = []
        self._configs: dict[str, PressureConfig] = {}

        for config in configs:
            self._configs[config.name] = config
            if config.type == "triggered" or config.triggered_by:
                # Don't activate until triggered
                self._pressures.append(ActivePressure(
                    name=config.name,
                    type=config.type,
                    affects_roles=config.affects_roles,
                    remaining_hours=config.hours,
                    value=config.value,
                    unit=config.unit,
                    triggered=False,
                ))
            elif config.type == "countdown":
                self._pressures.append(ActivePressure(
                    name=config.name,
                    type="countdown",
                    affects_roles=config.affects_roles,
                    remaining_hours=config.hours,
                ))
            elif config.type == "deadline":
                self._pressures.append(ActivePressure(
                    name=config.name,
                    type="deadline",
                    affects_roles=config.affects_roles,
                    remaining_hours=config.hours_until,
                ))
            elif config.type == "threshold":
                self._pressures.append(ActivePressure(
                    name=config.name,
                    type="threshold",
                    affects_roles=config.affects_roles,
                    value=config.value,
                    unit=config.unit,
                ))

    def tick(self) -> None:
        """Advance all active pressures by one round."""
        for p in self._pressures:
            if not p.triggered:
                continue
            if p.remaining_hours is not None:
                p.remaining_hours = max(0, p.remaining_hours - self.hours_per_round)
                self._update_severity(p)

    def trigger(self, event_name: str) -> None:
        """Activate a triggered pressure."""
        for p in self._pressures:
            config = self._configs.get(p.name)
            if config and config.triggered_by == event_name:
                p.triggered = True

    def get_all_active(self) -> list[ActivePressure]:
        """Return all currently active pressures."""
        return [p for p in self._pressures if p.triggered]

    def get_for_role(self, role: str) -> list[ActivePressure]:
        """Return active pressures that affect a specific role."""
        return [p for p in self._pressures if p.triggered and role in p.affects_roles]

    def format_for_prompt(self, role: str) -> str:
        """Format active pressures as text for an agent's observation prompt."""
        role_pressures = self.get_for_role(role)
        if not role_pressures:
            return ""

        lines = ["⚠️ ACTIVE BUSINESS PRESSURES:"]
        for p in role_pressures:
            if p.remaining_hours is not None:
                lines.append(f"- {p.name}: {p.remaining_hours:.0f} hours remaining [{p.severity.upper()}]")
            elif p.value is not None:
                unit = p.unit or ""
                lines.append(f"- {p.name}: {p.value:,.0f} {unit} [{p.severity.upper()}]")
            else:
                lines.append(f"- {p.name} [{p.severity.upper()}]")
        return "\n".join(lines)

    def _update_severity(self, pressure: ActivePressure) -> None:
        """Update severity based on remaining time."""
        config = self._configs.get(pressure.name)
        if not config or pressure.remaining_hours is None:
            return

        total = config.hours or config.hours_until or 0
        if total == 0:
            return

        pct_remaining = pressure.remaining_hours / total
        if pct_remaining <= 0.25 and config.severity_at_25pct:
            pressure.severity = config.severity_at_25pct
        elif pct_remaining <= 0.50 and config.severity_at_50pct:
            pressure.severity = config.severity_at_50pct
```

- [ ] **Step 5: Run tests**

```bash
uv run pytest tests/test_pressure_engine.py -v
```
Expected: 7 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/crucible/pressure/ tests/test_pressure_engine.py
git commit -m "feat: add PressureEngine with countdown, threshold, triggered types"
```

---

### Task 7: Builtin YAML Configs

**Files:**
- Create: `src/crucible/builtins/channels/slack.yaml`
- Create: `src/crucible/builtins/channels/email.yaml`
- Create: `src/crucible/builtins/presets/cybersecurity_ir.yaml`

- [ ] **Step 1: Write test that loads builtin configs**

Append to `tests/test_config_loading.py`:
```python
from pathlib import Path

BUILTINS_DIR = Path(__file__).parent.parent / "src" / "crucible" / "builtins"


def test_load_builtin_slack():
    config = load_platform_config(str(BUILTINS_DIR / "channels" / "slack.yaml"))
    assert config.name == "slack"
    assert any(a.name == "send_message" for a in config.actions)
    assert any(a.name == "do_nothing" for a in config.actions)


def test_load_builtin_email():
    config = load_platform_config(str(BUILTINS_DIR / "channels" / "email.yaml"))
    assert config.name == "email"
    assert any(a.name == "send_email" for a in config.actions)


def test_load_builtin_ir_preset():
    config = load_enterprise_config(str(BUILTINS_DIR / "presets" / "cybersecurity_ir.yaml"))
    assert config.industry == "cybersecurity"
    assert len(config.worlds) >= 2
    assert len(config.pressures) >= 1
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_config_loading.py::test_load_builtin_slack -v
```

- [ ] **Step 3: Create slack.yaml**

`src/crucible/builtins/channels/slack.yaml`:
```yaml
platform:
  name: slack
  display_name: "Slack Workspace"

  system_prompt_template: |
    # OBJECTIVE
    You are {{ name }}, serving as {{ role }} in a Slack workspace.
    You communicate in channels and direct messages with your team.

    # YOUR PROFILE
    {{ persona }}

    # BEHAVIOR GUIDELINES
    - Respond to messages relevant to your expertise and role
    - Use @mentions when you need someone's specific attention
    - Keep messages concise and professional
    - React with emoji to acknowledge messages when appropriate
    - Escalate urgent matters by creating new threads

    # RESPONSE METHOD
    Perform actions by tool calling.

  observation_template: |
    You check Slack and see:
    {% if messages %}
    Recent messages:
    {% for msg in messages %}
    #{{ msg.channel }} | {{ msg.author }} ({{ msg.role }}): {{ msg.content }}
    {% endfor %}
    {% else %}
    No new messages.
    {% endif %}
    {% if mentions %}
    You were @mentioned:
    {% for m in mentions %}
    {{ m.author }} in #{{ m.channel }}: {{ m.content }}
    {% endfor %}
    {% endif %}

  observation_actions:
    - refresh_channels
    - check_mentions

  actions:
    - name: send_message
      description: "Send a message to a Slack channel"
      parameters:
        - { name: channel_name, type: string, description: "Channel to post in (e.g., #ir-warroom, #general)" }
        - { name: content, type: string, description: "The message content" }
      category: communication

    - name: reply_in_thread
      description: "Reply to a specific message in a thread"
      parameters:
        - { name: parent_message_id, type: integer, description: "ID of the message to reply to" }
        - { name: content, type: string, description: "The reply content" }
      category: communication

    - name: react
      description: "Add an emoji reaction to a message"
      parameters:
        - { name: message_id, type: integer, description: "The message to react to" }
        - { name: emoji, type: string, description: "Emoji name (e.g., thumbsup, eyes, warning)" }
      category: engagement

    - name: mention_user
      description: "Send a message that @mentions a specific user to get their attention"
      parameters:
        - { name: channel_name, type: string, description: "Channel to post in" }
        - { name: target_user, type: string, description: "Username to mention" }
        - { name: content, type: string, description: "Message content" }
      category: communication

    - name: create_channel
      description: "Create a new Slack channel for a specific topic"
      parameters:
        - { name: channel_name, type: string, description: "Name for the new channel" }
        - { name: purpose, type: string, description: "Channel purpose" }
      category: administration

    - name: do_nothing
      description: "No action needed right now - continue monitoring"
      parameters: []
      category: meta

  visibility:
    strategy: chronological
    config:
      per_channel_limit: 10
      prioritize_mentions: true
```

- [ ] **Step 4: Create email.yaml**

`src/crucible/builtins/channels/email.yaml`:
```yaml
platform:
  name: email
  display_name: "Corporate Email"

  system_prompt_template: |
    # OBJECTIVE
    You are {{ name }}, serving as {{ role }}. You use email for formal communications,
    notifications, and documentation.

    # YOUR PROFILE
    {{ persona }}

    # EMAIL GUIDELINES
    - Use email for formal communications, approvals, and notifications
    - CC relevant stakeholders on important decisions
    - Keep subject lines clear and specific
    - Email is for record-keeping — be precise and factual
    - Forward relevant information to people who need to know

    # RESPONSE METHOD
    Perform actions by tool calling.

  observation_template: |
    Your inbox:
    {% if emails %}
    {% for email in emails %}
    From: {{ email.sender }} | Subject: {{ email.subject }}
    {{ email.body[:200] }}
    {% endfor %}
    {% else %}
    No new emails.
    {% endif %}

  observation_actions:
    - check_inbox

  actions:
    - name: send_email
      description: "Send a formal email"
      parameters:
        - { name: to, type: string, description: "Recipient (username or role)" }
        - { name: subject, type: string, description: "Email subject line" }
        - { name: body, type: string, description: "Email body" }
        - { name: cc, type: string, description: "CC recipients (comma-separated, optional)" }
      category: communication

    - name: reply_email
      description: "Reply to an email"
      parameters:
        - { name: email_id, type: integer, description: "Email to reply to" }
        - { name: body, type: string, description: "Reply content" }
      category: communication

    - name: forward_email
      description: "Forward an email to another person"
      parameters:
        - { name: email_id, type: integer, description: "Email to forward" }
        - { name: to, type: string, description: "Recipient" }
        - { name: note, type: string, description: "Forwarding note" }
      category: communication

    - name: do_nothing
      description: "No email action needed right now"
      parameters: []
      category: meta

  visibility:
    strategy: org_hierarchy
    config:
      show_direct_reports: true
      show_cc: true
```

- [ ] **Step 5: Create cybersecurity_ir.yaml preset**

`src/crucible/builtins/presets/cybersecurity_ir.yaml`:
```yaml
enterprise:
  name: "Cybersecurity IR Template"
  industry: cybersecurity
  size: medium

  worlds:
    - type: slack
      name: "IR War Room"
    - type: email
      name: "Corporate Email"

  pressures:
    - name: "GDPR 72-hour notification deadline"
      type: countdown
      hours: 72
      affects_roles: [legal_counsel, ciso, compliance_manager]
      severity_at_50pct: high
      severity_at_25pct: critical

    - name: "Cyber insurance 48-hour notification"
      type: countdown
      hours: 48
      affects_roles: [ciso, legal_counsel, cfo]
      severity_at_50pct: high
      severity_at_25pct: critical

    - name: "Evidence preservation window"
      type: countdown
      hours: 24
      affects_roles: [ir_lead, forensics_lead, legal_counsel]
      severity_at_50pct: high
      severity_at_25pct: critical

    - name: "Active data exfiltration"
      type: threshold
      value: 0
      unit: "records exfiltrated"
      affects_roles: [ir_lead, soc_analyst, ciso]

  org:
    departments: [security, engineering, legal, executive, communications]
    reporting_lines:
      soc_analyst: ir_lead
      security_engineer: ir_lead
      ir_lead: ciso
      forensics_lead: ciso
      ciso: ceo
      vp_engineering: cto
      platform_engineer: vp_engineering
      backend_engineer: vp_engineering
      cto: ceo
      legal_counsel: ceo
      compliance_manager: legal_counsel
      vp_communications: ceo
      cfo: ceo
```

- [ ] **Step 6: Create builtins directory __init__ files and run tests**

```bash
mkdir -p src/crucible/builtins/channels src/crucible/builtins/presets
touch src/crucible/builtins/__init__.py
uv run pytest tests/test_config_loading.py -v
```
Expected: 11 PASS.

- [ ] **Step 7: Commit**

```bash
git add src/crucible/builtins/ tests/test_config_loading.py
git commit -m "feat: add builtin Slack, Email channel configs and Cybersecurity IR preset"
```

---

### Task 8: Update config __init__.py and run full test suite

**Files:**
- Modify: `src/crucible/config/__init__.py`
- Modify: `src/crucible/__init__.py`

- [ ] **Step 1: Update config __init__ with all exports**

`src/crucible/config/__init__.py`:
```python
"""Configuration models and loaders for Crucible."""
from .enterprise_config import EnterpriseConfig, OrgConfig, WorldRef
from .platform_config import (
    PlatformConfig, ActionConfig, ParamConfig,
    VisibilityConfig, SchemaConfig, SchemaTableConfig, SchemaColumnConfig,
    AgentProfileField,
)
from .pressure_config import PressureConfig
from .loader import load_enterprise_config, load_platform_config

__all__ = [
    "EnterpriseConfig", "OrgConfig", "WorldRef",
    "PlatformConfig", "ActionConfig", "ParamConfig",
    "VisibilityConfig", "SchemaConfig", "SchemaTableConfig", "SchemaColumnConfig",
    "AgentProfileField",
    "PressureConfig",
    "load_enterprise_config", "load_platform_config",
]
```

- [ ] **Step 2: Update main __init__**

`src/crucible/__init__.py`:
```python
"""Crucible - Configurable Enterprise Simulation Engine.

Crucible simulates enterprises as living organisms. Define your enterprise
via YAML (org structure, communication channels, business pressures) and
Crucible spawns AI agents that communicate and make decisions under realistic
constraints.
"""
__version__ = "0.1.0"

from .config import (
    EnterpriseConfig, PlatformConfig, PressureConfig,
    load_enterprise_config, load_platform_config,
)
from .registry import PlatformRegistry
from .pressure import PressureEngine

__all__ = [
    "EnterpriseConfig", "PlatformConfig", "PressureConfig",
    "load_enterprise_config", "load_platform_config",
    "PlatformRegistry", "PressureEngine",
]
```

- [ ] **Step 3: Run full test suite**

```bash
uv run pytest tests/ -v
```
Expected: All tests PASS (11 config + 4 registry + 7 pressure = 22 total).

- [ ] **Step 4: Commit and push**

```bash
git add src/crucible/__init__.py src/crucible/config/__init__.py
git commit -m "feat: complete Phase 1 - config system, pressure engine, builtin configs"
git push origin main
```

---

## Phase 1 Completion Checklist

After all 8 tasks:

- [ ] `uv run pytest tests/ -v` — all 22 tests pass
- [ ] `uv run python -c "from crucible import PlatformRegistry, PressureEngine; print('OK')"` — imports work
- [ ] Builtin slack.yaml, email.yaml, cybersecurity_ir.yaml load without errors
- [ ] PressureEngine ticks countdown, filters by role, formats for prompt
- [ ] Repo pushed to `raxITlabs/crucible`

**Next:** Phase 2 plan (Dynamic Actions + ConfigurablePlatform + Schema Loader) — builds on this foundation to make worlds actually run.
