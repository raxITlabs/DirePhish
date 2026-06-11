# DirePhish — Google Challenge: ADK 2.x + A2A, Gemini-only, Cloud Run via Terraform

**Status:** In implementation · **Branch:** `feature/google-challenge` · **Date:** 2026-06-11
**Live tracker** — check the boxes as workstreams land. Source of truth for the deploy effort.

---

## Context

DirePhish is an incident-response simulator whose simulation core was migrated onto Google ADK
(`backend/adk/`): a `BaseAgent` orchestrator running
`SequentialAgent(pressure → adversary → defenders ParallelAgent → judge)`, FastMCP "world"
servers, and an A2A-capable Containment Judge. It runs locally only.

We are entering **Google for Startups AI Agents Challenge, Track 2 (Optimize Existing Agents)**.
Submission = public hosted URL + 2–3 min live-demo video + repo.

This effort makes the app: (1) **current** on the Google stack (ADK ~2.2, unified `google-genai`
SDK, Gemini 3.x IDs); (2) **Gemini-only** (Claude-on-Vertex can't be enabled in our project — keep
the code dormant, never crash on it); (3) **A2A-real** (judge as its own Cloud Run service called
cross-process); (4) **Track-2-credible** (committed before/after containment number via ADK's
prompt optimizer); (5) **hosted on Google Cloud via Terraform** (3 Cloud Run services).

**Decisions (locked):** upgrade `google-adk` → ~2.2; migrate the thin legacy LLM wrapper to
`google-genai`; Terraform targets project `raxit-ai`, region `us-central1`, Gemini location
`global`, auth via ADC + runtime service account; Track-2 number via ADK `SimplePromptOptimizer`.

> **⚠️ Security pre-req (USER ACTION):** real secrets are committed in `/.env` —
> `LLM_API_KEY=AIza…` and `CLOUDFLARE_API_TOKEN=cfat_…`. **Rotate both** before deploy. `.env` is
> gitignored. After WS1 the AI Studio `LLM_API_KEY` is gone entirely; only `CLOUDFLARE_API_TOKEN`
> remains a secret. Never put plaintext in Terraform state or images.

---

## Progress at a glance

| WS | Workstream | Status |
|----|-----------|--------|
| 0  | ADK 2.x upgrade + Gemini-only hardening | ✅ **Done** (tests green) |
| 1  | Legacy pipeline → `google-genai` SDK | ✅ **Done** |
| 2  | A2A judge as its own Cloud Run service | ✅ **Done** (code) |
| 3  | Track-2 headline number (SimplePromptOptimizer) | ✅ **Done** (code; live run pending creds) |
| 4  | Demo quick wins (war-room nav, email world, trace) | ✅ **Done** |
| 5  | Containerization (Dockerfiles + Cloud Build) | ✅ **Done** (frontend build verified) |
| 6  | Terraform (Cloud Run + IAM + secrets + Firestore) | ✅ **Done** (validated: plan 28-to-add) |
| 7  | Deploy + end-to-end verification | 🔄 In progress (core infra live; image rebuilding) |

---

## WS0 — ADK 2.x upgrade + Gemini-only hardening ✅

- [x] `backend/pyproject.toml`: `google-adk>=1.32` → `google-adk~=2.2` (`uv lock`/`sync` →
      adk **2.2.0**, google-genai **2.8.0**, starlette **1.2.1**).
- [x] Full suite gate: `tests/adk` + `tests/evals` = **118 passed, 7 skipped** on ADK 2.x
      (run with `uv run python -m pytest …`, NOT the shimmed `pytest`).
- [x] `backend/adk/models.py`: Claude import + `LLMRegistry.register(Claude)` wrapped in
      try/except (Gemini-only never crashes); Flash default → `gemini-3.5-flash`.
- [x] `backend/adk/agents/personas/threat_actor.py`: adversary default `model_key` flash→**pro**
      (+ docstring now Gemini-default).
