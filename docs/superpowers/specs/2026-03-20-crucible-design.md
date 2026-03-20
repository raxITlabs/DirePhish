# Crucible — Enterprise Simulation Engine Design Spec

**Date**: 2026-03-20
**Status**: Brainstorming → Design Approval
**Repos**: `raxITlabs/crucible` (engine) + `raxITlabs/MiroFish-IR-Simulation` (app)

---

## 1. Vision

OASIS simulates social media as a living ecosystem. **Crucible simulates an enterprise as a living organism.**

You pick a preset enterprise (industry, size, org structure), inject a scenario (breach, policy change, market event), and Crucible spawns AI agents that communicate and make decisions across real enterprise tools — under real business pressure.

**The analogy:**
| OASIS | Crucible |
|---|---|
| Twitter / Reddit | Slack / Email / ServiceNow / SIEM / PagerDuty / EDR |
| Social media users | Employees with roles and reporting lines |
| Recommendation algorithm | Org chart + role-based visibility |
| Trending / Viral | Escalations / Active incidents |
| Social pressure (likes) | Business pressure (deadlines, SLAs, compliance) |

---

## 2. Architecture

### Two Repos, Clear Separation

```
raxITlabs/crucible                  →  Simulation engine (pip: crucible-sim)
                                       Forked from camel-ai/oasis
                                       YAML-configurable platforms, actions, pressures
                                       Enterprise tool presets

raxITlabs/MiroFish-IR-Simulation    →  Application (already exists)
                                       Uses Crucible where MiroFish uses OASIS
                                       Knowledge graph (Zep), persona gen, reports, UI
                                       First use case: IR tabletop exercises
```

Crucible is a `pyproject.toml` dependency of MiroFish-IR-Simulation, replacing `camel-oasis`.

### Core Components

```
┌─────────────────────────────────────────┐
│           Enterprise Config              │ ← YAML: org, channels, pressures
├────────────┬────────────┬───────────────┤
│  World 1   │  World 2   │  World N      │ ← Each world = enterprise tool
│  (Slack)   │  (Email)   │  (SIEM)       │
├────────────┴────────────┴───────────────┤
│           Pressure Engine                │ ← Ticking clocks, SLAs, thresholds
├─────────────────────────────────────────┤
│           Agent Layer                    │ ← CAMEL ChatAgent + Jinja2 prompts
├─────────────────────────────────────────┤
│           Crucible Env                   │ ← Multi-world orchestration + async
├─────────────────────────────────────────┤
│  Channel  │  AgentGraph  │  Clock       │ ← Reused from OASIS as-is
└───────────┴──────────────┴──────────────┘
```

---

## 3. Enterprise Config (YAML)

The user picks a preset or defines custom:

```yaml
enterprise:
  name: "NovaPay Inc."
  industry: fintech
  size: medium               # small (50-100), medium (100-500), large (500+)
  preset: fintech_ir          # loads builtin template

  worlds:
    - type: slack
      name: "IR War Room"
    - type: email
      name: "Corporate Email"

  pressures:
    - name: "GDPR 72-hour notification"
      type: countdown
      hours: 72
      affects_roles: [legal_counsel, ciso, compliance]
      severity_at_50pct: high
      severity_at_25pct: critical

    - name: "Saturday payment queue"
      type: threshold
      value: 4200000
      unit: USD
      affects_roles: [vp_engineering, cto]

    - name: "Series D roadshow"
      type: deadline
      hours_until: 240
      affects_roles: [ceo, cfo]

    - name: "CrowdStrike retainer SLA"
      type: countdown
      hours: 4
      triggered_by: retainer_activated
      affects_roles: [ciso, ir_lead]

  org:
    departments: [security, engineering, legal, executive, communications]
    reporting_lines:
      ir_lead: ciso
      soc_analyst: ir_lead
      ciso: ceo
      vp_engineering: cto
      cto: ceo
      legal_counsel: ceo
```

---

## 4. World Types (Enterprise Tools)

Each world is defined by a YAML config specifying actions, schema, prompts, and visibility.

### Available World Types

