"""
Configuration Management
Loads configuration uniformly from the .env file in the project root directory
"""

import os
from dotenv import load_dotenv

# Load the .env file from the project root directory
# Path: DirePhish/.env (relative to backend/app/config.py)
project_root_env = os.path.join(os.path.dirname(__file__), '../../.env')

if os.path.exists(project_root_env):
    load_dotenv(project_root_env, override=True)
else:
    # If no .env in root directory, try loading environment variables (for production)
    load_dotenv(override=True)


class Config:
    """Flask configuration class"""

    # Flask configuration
    SECRET_KEY = os.environ.get('SECRET_KEY', 'direphish-secret-key')
    DEBUG = os.environ.get('FLASK_DEBUG', 'True').lower() == 'true'
    
    # JSON configuration - disable ASCII escaping so non-ASCII characters display directly (instead of \uXXXX format)
    JSON_AS_ASCII = False
    
    # LLM configuration.
    # Primary paths (report/judge/research/config/embeddings) use the unified
    # google-genai SDK on Vertex AI via ADC — no key needed.
    # LLM_API_KEY / LLM_BASE_URL are used ONLY by the legacy Monte-Carlo
    # statistical-rerun layer (CAMEL sim runner), which talks to Gemini through
    # the OpenAI-compatible endpoint. Default base_url stays on Gemini (never OpenAI).
    LLM_API_KEY = os.environ.get('LLM_API_KEY')
    LLM_BASE_URL = os.environ.get('LLM_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/openai/')
    LLM_MODEL_NAME = os.environ.get('LLM_MODEL_NAME', 'gemini-3.5-flash')
    LLM_PRO_MODEL = os.environ.get('LLM_PRO_MODEL') or os.environ.get('GEMINI_PRO_MODEL_NAME') or 'gemini-3.1-pro-preview'
    LLM_JUDGE_MODEL = os.environ.get('LLM_JUDGE_MODEL') or LLM_MODEL_NAME



    # Google Cloud / Firestore Vector Search
    GCP_PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT', '')
    FIRESTORE_DATABASE = os.environ.get('FIRESTORE_DATABASE', '(default)')
    GEMINI_EMBEDDING_MODEL = os.environ.get('GEMINI_EMBEDDING_MODEL', 'gemini-embedding-001')
    GEMINI_EMBEDDING_DIMENSIONS = int(os.environ.get('GEMINI_EMBEDDING_DIMENSIONS', '768'))

    # Monte Carlo configuration
    MONTE_CARLO_MAX_WORKERS = int(os.environ.get('MONTE_CARLO_MAX_WORKERS', '3'))
    GEMINI_RPM_LIMIT = int(os.environ.get('GEMINI_RPM_LIMIT', '60'))

    # Cloudflare Browser Rendering (web crawling)
    CLOUDFLARE_ACCOUNT_ID = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
    CLOUDFLARE_API_TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN')
    
    # File upload configuration
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), '../uploads')
    ALLOWED_EXTENSIONS = {'pdf', 'md', 'txt', 'markdown'}
    
    # Text processing configuration
    DEFAULT_CHUNK_SIZE = 500  # Default chunk size
    DEFAULT_CHUNK_OVERLAP = 50  # Default overlap size
    
    # OASIS simulation configuration
    OASIS_DEFAULT_MAX_ROUNDS = int(os.environ.get('OASIS_DEFAULT_MAX_ROUNDS', '10'))
    OASIS_SIMULATION_DATA_DIR = os.path.join(os.path.dirname(__file__), '../uploads/simulations')
    
    # OASIS platform available actions configuration
    OASIS_TWITTER_ACTIONS = [
        'CREATE_POST', 'LIKE_POST', 'REPOST', 'FOLLOW', 'DO_NOTHING', 'QUOTE_POST'
    ]
    OASIS_REDDIT_ACTIONS = [
        'LIKE_POST', 'DISLIKE_POST', 'CREATE_POST', 'CREATE_COMMENT',
        'LIKE_COMMENT', 'DISLIKE_COMMENT', 'SEARCH_POSTS', 'SEARCH_USER',
        'TREND', 'REFRESH', 'DO_NOTHING', 'FOLLOW', 'MUTE'
    ]
    
    # Report Agent configuration
    REPORT_AGENT_MAX_TOOL_CALLS = int(os.environ.get('REPORT_AGENT_MAX_TOOL_CALLS', '5'))
    REPORT_AGENT_MAX_REFLECTION_ROUNDS = int(os.environ.get('REPORT_AGENT_MAX_REFLECTION_ROUNDS', '2'))
    REPORT_AGENT_TEMPERATURE = float(os.environ.get('REPORT_AGENT_TEMPERATURE', '0.5'))
    
    @classmethod
    def validate(cls):
        """Validate required configuration.

        The ADK simulation core runs entirely on Vertex AI via ADC and does
        not need ``LLM_API_KEY``. The legacy research/report/Monte-Carlo
        pipeline constructs its LLM client lazily and raises only when
        actually called, so a missing key is a warning — not a fatal boot
        error. This lets ADK-only deploys (e.g. Cloud Run) start cleanly.
        """
        import sys

        if not cls.LLM_API_KEY:
            print(
                "[config] LLM_API_KEY not set — legacy (non-ADK) pipeline "
                "routes will be unavailable; ADK simulation runs via Vertex/ADC.",
                file=sys.stderr,
            )
        return []