- [x] `backend/adk/agents/personas/containment_judge.py`: judge default `model_key` flash→**pro**.
- [x] `backend/adk/runner.py`: firm Gemini adversary default + log provider/model; claude path
      gets a valid `sonnet` key if ever flipped.
- [x] `backend/app/config.py`: `validate()` no longer fatal on missing `LLM_API_KEY` (warns) →
      ADK-only deploy boots.
- [x] `.env.example`: rewritten — prominent ADK/Vertex block, Claude tier commented, legacy keys
      demoted.
- [x] Verified: with no `LLM_API_KEY`, app boots; `GEMINI_MODELS={'pro':'gemini-3.1-pro-preview',
      'flash':'gemini-3.5-flash'}`; `init_models()` Gemini-only-safe; ADK routes register.

**Note (not regressions):** the full `tests/` run shows 9 failures = 5 ADK world tests that pass
in isolation but collide under full-suite ordering (shared crucible env state), + 4 pre-existing
stale legacy tests (`fair_loss_mapper` math, `project_manager` mock path, `data_flywheel` asserts
old Firestore positional `.where()` while prod already uses `filter=`). No production regressions.

---

## WS1 — Legacy pipeline → unified `google-genai` SDK ✅

Migrated the primary non-ADK paths to the unified `google-genai` SDK on **Vertex/ADC** (no key).

- [x] `backend/app/utils/llm_client.py`: `OpenAI(...)` → `genai.Client(vertexai=True, project,
      location)`. `chat()`/`chat_json()` signatures unchanged; OpenAI-style messages converted to
      Gen AI `Content` (system → `system_instruction`); JSON mode → `response_mime_type`;
      `last_usage` from `usage_metadata`; OTel spans preserved.
- [x] `backend/app/services/embedding_client.py`: `genai.Client(api_key=…)` → Vertex/ADC.
- [x] `backend/app/services/research_agent.py`: `genai.Client(api_key=…)` → Vertex/ADC.
- [x] `backend/app/services/simulation_config_generator.py`: sync `OpenAI` → shared `LLMClient`
      (Vertex); also guarded a **pre-existing** broken `zep_entity_reader` import so it loads.
- [x] `backend/app/config.py`: `LLM_API_KEY` optional; `LLM_BASE_URL` defaults to the **Gemini**
      OpenAI-compat endpoint (never OpenAI); model defaults → `gemini-3.5-flash` / `-3.1-pro-preview`.
- [x] Verified: Flask app boots with no `LLM_API_KEY`; all migrated clients construct on Vertex;
      ADK suite still 118 passed.

**Scoped out (documented):** `backend/app/services/monte_carlo_engine.py` passes an `AsyncOpenAI`
client into the **legacy CAMEL sim runner** (`run_crucible_simulation_legacy.py`) — the deprecated
statistical-rerun layer the ADK runner supersedes. It stays on the **Gemini OpenAI-compat endpoint**
(still Google/Gemini; needs a key only if you run the full Monte-Carlo report layer). Migrating it
natively means rewriting the legacy CAMEL runner — out of showcase scope.

**Pre-existing rot (NOT from this work):** `zep_entity_reader.py` was deleted in the Zep→Firestore
migration but `simulation_manager.py` + `simulation_config_generator.py` still import it. Doesn't
block app boot or the ADK path; left for separate legacy cleanup.

---

## WS2 — A2A judge as its own Cloud Run service ✅ (code; deploy in WS6/7)

- [x] `judge_service.py` `create_app()`: env-drives `card["endpoint"]` from `A2A_PUBLIC_URL`
      (→ `<url>/a2a`), sets `protocolVersion="1.0.1"`, adds FastAPI CORS (`allow_origins=["*"]`),
      adds `/healthz`. `judge_agent_card.json` → `version`/`protocolVersion` `1.0.1` + `provider`.
