# Changelog

All notable changes to DirePhish will be documented in this file.

## [0.1.0.0] - 2026-03-31 — Risk Score, Pipeline Modes, MC Stress Testing

First versioned release. Exercise reports now include a 5th tab with quantitative risk scoring, the pipeline supports 4 operational modes, and Monte Carlo stress testing shows full variation details.

### Added

- **Risk score engine** with FAIR loss mapping and 6-dimension composite scoring. Compute a quantified risk score from Monte Carlo simulation data, complete with confidence intervals and P10/P90 loss estimates.
- **Risk Score tab** in the exercise report (5th tab) showing score ring, FAIR loss card, risk drivers, and score dimensions.
- **Risk score API endpoints** for compute, retrieve, and compare operations with Firestore persistence and per-iteration caching.
- **4-tier pipeline modes** (test/quick/standard/deep) with time estimates and plain-language descriptions so users can choose the right tradeoff between speed and depth.
- **MC variation details** visible during stress testing. Each Monte Carlo iteration now shows its full description, outcome, and how it differs from other runs.
- **4-view exercise report** with MC aggregation, resilience scoring, NIST SP 800-61r2 playbook, and cross-scenario analysis.
- **Start script for frontend production** build.

### Fixed

- Firestore `.where()` calls migrated to `FieldFilter` API (fixes deprecation warnings).
- MiniGraph fetches graph data via server action instead of broken relative URL.
- Risk score endpoint now uses correct path for MC aggregation data.
- Firestore SERVER_TIMESTAMP sentinel no longer mutates the score document before storage.
- Pipeline polling uses WDK durable sleep for reliability.
- Right panel rounded corners now match left sidebar.
- C2-channel world preserved when capping worlds by mode.

### Changed

- Mode selector shows time estimates and plain-language descriptions for each pipeline tier.
- Pipeline stages panel improved with better status indicators.
