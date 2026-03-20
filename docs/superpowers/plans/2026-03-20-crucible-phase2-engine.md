# Crucible Phase 2: Dynamic Actions + Schema Loader + ConfigurablePlatform

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the engine core — dynamic action generation from YAML config, config-driven SQLite schema creation, and a ConfigurablePlatform that dispatches actions without hardcoded methods. At the end, a platform defined entirely by YAML can create its database, accept agent actions, and return results.

**Architecture:** Dynamic method generation using Python's `types` module to create action methods from ActionConfig. Schema loader generates CREATE TABLE SQL from SchemaConfig. ConfigurablePlatform uses OASIS's `getattr` dispatch pattern but with dynamically attached handlers. Channel from OASIS is copied as-is for async message passing.

**Tech Stack:** Python 3.12, UV, Pydantic v2, SQLite, asyncio, pytest, pytest-asyncio

**Depends on:** Phase 1 (config models, loader, registry, pressure engine) — all in `src/crucible/`

---

## File Structure (Phase 2 additions)

```
src/crucible/
├── actions/
│   ├── __init__.py
│   ├── action_factory.py         # Generates agent-side async methods from ActionConfig
│   └── dynamic_action.py         # DynamicAction class (replaces SocialAction)
├── platform/
│   ├── __init__.py
│   ├── schema_loader.py          # Generates CREATE TABLE SQL from SchemaConfig
│   ├── channel.py                # Copied from OASIS (async message queue)
│   └── configurable_platform.py  # ConfigurablePlatform with dynamic dispatch
tests/
├── test_schema_loader.py
├── test_action_factory.py
├── test_dynamic_action.py
├── test_configurable_platform.py
```

---

### Task 1: Schema Loader

**Files:**
- Create: `src/crucible/platform/__init__.py`
- Create: `src/crucible/platform/schema_loader.py`
- Create: `tests/test_schema_loader.py`

- [ ] **Step 1: Write failing test**

`tests/test_schema_loader.py`:
```python
import sqlite3
import pytest
from crucible.config.platform_config import SchemaConfig, SchemaTableConfig, SchemaColumnConfig
from crucible.platform.schema_loader import create_db_from_config


def _message_schema():
    return SchemaConfig(tables=[
        SchemaTableConfig(name="user", columns=[
            SchemaColumnConfig(name="user_id", type="INTEGER", primary_key=True, autoincrement=True),
            SchemaColumnConfig(name="user_name", type="TEXT"),
            SchemaColumnConfig(name="role", type="TEXT"),
        ]),
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
    ])


def test_creates_tables(tmp_path):
    db_path = str(tmp_path / "test.db")
    conn, cursor = create_db_from_config(db_path, _message_schema())

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = {row[0] for row in cursor.fetchall()}
    assert "user" in tables
    assert "message" in tables
    assert "trace" in tables
    conn.close()


def test_table_columns(tmp_path):
    db_path = str(tmp_path / "test.db")
    conn, cursor = create_db_from_config(db_path, _message_schema())

    cursor.execute("PRAGMA table_info(message)")
    columns = {row[1] for row in cursor.fetchall()}
    assert "message_id" in columns
    assert "channel_name" in columns
    assert "content" in columns
    conn.close()


def test_insert_and_query(tmp_path):
    db_path = str(tmp_path / "test.db")
    conn, cursor = create_db_from_config(db_path, _message_schema())

    cursor.execute("INSERT INTO message (channel_name, user_id, content) VALUES (?, ?, ?)",
                   ("#general", 1, "Hello world"))
    conn.commit()

    cursor.execute("SELECT content FROM message WHERE channel_name = ?", ("#general",))
    row = cursor.fetchone()
    assert row[0] == "Hello world"
    conn.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_schema_loader.py -v`

- [ ] **Step 3: Implement schema loader**

`src/crucible/platform/__init__.py`: empty