- [x] `judge_client.py`: timeout default 30s→**120s** (`A2A_JUDGE_TIMEOUT` override) for Pro + cold start.
- [x] Parity confirmed: orchestrator `_ensure_judge_agent` uses a `BaseAgent` judge directly
      (text→`_parse_judge_text`) and wraps a `.score()` judge in `_JudgeAdapter`; both yield
      `{containment,evidence,communication,business_impact,rationale}`. Orchestrator already opts in
      when `A2A_JUDGE_URL` is set (`runner.py`).
- [x] Verified: CORS imports on starlette 1.2.1; A2A + demo-api tests pass (8/1); `A2A_PUBLIC_URL`
      override + `/healthz` work via TestClient.
- [ ] **Deploy-time (WS6/7):** set `A2A_PUBLIC_URL` (self) on judge service + `A2A_JUDGE_URL`
      (judge URL) on backend. Auth = public + CORS for demo; OIDC path noted in code as the prod option.

---

## WS3 — Track-2 headline number (ADK SimplePromptOptimizer) ✅ (code) — HIGHEST VALUE

- [x] `backend/adk/runner.py` `run()`: captures `report.judge_score["containment"]` per round →
      writes `backend/evals/results/<sim_id>.json` (`{simulation_id, rounds:[{round,containment}],
      total_rounds, total_cost_usd}`; cost best-effort from `CostTracker.load`). Verified: runner
      tests green, JSON produced, feeds `eval_report.py` → "round 7 → round 3, 57.1%" on synthetic data.
- [x] `backend/scripts/refine_prompts.py`: live `run_refinement_loop` now wires ADK
      **`SimplePromptOptimizer`** (Gemini Pro proposer) + a custom **`ContainmentJudgeSampler`**
      that scores candidate prompts by running them tool-less over the evalset and grading with our
      **ContainmentJudge** rubrics — **no `vertexai`/gcp extra, no deprecated SDK**. Pure seam
      `aggregate_rubric_score` unit-covered; dry-run + eval tests green (9 passed).
- [x] `evals/results/.gitignore` ignores generated runs; only `baseline.json`/`refined.json`/
      `eval_report.html` are committable.
- [ ] **Live run (needs Vertex creds + ~$1-2):** `RUN_LIVE_VERTEX=1 uv run python scripts/refine_prompts.py
      --persona ir_lead --rounds 2`, then run baseline vs refined sims + `eval_report.py`, and
      **commit** the 3 artifacts. This is the only WS3 step that needs live Vertex.

---

## WS4 — Demo quick wins ✅

- [x] Un-orphaned war room: new `frontend/app/adk-demo/page.tsx` index (start/open a session) +
      "▸ War Room — ADK Live" link in `AppSidebar.tsx` (mobile + desktop).
- [x] Email world on all defenders: `get_email_toolset()` added to `ir_lead.py` + `soc_analyst.py`
      (ADK suite still 118 passed).
- [x] `opentelemetry-exporter-gcp-trace` added to `pyproject.toml` (imports; `CLOUD_TRACE_ENABLED`
      now exports).
- [x] PagerDuty omission documented in README (one-line re-enable noted).
- [x] Fixed `frontend/lib/adk-client.ts` `API_BASE` fallback (was the unresolvable `api.<host>:<port>`
      guess) → `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_FLASK_API_URL` / `http://localhost:5001`.
- [x] Verified: `tsc --noEmit` clean (0 errors).

---

## WS5 — Containerization (Cloud Run = one port/service) ✅

**DONE:** `docker/Dockerfile.backend` (root context, `PYTHONPATH=/app`, `uv run python -m gunicorn`
— bare `uv run gunicorn` has a spawn quirk), `frontend/Dockerfile` (NEXT_PUBLIC_* build args), root
`.dockerignore` + `.gcloudignore` + `frontend/.dockerignore`, `cloudbuild.{backend,frontend}.yaml`.
Fixed last hardcoded URL (`pipeline/[runId]/page.tsx:142`). **Frontend `pnpm run build` succeeds**
(`/adk-demo` + `/adk-demo/[simId]` in route table); gunicorn + uvicorn module targets load. Judge
Cloud Run command: `uv run python -m uvicorn adk.a2a.judge_service:app --host 0.0.0.0 --port $PORT`.

