# TODOS

## Risk Score Validation Study
**What:** Run DirePhish risk score on 5-10 companies where actual incident response quality is known (from real tabletop exercises or actual incidents). Compare DirePhish scores against reality to validate weight calibration.
**Why:** Score credibility requires empirical validation, not just transparent methodology. Codex flagged this as the biggest strategic risk: shipping a scoring product before proving the score is valid. The FAIR estimates and dimension weights are based on first principles, but have never been tested against ground truth.
**Context:** The 6 dimension weights (Detection 20%, Containment 25%, Communication 15%, Consistency 15%, Compliance 10%, Escalation 15%) are initial estimates. Validation data would allow data-driven weight adjustment.
**Depends on:** V1 risk score shipped and functional.
**Priority:** High (after V1 ship)

## Async /compute for Large Iteration Counts
**What:** Add async option to POST /risk-score/compute (return 202 + poll for result) when iteration count exceeds a threshold (e.g., 200+).
**Why:** At current scale (10-100 iterations), computation takes <1 second synchronously. But DEEP mode at 500+ iterations could push bootstrap + attribution to 5-10 seconds, risking HTTP timeouts. The existing pattern (exercise report uses async + polling) is the model.
**Context:** Bootstrap CI runs 10,000 resamples. Stratified comparison processes up to 10 divergence points. Both scale linearly with iteration count. At 100 iterations: ~100ms total. At 1000: ~1-2 seconds. At 5000: potential timeout.
**Depends on:** V1 risk score shipped + evidence of timeout issues at scale.
**Priority:** Low (only if scale demands it)