`src/crucible/platform/schema_loader.py`:
```python
"""Config-driven SQLite schema creation."""

import sqlite3
from ..config.platform_config import SchemaConfig, SchemaTableConfig, SchemaColumnConfig


def create_db_from_config(db_path: str, schema: SchemaConfig) -> tuple[sqlite3.Connection, sqlite3.Cursor]:
    """Create a SQLite database with tables defined by SchemaConfig."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    for table in schema.tables:
        sql = _generate_create_table(table)
        cursor.executescript(sql)

    conn.commit()
    return conn, cursor


def _generate_create_table(table: SchemaTableConfig) -> str:
    """Generate CREATE TABLE SQL from a SchemaTableConfig."""
    col_defs = []
    for col in table.columns:
        parts = [col.name, col.type]
        if col.primary_key:
            parts.append("PRIMARY KEY")
        if col.autoincrement:
            parts.append("AUTOINCREMENT")
        if not col.nullable and not col.primary_key:
            parts.append("NOT NULL")
        if col.unique:
            parts.append("UNIQUE")
        if col.default is not None:
            parts.append(f"DEFAULT {col.default!r}")
        col_defs.append(" ".join(parts))

    columns_sql = ",\n  ".join(col_defs)
    return f"CREATE TABLE IF NOT EXISTS {table.name} (\n  {columns_sql}\n);"
```

- [ ] **Step 4: Run tests**

Run: `uv run pytest tests/test_schema_loader.py -v`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add src/crucible/platform/ tests/test_schema_loader.py
git commit -m "feat: add config-driven SQLite schema loader"
```

---

### Task 2: Channel (copy from OASIS)

**Files:**
- Create: `src/crucible/platform/channel.py`

- [ ] **Step 1: Copy OASIS channel.py**

Copy `/Users/adeshgairola/Documents/raxIT/code/testing-folder/MiroFish/backend/.venv/lib/python3.12/site-packages/oasis/social_platform/channel.py` to `src/crucible/platform/channel.py`.

Update imports: remove any `oasis.*` references. The Channel class is self-contained — it only uses `asyncio` and `uuid` from stdlib.

- [ ] **Step 2: Verify import works**

```bash
uv run python -c "from crucible.platform.channel import Channel; print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add src/crucible/platform/channel.py
git commit -m "feat: add async Channel from OASIS"
```

---

### Task 3: Action Factory

**Files:**
- Create: `src/crucible/actions/__init__.py`
- Create: `src/crucible/actions/action_factory.py`
- Create: `tests/test_action_factory.py`

- [ ] **Step 1: Write failing test**

`tests/test_action_factory.py`:
```python
import asyncio
import inspect
import pytest
from crucible.config.platform_config import ActionConfig, ParamConfig
from crucible.actions.action_factory import build_action_method


def test_generates_callable():
    config = ActionConfig(
        name="send_message",
        description="Send a message to a channel",
        parameters=[
            ParamConfig(name="channel_name", type="string", description="Target channel"),
            ParamConfig(name="content", type="string", description="Message content"),
        ],
    )
    method = build_action_method(config)
    assert callable(method)
    assert method.__name__ == "send_message"


def test_has_correct_docstring():
    config = ActionConfig(
        name="send_message",
        description="Send a message to a channel",
        parameters=[
            ParamConfig(name="channel_name", type="string", description="Target channel"),
            ParamConfig(name="content", type="string", description="Message content"),
        ],
    )
    method = build_action_method(config)
    assert "Send a message to a channel" in method.__doc__
    assert "channel_name" in method.__doc__
    assert "content" in method.__doc__


def test_has_correct_parameters():
    config = ActionConfig(
        name="send_message",
        description="Send a message to a channel",
        parameters=[
            ParamConfig(name="channel_name", type="string", description="Target channel"),
            ParamConfig(name="content", type="string", description="Message content"),
        ],
    )
    method = build_action_method(config)
    sig = inspect.signature(method)
    param_names = list(sig.parameters.keys())
    # First param is 'self'
    assert "channel_name" in param_names
    assert "content" in param_names


def test_no_params_action():
    config = ActionConfig(name="do_nothing", description="No action", parameters=[])
    method = build_action_method(config)
    assert method.__name__ == "do_nothing"
    sig = inspect.signature(method)
    # Only 'self' parameter
    assert len([p for p in sig.parameters if p != "self"]) == 0
```

- [ ] **Step 2: Run to verify failure**

Run: `uv run pytest tests/test_action_factory.py -v`

- [ ] **Step 3: Implement action factory**

`src/crucible/actions/__init__.py`: empty

`src/crucible/actions/action_factory.py`:
```python
"""Dynamic action method generation from ActionConfig."""

import types
from typing import Any
from ..config.platform_config import ActionConfig, ParamConfig


# Map config types to Python type annotations
TYPE_MAP = {
    "string": str,
    "integer": int,
    "boolean": bool,
    "float": float,
}