`docker/Dockerfile.prod` (combined two-port) is **not** Cloud-Run-compatible. Two images; backend
image also serves the judge (different start command).

- [ ] `docker/Dockerfile.backend` (context = **repo root**): `python:3.11-bookworm`, git+ca-certs
      (for `crucible-sim @ git+…`), `uv` on PATH, `uv sync --frozen` → `/app/backend/.venv`,
      `COPY . /app`, **`ENV PYTHONPATH=/app`** (load-bearing — without it the spawned
      `python -m backend.adk.runner` dies with `No module named 'backend'`), gunicorn gthread
      (1 worker / 16 threads / 3600s) `wsgi:app`.
- [ ] Judge reuses image; command → `uvicorn adk.a2a.judge_service:app --host 0.0.0.0 --port $PORT`.
- [ ] `docker/Dockerfile.frontend` (context = `frontend/`): node 20, pnpm, `ARG NEXT_PUBLIC_*` →
      `ENV` before `pnpm build`, `next start`.
- [ ] Fix frontend hardcoded URL `frontend/app/pipeline/[runId]/page.tsx:142` + `NEXT_PUBLIC_*`
      fallbacks (`lib/adk-client.ts`, `app/lib/api.ts`, etc.).
- [ ] `.gcloudignore` (root) excluding `.venv`, `node_modules`, `.next`, `.git`, `backend/uploads`,
      `data/`. `cloudbuild.backend.yaml` (root ctx, `e2-highcpu-8`) + `cloudbuild.frontend.yaml`
      (passes `NEXT_PUBLIC_*` build args).

---

## WS6 — Terraform (Cloud Run + IAM + secrets + Firestore) ✅

