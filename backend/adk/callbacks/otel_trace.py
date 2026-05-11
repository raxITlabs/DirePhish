"""OpenTelemetry + optional Cloud Trace exporter for ADK agents.

Gated behind CLOUD_TRACE_ENABLED=true so dev/CI runs without GCP creds
stay clean. Tracer provider is set globally once.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger("direphish.adk.otel")

_INITIALIZED = False


def init_tracing(service_name: str = "direphish-adk-runner") -> None:
    """Configure the OTel tracer provider.

    Idempotent — calling twice is safe (returns early after first call).
    Cloud Trace exporter is attached only when CLOUD_TRACE_ENABLED=true
    AND the optional exporter package is installed. Otherwise we set up
    a basic in-memory provider so spans don't crash.
    """
    global _INITIALIZED
    if _INITIALIZED:
        return

    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider

    provider = TracerProvider()

    if os.environ.get("CLOUD_TRACE_ENABLED", "").lower() == "true":
        try:
            from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter
            from opentelemetry.sdk.trace.export import BatchSpanProcessor

            provider.add_span_processor(BatchSpanProcessor(CloudTraceSpanExporter()))
            logger.info("[otel] Cloud Trace exporter enabled")
        except ImportError as e:
            logger.warning(
                "[otel] CLOUD_TRACE_ENABLED=true but opentelemetry-exporter-gcp-trace "
                "not installed; spans will be local-only. (%s)", e
            )

    trace.set_tracer_provider(provider)
    _INITIALIZED = True
