# Enabling Claude on Vertex Model Garden

DirePhish's threat actor can run on Claude Sonnet for the cross-model
demo signal. Claude-on-Vertex requires per-project enablement.

## Steps

1. Cloud Console → Vertex AI → Model Garden: https://console.cloud.google.com/vertex-ai/model-garden
2. Search "Claude"; click "Claude Sonnet 4.5"
3. Click "Enable" and accept Anthropic's terms of service
4. Wait ~15 minutes for entitlement propagation
5. In `.env`, set:
   ```
   THREAT_ACTOR_PROVIDER=claude
   ```
6. Restart the Flask process (`./start.sh`)

## Verifying

Run a live smoke after restart:
```bash
curl -sS -X POST http://localhost:5001/api/adk/smoke \
  -H 'content-type: application/json' \
  -d '{"round_num":1, "mode":"live", "simulation_id":"claude-test"}' | jq
```

Look for `adversary_action.agent` matching the threat_actor identity
plus backend log lines like:
```
[ADK] live adversary: name=threat_actor model=claude-sonnet-4-5
```

## Cost

Claude Sonnet via Vertex MaaS is ~2-3x the cost of Gemini Pro per
token. Budget ~$0.05-0.10 per round in live mode with all 7 agents.