**DONE + VALIDATED.** Module at `terraform/` (versions/providers/variables/apis/artifact_registry/
iam/secrets/firestore/run_{backend,judge,frontend}/run_iam/outputs + `.gitignore` +
`terraform.tfvars.example`). `terraform validate` passes; `terraform plan` against `raxit-ai` →
**28 to add, 0 change, 0 destroy** (9 APIs, AR repo, 2 SAs, 4 role bindings, secret + IAM, 4 vector
indexes, 3 Cloud Run v2 services, 3 public IAM). Notes: `google_firestore_database` isn't a data
source in provider 6.x → reference the DB by name string (DB is a project precondition). Judge
`A2A_PUBLIC_URL` set via `judge_public_url` var on a 2nd apply (a service can't reference its own URL;
backend's `A2A_JUDGE_URL` references `judge.uri` directly — acyclic).

Root module `terraform/`, local state (gitignore `*.tfstate*`), provider `hashicorp/google ~> 6.x`.

- [ ] APIs (`google_project_service`): run, artifactregistry, cloudbuild, aiplatform, firestore,
      secretmanager, cloudtrace, iam, compute.
- [ ] Artifact Registry Docker repo `direphish` (us-central1).
- [ ] IAM: SA `direphish-run` (`roles/aiplatform.user`, `datastore.user`,
      `secretmanager.secretAccessor`, `cloudtrace.agent`); minimal `direphish-fe`.
- [ ] Secret Manager: `CLOUDFLARE_API_TOKEN` (+ `LLM_API_KEY` only if WS1 unfinished); versions
      added out-of-band; mounted via `template.containers.env.value_source.secret_key_ref`.
- [ ] Firestore: `data google_firestore_database` (default), 4 `google_firestore_index` with
      `fields{ vector_config{ dimension=768, flat{} } }` (sim_episodes ×3, dossier_chunks ×1).
- [ ] 3 `google_cloud_run_v2_service` (public via `…_iam_member` allUsers/run.invoker):
      - **backend**: cpu=2/mem=4Gi; `scaling.min=max=1`; `template.session_affinity=true`;
        `resources.cpu_idle=false`; `timeout="3600s"`; `startup_cpu_boost=true`; env incl.
        `PYTHONPATH=/app, GOOGLE_GENAI_USE_VERTEXAI=TRUE, GOOGLE_CLOUD_LOCATION=global,
        THREAT_ACTOR_PROVIDER=gemini, A2A_JUDGE_URL=<judge>, CLOUD_TRACE_ENABLED=true`.
      - **judge**: same image, command→uvicorn; cpu=1/mem=2Gi; min=1/max=3; `timeout="600s"`;
        + `A2A_PUBLIC_URL=<self>`.
      - **frontend**: cpu=1/mem=1Gi; min=max=1; session_affinity; `cpu_idle=false`; runtime
        `FLASK_API_URL=<backend>`, `WORKFLOW_TARGET_WORLD=local`. `NEXT_PUBLIC_*` are **build args**.
- [ ] Images as `var.backend_image` / `var.frontend_image` (`:<git-sha>`), built outside TF;
      apply in phases (judge → backend → frontend) so the frontend image bakes the real backend URL.

---

## WS7 — Deploy runbook + verification 🔄

**Live progress on `raxit-ai`:**
- ✅ TF core applied via ADC (9 APIs, AR repo, 2 SAs + IAM, secret + placeholder version). Firestore
  indexes already existed (created by the script earlier) → dropped from TF management.
- ✅ **Crucible packaging blocker fixed (real fix, not a workaround).** First backend Cloud Build
  failed: `crucible-sim` wheel build aborted under hatchling ≥1.8 —
  `tool.hatch.build.targets.wheel.force-include` re-added `crucible/builtins/*` on top of
  `packages=["src/crucible"]`, a duplicate the strict builder rejects. Fixed in
  `raxITlabs/crucible` (removed the redundant force-include), verified the wheel builds + `builtins`
  appears once, pushed to `feature/adk-hooks` @ **`5ebd658`**. Pinned `backend/pyproject.toml` to that
  SHA (also resolves the long-standing "freeze the moving branch" item) + re-locked; local rebuild +
  22 ADK tests green.
- 🔄 Backend image rebuilding in Cloud Build with the fixed crucible.
- ⏳ Then: TF apply judge → backend → build frontend (with backend URL) → TF apply frontend →
  2nd apply `judge_public_url` → smoke test.

### Security pivot — HARDENED architecture (user-chosen)
Org **Domain-Restricted-Sharing** policy blocks `allUsers`, so the public IAM bindings failed
(backend + judge are therefore already private — which we want). Per Google best practice we go
**hardened** instead of relaxing DRS broadly:
- **Judge: private.** Backend→judge over **OIDC** (ID token, audience = judge URL); grant
  `run.invoker` to the backend SA (`direphish-run`) only.
- **Backend: private.** Browser talks **only to the frontend**; Next.js proxies all backend calls
  (REST + SSE) injecting an OIDC token (frontend SA via metadata server); grant `run.invoker` to the
  frontend SA (`direphish-fe`) only. `NEXT_PUBLIC_*` point at the frontend's own `/api/be` proxy.
- **Frontend: only public service.** Still needs a *narrow* `allUsers` exception (DRS blocks
  anonymous regardless) — scope to this one service (+ Cloud Armor optional).
Verified pre-pivot: backend `/health` + `/api/adk/health` + judge AgentCard (1.0.1) all respond
behind an auth token → the image/app/crucible-fix/Vertex/A2A are all working in prod.

### Note: gcloud reauth
Terraform uses ADC (valid); the `gcloud` CLI hit the org reauth policy and needs
`gcloud auth login` (interactive) before Cloud Build / secret-version commands.

### Runbook

```bash
PROJ=raxit-ai; REGION=us-central1; REPO=direphish
GAR=$REGION-docker.pkg.dev/$PROJ/$REPO; SHA=$(git rev-parse --short HEAD)
# 0. Rotate leaked creds. 1. TF core (APIs/registry/SAs/IAM/secrets/firestore).
# 2. gcloud secrets versions add CLOUDFLARE_API_TOKEN. 3. Build backend image (root ctx).
# 4. TF apply judge → capture JUDGE_URI → TF apply backend (A2A_JUDGE_URL) → capture BACKEND_URI.
# 5. Build frontend image with _BACKEND=BACKEND_URI. 6. TF apply frontend. 7. Smoke test.
```

**Verify:** (1) Gemini-only local boot; (2) ADK 2.x tests green; (3) report+MC via google-genai;
(4) `curl $JUDGE_URI/.well-known/agent.json` shows deployed endpoint + 1.0.1, sim logs A2A judge;
(5) committed `eval_report.html` shows real delta; (6) incognito → frontend → sim → SSE hits
`$BACKEND_URI/api/adk/sse/<id>`, MC polling works, CostMeter updates, logs show `[runner] round
1/N`; (7) Cloud Trace nested spans.

**Cost (1 judging week):** ≈ $65–115 (lower if judge/frontend scale to zero between demo sessions).

**Risks:** ADK 2.x regressions (gated by WS0 suite — passed); fat torch image cold start
(`min=1` + boost); in-process SSE + subprocess sim (mitigated by `min=max=1` + affinity +
no-throttle + 3600s; frontend polling is the durable backstop); `allUsers` may be blocked by org
policy on `raxit-ai`; rotate `.env` secrets.

---

## WS7 — HARDENED DEPLOY VERIFIED (2026-06-11)

Images `*:e6a4508-h1` (built from working tree incl. OIDC `judge_client`, `/api/be` proxy,
hardened IAM). `terraform apply` → **3 added** (frontend service, `backend_invoker`,
`judge_invoker`), **2 changed** (backend/judge → new image; backend `A2A_JUDGE_URL`=judge.uri).

Deployed (all revisions Ready, all PRIVATE):
- backend  `https://direphish-backend-tydbxwcdca-uc.a.run.app`  (rev 00002)
- judge    `https://direphish-judge-tydbxwcdca-uc.a.run.app`    (rev 00002, uvicorn cmd)
- frontend `https://direphish-frontend-tydbxwcdca-uc.a.run.app` (rev 00001)

IAM (hardened, least-privilege service-to-service):
- judge.invoker   = `direphish-run` SA  (backend→judge, OIDC via metadata server)
- backend.invoker = `direphish-fe`  SA  (frontend→backend, OIDC via `/api/be` proxy)
- frontend public = **DEFERRED** (`-var frontend_public=false`) until a Domain-Restricted-Sharing
  exception is granted for `direphish-frontend` (org policy blocks `allUsers`).

Verification (via `gcloud run services proxy`, owner creds):
- ✅ backend `/api/adk/health` 200 — `status:ok`, `vertex_env_ready:true`,
     `gemini_models {flash:gemini-3.5-flash, pro:gemini-3.1-pro-preview}`, personas:10
- ✅ anonymous backend = 401 (private enforced)
- ✅ judge `/.well-known/agent.json` 200 — v/protocolVersion 1.0.1, raxIT Labs, score_round schema
     (endpoint still `localhost:8003` — set on 2nd apply via `judge_public_url`, cosmetic)
- ✅ judge `/a2a/score_round` route present (GET→405), reaches FastAPI
- ✅ **KILLER TEST**: frontend `/api/be/api/adk/health` 200 — full chain proven:
     browser→frontend(private)→`/api/be` route→metadata-server OIDC (fe-SA, aud=backend)→
     private backend (fe-SA has invoker)→200
- ✅ frontend home SSR 200 (20KB)
- ✅ POST `/api/be/api/adk/smoke {mode:fake}` 200 — full orchestrator round
     (phases pressure/adversary/defender/judge; adversary+defender actions; judge_score) in-container

NOT yet exercised (needs a LIVE sim, deferred to demo dry-run / post-DRS):
- backend→judge A2A OIDC during a real round (mechanism identical to the proven fe→be path)
- war-room SSE streaming through `/api/be` (proxy streams `upstream.body`)

### Remaining (USER actions — org-admin, not code)
1. **DRS exception** for `direphish-frontend` (or project-wide on `raxit-ai`) → then
   `terraform apply -var frontend_public=true ...` makes the demo URL publicly clickable.
2. **2nd apply** for cosmetic AgentCard endpoint:
   `terraform apply ... -var judge_public_url=https://direphish-judge-tydbxwcdca-uc.a.run.app`
3. **Rotate** real `CLOUDFLARE_API_TOKEN`:
   `printf %s "$TOKEN" | gcloud secrets versions add CLOUDFLARE_API_TOKEN --data-file=- --project raxit-ai`
   (currently `ROTATE_ME` placeholder; only affects web-crawling, not the core demo).

### Still open (separate workstream)
- Track-2 live run (`RUN_LIVE_VERTEX=1`) → commit `backend/evals/results/{baseline,refined}.json` +
  `eval_report.html` (the before/after containment headline).

---

## Track-2 SOLVED + crucible engine fix + demo hardening (2026-06-11, later)

**Root cause of flat containment:** DirePhish MCP worlds advertised observation
tools (read_channel/check_inbox/check_mentions) the crucible engine never
serviced (no schema → no persistence → "Unknown action"). Proven by comparing
`main` (old-gen, 0 action failures) vs ADK branch (54% failures).

**Crucible fix (raxITlabs/crucible `main@2ebe7da`, pushed; 78 tests pass):**
- slack.yaml/email.yaml: add schema (messages/emails + trace tables) → persist.
- ConfigurablePlatform: serve observation_actions via `_observe()` (query state,
  render attributed transcript) + `available_actions()` + loud unknown-action log.
- env._dispatch_to_world: thread actor → messages attributed.
- Branch hygiene: folded feature/adk-hooks (+iumTZ subset) into main; world-
  participants already squash-merged. Nothing lost (clean FF).

**DirePhish (re-pinned to 2ebe7da):**
- `make_defender_team`: observe-then-act protocol (read war-room/inbox free,
  then one informed write), env DIREPHISH_OBSERVE_THEN_ACT (default on).
- `adk/quota_guard.py`: Gemini 429 retry+backoff (DSQ), installed in runner +
  judge service. `runner`: serial defenders (DIREPHISH_SERIAL_DEFENDERS, default on).

**Track-2 result (same-model A/B, flash-lite, 5 rounds, single variable = protocol):**
- baseline (no observe): containment 2,3,3,3,6 mean 3.4 — never contained (round 5).
- optimized (observe): 9,9,9.5,6,7 mean 8.1 — contained round 1.
- **eval_report.html: containment-time round 5 → round 1 (80%).** action-success
  46% → 100%. Artifacts: backend/evals/results/{track2_observe_flashlite,
  track2_noobserve_flashlite}.json, eval_report.html, README.md.
- ADK SimplePromptOptimizer also ran live: IR-Lead rubric 0.025 → 0.41.

**Demo deploy (image e6a4508-h2, applied):** backend + judge redeployed; env
all-flash (GEMINI_PRO_MODEL_NAME=gemini-3.5-flash — pro DSQ pool exhausted on
raxit-ai's tier), serial defenders, 429 backoff. Live smoke (1 round) PASSED:
all-flash confirmed, observation actions succeed in prod (reads return real
transcript), A2A judge scores, 4 phases, zero 429s.

### Still pending (USER)
1. DRS exception for direphish-frontend → flip frontend_public=true + apply.
2. Rotate CLOUDFLARE_API_TOKEN (placeholder ROTATE_ME).
3. Optional: full multi-round sim dry-run via the public war-room once live.
4. Optional: commit the DirePhish working tree (crucible already pushed).