**Communication:**
- `slack` — channels, threads, reactions, @mentions
- `email` — send, reply, forward, CC, formal notifications

**IT Service Management:**
- `servicenow` — incident tickets, change requests, CMDB, approvals
- `jira` — tickets, sprints, assignments, comments

**Security Operations:**
- `siem` — alerts, correlation, log search, dashboards
- `soar` — automated playbooks, case management
- `edr` — endpoint isolation, threat hunting, process trees
- `waf_firewall` — block IPs, rate limiting, geo-blocking

**Identity & Access:**
- `iam` — disable accounts, rotate credentials, revoke tokens
- `pam` — privileged access requests, session recording

**Infrastructure:**
- `cloud_console` — security groups, resource management, audit logs
- `kubernetes` — pod management, network policies, rollbacks
- `cicd` — pipeline control, deployment gates, secret rotation

**Compliance & Legal:**
- `grc` — compliance tracking, regulatory filing
- `legal_hold` — evidence preservation, chain of custody
- `insurance_portal` — breach notification filing

**Monitoring & Alerting:**
- `pagerduty` — on-call paging, escalation chains, acknowledgment
- `monitoring` — infrastructure dashboards, anomaly alerts

### Example: Slack World Config

```yaml
platform:
  name: slack
  display_name: "Slack Workspace"

  system_prompt_template: |
    You are {{ name }}, a {{ role }} in a Slack workspace.
    You communicate in channels and direct messages with your team.
    {{ persona }}
    Respond to messages relevant to your expertise.
    Use @mentions when you need someone's attention.

  actions:
    - name: send_message
      description: "Send a message to a Slack channel"
      parameters:
        - { name: channel_name, type: string }
        - { name: content, type: string }

    - name: reply_in_thread
      description: "Reply to a specific message in a thread"
      parameters:
        - { name: parent_message_id, type: integer }
        - { name: content, type: string }

    - name: react
      description: "Add an emoji reaction to a message"
      parameters:
        - { name: message_id, type: integer }
        - { name: emoji, type: string }

    - name: mention_user
      description: "Send a message that @mentions a specific user"
      parameters:
        - { name: channel_name, type: string }
        - { name: target_user, type: string }
        - { name: content, type: string }

    - name: do_nothing
      description: "No action needed right now"
      parameters: []

  visibility:
    strategy: chronological
    config:
      per_channel_limit: 10
      prioritize_mentions: true
```

---

## 5. Pressure Engine

New component — OASIS has nothing like this.

### Pressure Types

| Type | Behavior | Example |
|---|---|---|
| `countdown` | Ticks down each round | GDPR 72-hour clock |
| `deadline` | Fixed future point | Series D roadshow in 10 days |
| `threshold` | Triggers when a value is crossed | $4.2M payment queue |
| `triggered` | Starts when an event occurs | CrowdStrike SLA starts on activation |

### How It Works

Each round:
1. `PressureEngine.tick(round_num)` — advance all active pressures
2. `PressureEngine.get_for_role(role)` — return pressures visible to this role
3. Injected into agent observation prompt:

```
⚠️ ACTIVE PRESSURES:
- GDPR notification deadline: 47 hours remaining [HIGH]
- $4.2M payment queue blocked if DB offline [CRITICAL]
- Series D roadshow in 9 days — CEO wants minimal disclosure [MEDIUM]
```

### Emergent Pressures

Not configured — arise naturally from agent interactions:
- CEO tells CISO to "keep this tight" → political pressure
- VP Eng pushes back on containment → inter-department friction
- SOC analyst hesitates to escalate → cultural/career pressure

These exist in the conversation history, not in YAML. Agents respond to them because their personas include personality traits (cautious, aggressive, political, etc.).

---

## 6. Industry Presets

Pre-built enterprise templates:

```yaml
# Cybersecurity IR (first use case)
preset: cybersecurity_ir
worlds: [slack, email, siem, edr, servicenow, pagerduty]
pressures: [gdpr_clock, data_exfil_rate, insurance_48hr, evidence_preservation]
roles: [ir_lead, soc_analyst, security_engineer, ciso, legal, compliance, comms, vp_eng, cto, ceo]
scale: [small: 8 agents, medium: 15 agents, large: 30 agents]

# FSI (Financial Services)
preset: fsi
worlds: [teams, email, servicenow, siem, grc, monitoring]
pressures: [regulatory_deadline, trading_halt_risk, audit_trail, client_sla]
roles: [trader, compliance_officer, risk_manager, ciso, it_ops]

# Healthcare
preset: healthcare
worlds: [teams, email, servicenow, monitoring, pagerduty]
pressures: [patient_safety, hipaa_72hr, staffing_ratio, device_uptime]
roles: [physician, nurse, it_admin, compliance, biomedical_eng, ciso]

# Tech Startup
preset: tech_startup
worlds: [slack, email, jira, cicd, monitoring]
pressures: [sprint_deadline, uptime_sla, runway_months, customer_churn]
roles: [engineer, sre, product_manager, cto, support, sales]
```

---

## 7. What We Reuse From OASIS (unchanged)

| Component | File | Why it's generic |
|---|---|---|
| Channel | `social_platform/channel.py` | Pure async pub/sub |
| Clock | `clock/clock.py` | K-factor time scaling |
| AgentGraph | `social_agent/agent_graph.py` | igraph/Neo4j topology |
| Platform.running() dispatch | `social_platform/platform.py:128-173` | `getattr(self, action.value)` is already generic |
| PlatformUtils | `social_platform/platform_utils.py` | DB helpers, trace recording |
| ManualAction / LLMAction | `environment/env_action.py` | Action types for step() |
| env.step() pattern | `environment/env.py` | `asyncio.gather(*tasks)` |

---

## 8. What We Replace

| OASIS Component | Crucible Replacement |
|---|---|
| `DefaultPlatformType` (TWITTER/REDDIT) | `PlatformRegistry` loaded from YAML |
| `ActionType` enum (30+ hardcoded) | Dynamic actions from config |
| `SocialAction` (27 methods) | `DynamicAction` auto-generated from config |
| `create_db()` (16 SQL files) | `SchemaLoader` from config |
| `UserInfo.to_twitter_system_message()` | Jinja2 template from config |
| `SocialEnvironment` | `ConfigurableEnvironment` + pressure injection |
| `OasisEnv.__init__()` (if TWITTER/elif REDDIT) | `CrucibleEnv` config-driven factory |
| `RecsysType` (twitter/reddit) | `VisibilityStrategy` (chronological/priority/assignment) |
| *(nothing)* | **PressureEngine** (new) |

---

## 9. MVP: NovaPay IR on Crucible

**Success criteria**: The NovaPay breach scenario runs on Crucible with enterprise tools instead of Twitter/Reddit, producing an after-action report via MiroFish-IR-Simulation.

| What | Details |
|---|---|
| Enterprise | NovaPay Inc. (fintech_ir preset, medium scale) |
| Worlds | Slack (war room) + Email (formal notifications) |
| Agents | 8-10: CEO, CISO, IR Lead, CTO, VP Eng, Legal, SOC analysts, Comms |
| Pressures | GDPR clock, payment queue, insurance SLA, Series D |
| Scenario | NovaPay breach seed document |
| Rounds | 3-5 via Gemini 3.1 Flash Lite |
| Output | Trace log + MiroFish-IR-Simulation after-action report |

### What "working" looks like:
1. Upload NovaPay seed → MiroFish builds knowledge graph (Zep)
2. Pick `fintech_ir` preset → agents generated with IR roles
3. Run simulation → agents communicate in Slack war room, send emails to legal/insurance
4. Pressure ticks → GDPR clock counts down, payment queue creates urgency
5. Generate report → after-action report analyzing decisions, timeline, recommendations
6. Chat with agents → "Yuki, why didn't you escalate sooner?"

---

## 10. Repo Structure