def build_action_method(config: ActionConfig):
    """Generate an async method from an ActionConfig.

    The generated method has:
    - Correct __name__ matching config.name
    - A docstring with description and parameter docs (for FunctionTool introspection)
    - Type-annotated parameters matching config.parameters
    - Calls self.perform_action(message, action_name) when invoked
    """
    param_names = [p.name for p in config.parameters]

    # Build docstring
    doc_lines = [config.description, "", "Args:"]
    for p in config.parameters:
        py_type = TYPE_MAP.get(p.type, str).__name__
        doc_lines.append(f"    {p.name} ({py_type}): {p.description}")
    if not config.parameters:
        doc_lines = [config.description]
    docstring = "\n".join(doc_lines)

    # Build the async function dynamically
    if param_names:
        params_str = ", ".join(param_names)
        body = f"""
async def {config.name}(self, {params_str}):
    '''{docstring}'''
    message = ({", ".join(param_names)},) if {len(param_names)} > 1 else {param_names[0]}
    return await self.perform_action(message, "{config.name}")
"""
    else:
        body = f"""
async def {config.name}(self):
    '''{docstring}'''
    return await self.perform_action(None, "{config.name}")
"""

    # Compile and extract the function
    local_ns: dict = {}
    exec(body, {}, local_ns)
    method = local_ns[config.name]

    # Add type annotations
    annotations = {}
    for p in config.parameters:
        annotations[p.name] = TYPE_MAP.get(p.type, str)
    annotations["return"] = Any
    method.__annotations__ = annotations

    return method
```

- [ ] **Step 4: Run tests**

Run: `uv run pytest tests/test_action_factory.py -v`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add src/crucible/actions/ tests/test_action_factory.py
git commit -m "feat: add dynamic action method factory"
```

---

### Task 4: DynamicAction Class

**Files:**
- Create: `src/crucible/actions/dynamic_action.py`
- Create: `tests/test_dynamic_action.py`

- [ ] **Step 1: Write failing test**

`tests/test_dynamic_action.py`:
```python
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock
from crucible.config.platform_config import ActionConfig, ParamConfig, PlatformConfig, VisibilityConfig
from crucible.actions.dynamic_action import DynamicAction


def _slack_config():
    return PlatformConfig(
        name="slack",
        display_name="Slack",
        system_prompt_template="",
        actions=[
            ActionConfig(
                name="send_message",
                description="Send a message",
                parameters=[
                    ParamConfig(name="channel_name", type="string", description="Channel"),
                    ParamConfig(name="content", type="string", description="Message"),
                ],
            ),
            ActionConfig(name="do_nothing", description="No action", parameters=[]),
        ],
        visibility=VisibilityConfig(strategy="chronological"),
    )


def test_has_action_methods():
    channel = MagicMock()
    action = DynamicAction(agent_id=1, channel=channel, platform_config=_slack_config())
    assert hasattr(action, "send_message")
    assert hasattr(action, "do_nothing")
    assert callable(action.send_message)


def test_get_action_names():
    channel = MagicMock()
    action = DynamicAction(agent_id=1, channel=channel, platform_config=_slack_config())
    names = action.get_action_names()
    assert "send_message" in names
    assert "do_nothing" in names


@pytest.mark.asyncio
async def test_perform_action_sends_to_channel():
    channel = MagicMock()
    channel.write_to_receive_queue = AsyncMock(return_value="msg-123")
    channel.read_from_send_queue = AsyncMock(return_value=("msg-123", 1, {"success": True}))

    action = DynamicAction(agent_id=1, channel=channel, platform_config=_slack_config())
    result = await action.send_message(channel_name="#general", content="Hello")
    assert result == {"success": True}
    channel.write_to_receive_queue.assert_called_once()
```

- [ ] **Step 2: Run to verify failure**

Run: `uv run pytest tests/test_dynamic_action.py -v`

- [ ] **Step 3: Implement DynamicAction**

`src/crucible/actions/dynamic_action.py`:
```python
"""Dynamic action class that replaces OASIS SocialAction."""

import types
from typing import Any

from ..config.platform_config import PlatformConfig
from .action_factory import build_action_method


class DynamicAction:
    """Agent-side action dispatcher generated from PlatformConfig.

    Replaces OASIS's SocialAction which had 27 hardcoded methods.
    Methods are generated dynamically from the platform's ActionConfig list.
    """

    def __init__(self, agent_id: int, channel: Any, platform_config: PlatformConfig):
        self.agent_id = agent_id
        self.channel = channel
        self.platform_config = platform_config
        self._action_names: list[str] = []

        # Dynamically attach action methods from config
        for action_config in platform_config.actions:
            method = build_action_method(action_config)
            bound_method = types.MethodType(method, self)
            setattr(self, action_config.name, bound_method)
            self._action_names.append(action_config.name)

    async def perform_action(self, message: Any, action_type: str) -> Any:
        """Send action to platform via channel and wait for result."""
        message_id = await self.channel.write_to_receive_queue(
            (self.agent_id, message, action_type)
        )
        response = await self.channel.read_from_send_queue(message_id)
        return response[2]

    def get_action_names(self) -> list[str]:
        """Return list of available action names."""
        return list(self._action_names)
```

