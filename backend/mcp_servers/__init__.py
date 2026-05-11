"""DirePhish MCP servers — Crucible worlds exposed via Model Context Protocol.

Each world (Slack, Email, SIEM, …) is a FastMCP stdio server that wraps
``crucible.environment.CrucibleEnv.apply_action`` for that single world.
Agents in the ADK tree connect via ``MCPToolset(connection_params=
StdioConnectionParams(...))`` and get a constrained set of actions
matching what the world allows for the connecting role.

Why separate per-world processes (not one mega-server):
- Per-persona ``tool_filter`` on the MCPToolset constrains what each
  agent can do, but the server itself enforces nothing — separating
  worlds keeps the blast radius narrow and matches the way the demo
  story explains the architecture.
- Hot-swap: replace ``slack_world.py`` with ``slack_world_v2.py``
  without redeploying anything else.
- Performance: stdio subprocess overhead is amortized over the round —
  4 stdio subprocesses per round at start, then connection-pooled.

Production switches stdio → Streamable HTTP (W4 work).
"""
