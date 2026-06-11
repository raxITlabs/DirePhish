# ir_lead_refined.txt — provenance

Derived from `adk/agents/personas/ir_lead.py::_IR_LEAD_INSTRUCTION` (baseline).

ADK `SimplePromptOptimizer` (proposer gemini-3.1-pro-preview) was run live over the
26-case `ransomware_containment_v1` evalset, improving the held-out ContainmentJudge
validation score 0.025 → 0.41 (see `evals/results/ir_lead_<ts>/`). The raw optimized
prompt drifted off-domain (a generic "customer support agent"), so it is NOT used
verbatim. Instead the optimizer's genuine, transferable structural findings were
folded into the IR-Lead prompt while preserving the ransomware incident-response
domain:
  1. Strict output discipline — exactly one tool call, no preamble/chatter, hard stop
     after "ROUND COMPLETE." (baseline allowed leading prose → parse failures).
  2. Exact simulation_id/round_num extraction (never invent/increment).
  3. Act-on-confirmed-facts decisiveness + a per-round state-appropriate move.

Headline (eval_report.html) compares full 6-round ransomware sims: baseline prompt
vs this curated prompt, on gemini-3.5-flash defenders (production model).
