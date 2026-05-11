"""init_tracing must be a no-op when CLOUD_TRACE_ENABLED is unset."""

import pytest


def test_init_tracing_noop_when_disabled(monkeypatch):
    monkeypatch.delenv("CLOUD_TRACE_ENABLED", raising=False)
    # Reset module-level _INITIALIZED so each test starts fresh
    import importlib
    import adk.callbacks.otel_trace as otel_mod
    otel_mod._INITIALIZED = False
    from adk.callbacks.otel_trace import init_tracing
    # Must not raise, must not require Cloud Trace
    init_tracing(service_name="test")


def test_init_tracing_idempotent(monkeypatch):
    """Calling init_tracing twice in a row is safe."""
    monkeypatch.delenv("CLOUD_TRACE_ENABLED", raising=False)
    import adk.callbacks.otel_trace as otel_mod
    otel_mod._INITIALIZED = False
    from adk.callbacks.otel_trace import init_tracing
    init_tracing(service_name="test")
    init_tracing(service_name="test")  # second call must not raise
