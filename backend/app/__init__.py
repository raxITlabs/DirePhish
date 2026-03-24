"""
DirePhish Backend - Flask Application Factory
"""

import os
import warnings

# Suppress multiprocessing resource_tracker warnings (from third-party libraries like transformers)
# Must be set before all other imports
warnings.filterwarnings("ignore", message=".*resource_tracker.*")

from flask import Flask, request
from flask_cors import CORS

from .config import Config
from .utils.logger import setup_logger, get_logger

# Initialize OpenTelemetry tracing
try:
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanExporter, ConsoleSpanExporter
    from opentelemetry.sdk.resources import Resource

    resource = Resource.create({"service.name": "direphish-backend", "service.version": "1.0.0"})
    provider = TracerProvider(resource=resource)

    # Export to console in dev (add OTLP exporter for production)
    otel_endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    if otel_endpoint:
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        provider.add_span_processor(BatchSpanExporter(OTLPSpanExporter(endpoint=otel_endpoint)))
    # Always set the provider so spans are recorded
    trace.set_tracer_provider(provider)
except ImportError:
    pass  # OTel packages not installed — tracing disabled


def create_app(config_class=Config):
    """Flask application factory function"""
    app = Flask(__name__)
    app.config.from_object(config_class)
    
    # Set JSON encoding: ensure non-ASCII characters display directly (instead of \uXXXX format)
    # Flask >= 2.3 uses app.json.ensure_ascii, older versions use JSON_AS_ASCII config
    if hasattr(app, 'json') and hasattr(app.json, 'ensure_ascii'):
        app.json.ensure_ascii = False
    
    # Set up logging
    logger = setup_logger('direphish')
    
    # Only print startup info in the reloader subprocess (to avoid printing twice in debug mode)
    is_reloader_process = os.environ.get('WERKZEUG_RUN_MAIN') == 'true'
    debug_mode = app.config.get('DEBUG', False)
    should_log_startup = not debug_mode or is_reloader_process
    
    if should_log_startup:
        logger.info("DirePhish Backend starting...")
    
    # Enable CORS
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    
    # Register simulation process cleanup function (ensure all simulation processes are terminated when the server shuts down)
    try:
        from .services.simulation_runner import SimulationRunner
        SimulationRunner.register_cleanup()
        if should_log_startup:
            logger.info("Simulation process cleanup function registered")
    except ImportError:
        if should_log_startup:
            logger.info("OASIS SimulationRunner not available (Zep deps removed)")
    
    # Suppress noisy Werkzeug request logs for polling endpoints
    import logging as _logging
    werkzeug_logger = _logging.getLogger('werkzeug')

    class _QuietPollingFilter(_logging.Filter):
        """Suppress repetitive polling endpoint logs."""
        QUIET_PATHS = ('/health', '/api/crucible/simulations/', '/api/crucible/monte-carlo/')
        QUIET_SUFFIXES = ('/status', '/actions', '/stream')

        def filter(self, record: _logging.LogRecord) -> bool:
            msg = record.getMessage()
            # Suppress GET polling requests that spam the console
            if 'GET' in msg:
                for path in self.QUIET_PATHS:
                    if path in msg:
                        for suffix in self.QUIET_SUFFIXES:
                            if suffix in msg:
                                return False
            return True

    werkzeug_logger.addFilter(_QuietPollingFilter())

    # Request logging middleware — only log meaningful requests
    @app.before_request
    def log_request():
        logger = get_logger('direphish.request')
        logger.debug(f"Request: {request.method} {request.path}")
        if request.content_type and 'json' in request.content_type:
            logger.debug(f"Request body: {request.get_json(silent=True)}")

    @app.after_request
    def log_response(response):
        logger = get_logger('direphish.request')
        logger.debug(f"Response: {response.status_code}")
        return response
    
    # Register blueprints
    from .api import graph_bp, simulation_bp, report_bp
    app.register_blueprint(graph_bp, url_prefix='/api/graph')
    app.register_blueprint(simulation_bp, url_prefix='/api/simulation')
    app.register_blueprint(report_bp, url_prefix='/api/report')

    from .api.crucible import crucible_bp
    app.register_blueprint(crucible_bp, url_prefix='/api/crucible')

    # Health check
    @app.route('/health')
    def health():
        return {'status': 'ok', 'service': 'DirePhish Backend'}
    
    if should_log_startup:
        # Check feature availability
        features = []
        try:
            from .services.firestore_memory import FirestoreMemory
            features.append("Firestore Memory")
        except Exception:
            pass
        try:
            from .services.monte_carlo_engine import MonteCarloEngine
            features.append("Monte Carlo Engine")
        except Exception:
            pass
        try:
            from .services.adversarial_agent import partition_agents
            features.append("Adversarial Agents")
        except Exception:
            pass
        try:
            from .services.counterfactual_engine import CounterfactualEngine
            features.append("Counterfactual Branching")
        except Exception:
            pass

        from .utils.console import MissionControl
        MissionControl.banner(
            features=features,
            gcp_project=Config.GCP_PROJECT_ID,
            embedding_model=Config.GEMINI_EMBEDDING_MODEL,
            embedding_dims=Config.GEMINI_EMBEDDING_DIMENSIONS,
            max_workers=Config.MONTE_CARLO_MAX_WORKERS,
            rpm_limit=Config.GEMINI_RPM_LIMIT,
        )

    return app