```
raxITlabs/crucible/
├── pyproject.toml                    # UV-managed, python >=3.11
├── src/crucible/
│   ├── __init__.py                   # Public API: make, load_enterprise
│   ├── config/
│   │   ├── enterprise_config.py      # EnterpriseConfig, OrgConfig, PressureConfig
│   │   ├── platform_config.py        # ChannelConfig, ActionConfig, VisibilityConfig
│   │   └── loader.py                 # YAML/JSON loader + validator
│   ├── registry.py                   # PlatformRegistry singleton
│   ├── pressure/
│   │   ├── engine.py                 # PressureEngine (tick, trigger, format)
│   │   └── types.py                  # Countdown, Deadline, Threshold, Triggered
│   ├── actions/
│   │   ├── action_factory.py         # Dynamic method gen from ActionConfig
│   │   └── dynamic_action.py         # Replaces SocialAction
│   ├── platform/
│   │   ├── platform.py               # ConfigurablePlatform (extends OASIS Platform)
│   │   ├── schema_loader.py          # Config-driven CREATE TABLE
│   │   └── handlers/
│   │       ├── base_handler.py       # ABC for custom handlers
│   │       ├── crud_handler.py       # Auto-gen INSERT/SELECT/UPDATE
│   │       ├── builtin_twitter.py    # Backward compat
│   │       └── builtin_reddit.py     # Backward compat
│   ├── agent/
│   │   ├── agent.py                  # ConfigurableAgent (extends SocialAgent)
│   │   ├── user_info.py              # AgentInfo (Jinja2 system prompts)
│   │   ├── environment.py            # ConfigurableEnvironment + pressure
│   │   ├── agent_graph.py            # From OASIS (org chart as topology)
│   │   └── agents_generator.py       # Enterprise agent generator
│   ├── visibility/
│   │   ├── base.py                   # VisibilityStrategy ABC
│   │   └── strategies/
│   │       ├── chronological.py      # Slack/chat
│   │       ├── priority.py           # SIEM/SOC
│   │       ├── assignment.py         # Jira
│   │       └── org_hierarchy.py      # Email
│   ├── clock/clock.py                # From OASIS
│   ├── channel.py                    # From OASIS
│   ├── environment/
│   │   ├── env.py                    # CrucibleEnv (multi-world + pressure)
│   │   └── make.py                   # Factory
│   ├── compat/oasis.py               # Backward compat shim
│   └── builtins/
│       ├── channels/
│       │   ├── slack.yaml
│       │   ├── email.yaml
│       │   ├── servicenow.yaml
│       │   ├── siem.yaml
│       │   ├── edr.yaml
│       │   ├── pagerduty.yaml
│       │   └── jira.yaml
│       ├── presets/
│       │   ├── cybersecurity_ir.yaml
│       │   ├── fsi.yaml
│       │   ├── healthcare.yaml
│       │   └── tech_startup.yaml
│       └── legacy/
│           ├── twitter.yaml
│           └── reddit.yaml
└── tests/
```

---

## 11. Implementation Phases

### Phase 1: Foundation
- Clone OASIS → crucible repo
- Config schema (Pydantic models + YAML loader + registry)
- Builtin YAML configs (slack, email, ir_war_room preset)

### Phase 2: Engine Core
- Dynamic action system (factory + DynamicAction)
- ConfigurablePlatform + schema loader + CRUD handlers
- PressureEngine (tick, trigger, format_for_prompt)

### Phase 3: Agent Layer
- AgentInfo (Jinja2 system prompts)
- ConfigurableEnvironment (observation + pressure injection)
- CrucibleEnv (multi-world orchestration)
- Visibility strategies

### Phase 4: Integration + MVP
- Backward compat shim (Twitter/Reddit still work)
- Wire into MiroFish-IR-Simulation (replace camel-oasis import)
- Run NovaPay scenario end-to-end
- Tests

---

## 12. Verification

1. **Backward compat**: Twitter/Reddit YAML configs produce identical traces to OASIS
2. **Slack world**: 5 agents, 3 rounds, messages appear in channels with threads
3. **Pressure engine**: GDPR countdown ticks, legal agent sees it, engineer doesn't
4. **Multi-world**: Slack + Email run in parallel, agents act on both
5. **NovaPay end-to-end**: Full scenario through MiroFish-IR-Simulation → Crucible → report