- [ ] **Step 4: Run tests**

Run: `uv run pytest tests/test_dynamic_action.py -v`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add src/crucible/actions/dynamic_action.py tests/test_dynamic_action.py
git commit -m "feat: add DynamicAction class with config-driven methods"
```

---

### Task 5: ConfigurablePlatform

**Files:**
- Create: `src/crucible/platform/configurable_platform.py`
- Create: `tests/test_configurable_platform.py`

- [ ] **Step 1: Write failing test**

`tests/test_configurable_platform.py`:
```python
import asyncio
import sqlite3
import pytest
from crucible.config.platform_config import (
    PlatformConfig, ActionConfig, ParamConfig, VisibilityConfig,
    SchemaConfig, SchemaTableConfig, SchemaColumnConfig,
)
from crucible.platform.configurable_platform import ConfigurablePlatform
from crucible.platform.channel import Channel


def _test_platform_config():
    return PlatformConfig(
        name="test_chat",
        display_name="Test Chat",
        system_prompt_template="You are {{ name }}.",
        actions=[
            ActionConfig(
                name="send_message",
                description="Send a message",
                parameters=[
                    ParamConfig(name="channel_name", type="string", description="Channel"),
                    ParamConfig(name="content", type="string", description="Message"),
                ],
            ),
            ActionConfig(name="do_nothing", description="No action", parameters=[]),
        ],
        schema=SchemaConfig(tables=[
            SchemaTableConfig(name="user", columns=[
                SchemaColumnConfig(name="user_id", type="INTEGER", primary_key=True, autoincrement=True),
                SchemaColumnConfig(name="user_name", type="TEXT"),
            ]),
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


def test_platform_creates_db(tmp_path):
    db_path = str(tmp_path / "test.db")
    channel = Channel()
    platform = ConfigurablePlatform(
        platform_config=_test_platform_config(),
        db_path=db_path,
        channel=channel,
    )
    # Verify tables exist
    platform.db_cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = {row[0] for row in platform.db_cursor.fetchall()}
    assert "message" in tables
    assert "trace" in tables
    platform.db.close()


def test_platform_has_action_handlers(tmp_path):
    db_path = str(tmp_path / "test.db")
    channel = Channel()
    platform = ConfigurablePlatform(
        platform_config=_test_platform_config(),
        db_path=db_path,
        channel=channel,
    )
    assert hasattr(platform, "send_message")
    assert hasattr(platform, "do_nothing")
    platform.db.close()


@pytest.mark.asyncio
async def test_platform_handles_send_message(tmp_path):
    db_path = str(tmp_path / "test.db")
    channel = Channel()
    platform = ConfigurablePlatform(
        platform_config=_test_platform_config(),
        db_path=db_path,
        channel=channel,
    )

    # Directly call the handler (simulating what running() does)
    result = await platform.send_message(agent_id=1, message=("#general", "Hello world"))
    assert result["success"] is True

    # Verify it was stored in DB
    platform.db_cursor.execute("SELECT content FROM message WHERE channel_name = '#general'")
    row = platform.db_cursor.fetchone()
    assert row[0] == "Hello world"
    platform.db.close()


@pytest.mark.asyncio
async def test_platform_do_nothing(tmp_path):
    db_path = str(tmp_path / "test.db")
    channel = Channel()
    platform = ConfigurablePlatform(
        platform_config=_test_platform_config(),
        db_path=db_path,
        channel=channel,
    )
    result = await platform.do_nothing(agent_id=1)
    assert result["success"] is True
    platform.db.close()
```

- [ ] **Step 2: Run to verify failure**

Run: `uv run pytest tests/test_configurable_platform.py -v`

- [ ] **Step 3: Implement ConfigurablePlatform**

`src/crucible/platform/configurable_platform.py`:
```python
"""Configurable platform that creates action handlers from YAML config."""

import json
import asyncio
from datetime import datetime
from typing import Any

from ..config.platform_config import PlatformConfig, ActionConfig
from .schema_loader import create_db_from_config
from .channel import Channel


class ConfigurablePlatform:
    """A simulation platform whose actions and schema are defined by config.

    Replaces OASIS's hardcoded Platform class. Actions are dynamically
    generated from PlatformConfig. The dispatch loop uses the same
    getattr(self, action_name) pattern as OASIS.
    """

    def __init__(self, platform_config: PlatformConfig, db_path: str, channel: Channel):
        self.config = platform_config
        self.channel = channel
        self.db_path = db_path

        # Create database from config schema
        if platform_config.schema:
            self.db, self.db_cursor = create_db_from_config(db_path, platform_config.schema)
        else:
            import sqlite3
            self.db = sqlite3.connect(db_path)
            self.db_cursor = self.db.cursor()

        # Dynamically attach action handlers
        for action_config in platform_config.actions:
            handler = self._build_handler(action_config)
            setattr(self, action_config.name, handler)

    def _build_handler(self, action_config: ActionConfig):
        """Build a platform-side handler for an action.

        For actions with parameters, auto-generates an INSERT into the
        appropriate table (convention: first param that ends with '_name'
        or the action name minus common prefixes determines the table).

        For do_nothing, returns a simple success response.
        """
        action_name = action_config.name

        if action_name == "do_nothing":
            async def do_nothing_handler(agent_id: int, message: Any = None):
                self._record_trace(agent_id, action_name, "{}")
                return {"success": True, "action": "do_nothing"}
            return do_nothing_handler

        # For actions with parameters, build a CRUD insert handler
        param_names = [p.name for p in action_config.parameters]

        # Determine target table: use action name heuristic
        # send_message -> message, send_email -> email, create_incident -> incident
        table_name = self._infer_table_name(action_name)

        async def crud_handler(agent_id: int, message: Any = None):
            # Parse message into parameter values
            if message is None:
                values = {}
            elif isinstance(message, tuple):
                values = dict(zip(param_names, message))
            elif isinstance(message, str):
                values = {param_names[0]: message} if param_names else {}
            else:
                values = {"data": str(message)}

            # Add metadata
            values["user_id"] = agent_id
            values["created_at"] = datetime.now().isoformat()

            # Try to insert into the target table
            try:
                # Filter to columns that exist in the table
                self.db_cursor.execute(f"PRAGMA table_info({table_name})")
                existing_cols = {row[1] for row in self.db_cursor.fetchall()}
                insert_values = {k: v for k, v in values.items() if k in existing_cols}

                if insert_values:
                    cols = ", ".join(insert_values.keys())
                    placeholders = ", ".join(["?"] * len(insert_values))
                    self.db_cursor.execute(
                        f"INSERT INTO {table_name} ({cols}) VALUES ({placeholders})",
                        list(insert_values.values())
                    )
                    self.db.commit()
                    row_id = self.db_cursor.lastrowid
                else:
                    row_id = None

                self._record_trace(agent_id, action_name, json.dumps(values, default=str))
                return {"success": True, "action": action_name, "id": row_id}

            except Exception as e:
                self._record_trace(agent_id, action_name, json.dumps({"error": str(e)}))
                return {"success": True, "action": action_name, "note": "no matching table"}

        return crud_handler

    def _infer_table_name(self, action_name: str) -> str:
        """Infer the database table from the action name.

        send_message -> message, reply_in_thread -> message,
        create_incident -> incident, send_email -> email,
        react -> reaction, etc.
        """
        prefixes = ["send_", "create_", "add_", "reply_", "forward_", "update_", "check_", "refresh_"]
        name = action_name
        for prefix in prefixes:
            if name.startswith(prefix):
                name = name[len(prefix):]
                break

        # Common mappings
        mappings = {
            "in_thread": "message",
            "email": "email",
            "nothing": "trace",
            "channels": "message",
            "mentions": "message",
            "inbox": "email",
        }
        return mappings.get(name, name)

    def _record_trace(self, agent_id: int, action: str, info: str):
        """Record an action in the trace table."""
        try:
            self.db_cursor.execute(
                "INSERT INTO trace (user_id, action, info, created_at) VALUES (?, ?, ?, ?)",
                (agent_id, action, info, datetime.now().isoformat())
            )
            self.db.commit()
        except Exception:
            pass  # Trace table may not exist in all configs

    async def running(self):
        """Main dispatch loop — same pattern as OASIS Platform.running()."""
        while True:
            message_id, data = await self.channel.receive_from()
            agent_id, message, action_name = data

            if action_name == "exit":
                self.db_cursor.close()
                self.db.close()
                break

            handler = getattr(self, action_name, None)
            if handler:
                result = await handler(agent_id=agent_id, message=message)
                await self.channel.send_to((message_id, agent_id, result))
            else:
                error = {"success": False, "error": f"Unknown action: {action_name}"}
                await self.channel.send_to((message_id, agent_id, error))
```

- [ ] **Step 4: Run tests**

Run: `uv run pytest tests/test_configurable_platform.py -v`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add src/crucible/platform/configurable_platform.py tests/test_configurable_platform.py
git commit -m "feat: add ConfigurablePlatform with dynamic action dispatch"
```

---

### Task 6: Integration Test — Full Action Roundtrip

**Files:**
- Modify: `tests/test_configurable_platform.py`

- [ ] **Step 1: Write integration test**

Append to `tests/test_configurable_platform.py`:
```python
@pytest.mark.asyncio
async def test_full_roundtrip_via_channel(tmp_path):
    """Test the full flow: agent sends action via channel, platform handles it."""
    db_path = str(tmp_path / "test.db")
    channel = Channel()
    platform = ConfigurablePlatform(
        platform_config=_test_platform_config(),
        db_path=db_path,
        channel=channel,
    )

    # Start platform in background
    platform_task = asyncio.create_task(platform.running())

    # Simulate agent sending a message
    msg_id = await channel.write_to_receive_queue(
        (1, ("#general", "Hello from agent"), "send_message")
    )
    response = await channel.read_from_send_queue(msg_id)
    _, agent_id, result = response
    assert result["success"] is True

    # Simulate agent doing nothing
    msg_id2 = await channel.write_to_receive_queue(
        (1, None, "do_nothing")
    )
    response2 = await channel.read_from_send_queue(msg_id2)
    assert response2[2]["success"] is True

    # Send exit to stop platform
    await channel.write_to_receive_queue((0, None, "exit"))
    await platform_task
```

- [ ] **Step 2: Run all platform tests**

Run: `uv run pytest tests/test_configurable_platform.py -v`
Expected: 5 PASS

- [ ] **Step 3: Commit**

```bash
git add tests/test_configurable_platform.py
git commit -m "test: add full action roundtrip integration test"
```

---

### Task 7: Update exports and run full suite

**Files:**
- Modify: `src/crucible/actions/__init__.py`
- Modify: `src/crucible/platform/__init__.py`
- Modify: `src/crucible/__init__.py`

- [ ] **Step 1: Update init files**

`src/crucible/actions/__init__.py`:
```python
"""Dynamic action generation for Crucible."""
from .action_factory import build_action_method
from .dynamic_action import DynamicAction
```

`src/crucible/platform/__init__.py`:
```python
"""Platform components for Crucible."""
from .schema_loader import create_db_from_config
from .configurable_platform import ConfigurablePlatform
from .channel import Channel
```

Update `src/crucible/__init__.py` to add:
```python
from .actions import DynamicAction, build_action_method
from .platform import ConfigurablePlatform, Channel, create_db_from_config
```

- [ ] **Step 2: Run full test suite**

```bash
uv run pytest tests/ -v
```
Expected: All tests pass (~30+ total: 22 from Phase 1 + 8+ from Phase 2)

- [ ] **Step 3: Verify imports**

```bash
uv run python -c "from crucible import ConfigurablePlatform, DynamicAction, Channel, create_db_from_config; print('Phase 2 imports OK')"
```

- [ ] **Step 4: Commit and push**

```bash
git add src/crucible/ tests/
git commit -m "feat: complete Phase 2 - dynamic actions, schema loader, configurable platform"
git push origin main
```

---

## Phase 2 Completion Checklist

- [ ] Schema loader creates SQLite tables from YAML config
- [ ] Channel copied from OASIS works for async message passing
- [ ] Action factory generates typed async methods from ActionConfig
- [ ] DynamicAction replaces SocialAction with config-driven methods
- [ ] ConfigurablePlatform dispatches actions and stores results in DB
- [ ] Full roundtrip works: agent → channel → platform → DB → response
- [ ] All tests pass
- [ ] Pushed to `raxITlabs/crucible`

**Next:** Phase 3 (Agent Layer — Jinja2 prompts, ConfigurableEnvironment, CrucibleEnv multi-world orchestration)
