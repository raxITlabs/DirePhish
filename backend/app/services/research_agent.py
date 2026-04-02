# backend/app/services/research_agent.py
"""
Research Agent — gathers company intelligence from Cloudflare /crawl API, web search,
uploaded documents, and LLM synthesis. Produces a structured Company Dossier
and pushes it to Graphiti as a knowledge graph.
"""
import json
import re
import subprocess
import threading
import time
import urllib.parse
from pathlib import Path

import requests

from ..config import Config
from ..utils.llm_client import LLMClient
from ..utils.file_parser import FileParser
from ..utils.cost_tracker import CostTracker
from ..utils.logger import get_logger
from ..utils.console import MissionControl
from . import project_manager

logger = get_logger("research_agent")


def run_research(project_id: str, callback_token: str | None = None) -> None:
    """Run the full research pipeline in a background thread with a 5-minute watchdog."""
    thread = threading.Thread(target=_research_pipeline, args=(project_id,), kwargs={"callback_token": callback_token}, daemon=True)
    thread.start()

    def _watchdog():
        thread.join(timeout=300)
        if thread.is_alive():
            logger.error(f"Research timeout for {project_id} (>5min)")
            try:
                project_manager.update_project(
                    project_id, status="failed",
                    error_message="Research timed out after 5 minutes",
                    progress_message="Research timed out.",
                )
            except Exception:
                pass

    threading.Thread(target=_watchdog, daemon=True).start()


def _research_pipeline(project_id: str, callback_token: str | None = None) -> None:
    """Execute research steps sequentially with progress tracking."""
    MissionControl.phase("RESEARCH", project_id)
    research_log = {"project_id": project_id, "steps": []}
    cost_tracker = CostTracker(project_id)

    def _log_step(name: str, **kwargs):
        """Log a research step with its inputs/outputs."""
        entry = {"step": name, **kwargs}
        research_log["steps"].append(entry)
        # Also log to console for real-time visibility
        size = kwargs.get("output_chars", kwargs.get("chars", ""))
        detail = f" ({size} chars)" if size else ""
        logger.info(f"[{project_id}] {name}{detail}")

    try:
        # Step 1: Web scrape
        project_manager.update_project(project_id, progress=5, progress_message="Scraping company website...")
        project = project_manager.get_project(project_id)
        url = project["company_url"]
        MissionControl.research_step(project_id, f"Crawling {url}...")
        scraped_text = _scrape_website(url)
        _log_step("scrape", input_url=url, output_chars=len(scraped_text),
                  preview=scraped_text[:500])
        MissionControl.research_step(project_id, f"Fetched {len(scraped_text)} chars via scrape")

        # Step 2: Web search
        project_manager.update_project(project_id, progress=25, progress_message="Searching for company intelligence...")
        MissionControl.research_step(project_id, "Gemini grounded search...")
        search_results = _web_search(scraped_text, cost_tracker)
        _log_step("web_search", output_chars=len(search_results),
                  preview=search_results[:500])

        # Step 3: Process uploaded documents
        project_manager.update_project(project_id, progress=45, progress_message="Processing uploaded documents...")
        project_dir = project_manager.get_project_dir(project_id)
        uploaded_files = project.get("uploaded_files", [])
        doc_text = _process_documents(project_dir / "files", uploaded_files)
        _log_step("documents", files=uploaded_files, output_chars=len(doc_text),
                  preview=doc_text[:500] if doc_text else "")

        # Step 4: LLM synthesis
        project_manager.update_project(project_id, progress=55, progress_message="Synthesizing company dossier...")
        MissionControl.research_step(project_id, "Synthesizing dossier...")
        user_context = project.get("user_context", "")
        _log_step("synthesis_input",
                  scraped_chars=len(scraped_text),
                  search_chars=len(search_results),
                  doc_chars=len(doc_text),
                  user_context=user_context or "(none)")
        dossier = _synthesize_dossier(scraped_text, search_results, doc_text, user_context, cost_tracker)
        project_manager.save_dossier(project_id, dossier)
        _log_step("synthesis_output",
                  roles=len(dossier.get("org", {}).get("roles", [])),
                  systems=len(dossier.get("systems", [])),
                  risks=len(dossier.get("risks", [])),
                  events=len(dossier.get("recentEvents", [])),
                  has_security_posture=bool(dossier.get("securityPosture")))

        # Step 5: Push dossier to Firestore memory
        project_manager.update_project(project_id, progress=85, progress_message="Indexing dossier...")
        try:
            from .firestore_memory import FirestoreMemory
            memory = FirestoreMemory(cost_tracker=cost_tracker)
            memory.push_dossier(project_id, dossier)
            MissionControl.research_step(project_id, "Indexed to Firestore", cost=cost_tracker.total_cost())
        except Exception as e:
            logger.warning(f"[{project_id}] Firestore dossier push failed (non-fatal): {e}")
        graph_id = project_id

        # Save research log and costs
        log_path = project_manager.get_project_dir(project_id) / "research_log.json"
        with open(log_path, "w") as f:
            json.dump(research_log, f, indent=2, default=str)
        logger.info(f"[{project_id}] Research log saved to {log_path}")
        cost_tracker.save(str(project_manager.get_project_dir(project_id)))

        project_manager.update_project(
            project_id,
            status="research_complete",
            progress=100,
            progress_message="Research complete.",
            graph_id=graph_id,
        )
        if callback_token:
            from .workflow_callback import resume_workflow_hook
            resume_workflow_hook(callback_token, {"status": "research_complete", "project_id": project_id, "graph_id": graph_id})
    except Exception as e:
        logger.error(f"Research failed for {project_id}: {e}", exc_info=True)
        research_log["error"] = str(e)
        # Save log even on failure
        try:
            log_path = project_manager.get_project_dir(project_id) / "research_log.json"
            with open(log_path, "w") as f:
                json.dump(research_log, f, indent=2, default=str)
        except Exception:
            pass
        project_manager.update_project(
            project_id,
            status="failed",
            error_message=str(e),
            progress_message="Research failed.",
        )
        if callback_token:
            from .workflow_callback import resume_workflow_hook
            resume_workflow_hook(callback_token, {"status": "failed", "error": str(e), "project_id": project_id})


def _scrape_website(url: str) -> str:
    """Scrape company website. Tries Jina Reader first, then Cloudflare, then basic curl."""
    # Try Jina Reader first — clean markdown, no API key needed
    try:
        result = _scrape_jina(url)
        if result and len(result) > 200:
            logger.info(f"Website scraped via Jina Reader ({len(result)} chars)")
            return result
    except Exception as e:
        logger.warning(f"Jina Reader failed for {url}: {e}")

    # Fallback: Cloudflare /crawl API
    try:
        result = _scrape_cloudflare(url)
        if result and len(result) > 200:
            logger.info(f"Website scraped via Cloudflare ({len(result)} chars)")
            return result
    except Exception as e:
        logger.warning(f"Cloudflare crawl failed for {url}: {e}")

    # Last resort: basic curl
    logger.warning(f"Falling back to basic curl for {url}")
    return _scrape_basic(url)


def _scrape_jina(url: str) -> str:
    """Scrape a URL using Jina Reader API — returns clean markdown."""
    resp = requests.get(
        f"https://r.jina.ai/{url}",
        headers={
            "Accept": "text/markdown",
            "X-No-Cache": "true",
        },
        timeout=20,
    )
    resp.raise_for_status()
    main_page = resp.text.strip()

    # Also try key subpages that yield rich graph entities
    pages = [main_page]
    for suffix in [
        "/about", "/about-us",                    # company overview
        "/team", "/our-team", "/leadership",       # org structure, role nodes
        "/management", "/executives",              # senior reporting lines
        "/security", "/trust",                     # compliance + system nodes
        "/careers", "/jobs",                       # departments, tech stack, roles
        "/investors", "/investor-relations",        # size, board, structure
    ]:
        try:
            sub_url = url.rstrip("/") + suffix
            sub_resp = requests.get(
                f"https://r.jina.ai/{sub_url}",
                headers={"Accept": "text/markdown"},
                timeout=10,
            )
            if sub_resp.status_code == 200 and len(sub_resp.text.strip()) > 200:
                pages.append(f"## {suffix.strip('/')}\nURL: {sub_url}\n\n{sub_resp.text.strip()}")
        except Exception:
            pass

    combined = "\n\n---\n\n".join(pages)
    return combined[:20000]


def _scrape_cloudflare(url: str) -> str:
    """Scrape using Cloudflare /crawl API (multi-page crawl)."""
    cf_account_id = Config.CLOUDFLARE_ACCOUNT_ID
    cf_token = Config.CLOUDFLARE_API_TOKEN

    if not cf_account_id or not cf_token:
        return ""

    crawl_url = f"https://api.cloudflare.com/client/v4/accounts/{cf_account_id}/browser-rendering/crawl"
    resp = requests.post(crawl_url, headers={
        "Authorization": f"Bearer {cf_token}",
        "Content-Type": "application/json",
    }, json={
        "url": url,
        "limit": 8,
        "depth": 2,
        "formats": ["markdown"],
        "render": False,
        "crawlPurposes": ["search"],
        "rejectResourceTypes": ["image", "media", "font", "stylesheet"],
        "options": {
            "excludePatterns": ["**/blog/**", "**/news/**", "**/press/**"],
        },
    }, timeout=30)
    resp.raise_for_status()
    job_id = resp.json().get("result")
    if not job_id:
        return ""

    # Poll for completion (max 60s)
    for _ in range(12):
        time.sleep(5)
        poll = requests.get(f"{crawl_url}/{job_id}?limit=1", headers={
            "Authorization": f"Bearer {cf_token}",
        }, timeout=15)
        poll.raise_for_status()
        status = poll.json().get("result", {}).get("status")
        if status != "running":
            break

    # Get full results
    results_resp = requests.get(f"{crawl_url}/{job_id}?status=completed", headers={
        "Authorization": f"Bearer {cf_token}",
    }, timeout=30)
    results_resp.raise_for_status()
    records = results_resp.json().get("result", {}).get("records", [])

    pages = []
    for record in records:
        md = record.get("markdown", "")
        page_url = record.get("url", "")
        title = record.get("metadata", {}).get("title", "")
        if md:
            pages.append(f"## {title}\nURL: {page_url}\n\n{md}")

    combined = "\n\n---\n\n".join(pages)
    return combined[:20000]


def _scrape_basic(url: str) -> str:
    """Last-resort scraper using curl + HTML stripping."""
    try:
        result = subprocess.run(
            ["curl", "-sL", "--max-time", "15", url],
            capture_output=True, text=True, timeout=20
        )
        if result.returncode != 0:
            return f"Failed to fetch {url}"
        html = result.stdout
        text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL)
        text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text[:15000]
    except Exception as e:
        return f"Could not scrape {url}: {e}"


def _web_search(scraped_text: str, cost_tracker: CostTracker = None) -> str:
    """Search for additional company intelligence. Returns combined search results.

    Tries Gemini grounded search first (uses Google Search built-in tool),
    falls back to DuckDuckGo HTML scraping if unavailable.
    """
    # Extract company name from scraped text using a quick LLM call
    llm = LLMClient()
    try:
        company_name = llm.chat(
            [{"role": "user", "content": "Extract ONLY the company name from this text. Return just the name, nothing else:\n\n" + scraped_text[:3000]}]
        ).strip()
        if llm.last_usage and cost_tracker:
            cost_tracker.track_llm("research", llm.model, llm.last_usage["input_tokens"], llm.last_usage["output_tokens"], "extract_company_name")
    except Exception:
        company_name = "the company"

    # Try Gemini grounded search first
    try:
        result = _web_search_gemini(company_name, cost_tracker)
        if result:
            logger.info("Web search completed via Gemini grounded search")
            return result
    except Exception as e:
        logger.warning(f"Gemini grounded search failed, falling back to DuckDuckGo: {e}")

    # Fallback: DuckDuckGo HTML scraping
    return _web_search_duckduckgo(company_name)


def _web_search_gemini(company_name: str, cost_tracker: CostTracker = None) -> str:
    """Use Gemini's built-in Google Search grounding for company research.

    Uses rich natural-language prompts so the model generates optimal search
    queries itself (Google's recommended approach).
    """
    from google import genai
    from google.genai import types

    client = genai.Client(
        api_key=Config.LLM_API_KEY,
        http_options={"timeout": 120_000},  # 120 seconds in milliseconds
    )

    # Rich prompts — the model generates its own search queries from these
    prompts = [
        (
            "security_intel",
            f"Research {company_name}'s cybersecurity profile comprehensively. "
            f"Find: any data breaches, security incidents, or regulatory penalties in the last 3 years with dates and impact. "
            f"What security certifications do they hold (SOC 2, ISO 27001, PCI-DSS, etc.)? "
            f"Do they have a bug bounty program or security disclosure page? "
            f"What security tools or vendors do they publicly mention using? "
            f"Who is their CISO or Head of Information Security, and what is their security team's approximate size? "
            f"Include specific dates, dollar amounts, and number of records affected where available."
        ),
        (
            "tech_and_org",
            f"Research {company_name}'s technology and organizational structure. "
            f"What cloud providers, databases, programming languages, and infrastructure do they use? List as many specific systems as possible. "
            f"Who are the key executives — CEO, CTO, CISO, CFO, Head of Risk, Head of Compliance, General Counsel — with their full names? "
            f"Prioritize security-relevant roles (CISO, VP of Security, Head of Risk, Head of Compliance) over generic business roles. "
            f"For each executive, briefly note what they are responsible for. "
            f"How many employees do they have? What are the major departments? "
            f"What is their annual revenue or funding stage? When were they founded? "
            f"Look at their engineering blog, careers page, and LinkedIn for technology details."
        ),
        (
            "industry_context",
            f"Research {company_name}'s business context for cybersecurity risk assessment. "
            f"What industry are they in and what are the main cyber threats to that industry? "
            f"What sensitive data do they handle (PII, financial, healthcare, etc.)? "
            f"What regulatory frameworks apply to them (GDPR, HIPAA, PCI-DSS, SOX, etc.)? "
            f"What are the top 5-6 cybersecurity risks specific to this company given its industry, size, and public profile? "
            f"Have any competitors or peers in their industry had notable security incidents recently? "
            f"What is their geographic footprint and where do they have offices? "
            f"Based on where they operate, what geopolitical risks could impact them — sanctions, trade restrictions, regional conflicts, "
            f"state-sponsored cyber threats, data sovereignty laws, or political instability? "
            f"Do they have exposure to high-risk regions or supply chain dependencies in geopolitically sensitive areas?"
        ),
        (
            "recent_news",
            f"What are the most significant news stories about {company_name} from the last 6 to 12 months? "
            f"Include: major business developments, leadership changes, acquisitions, layoffs, product launches, "
            f"regulatory actions, lawsuits, earnings surprises, partnerships, and any security or privacy incidents. "
            f"Include any announcements about AI adoption, AI product launches, or AI-related policy changes. "
            f"Include geopolitical events that could impact the company — sanctions, trade wars, regional conflicts, regulatory shifts in countries where they operate. "
            f"For each event, provide the approximate date and why it matters. "
            f"Focus on events that would affect the company's risk profile, reputation, or operations."
        ),
        (
            "ai_and_emerging_tech",
            f"Research {company_name}'s adoption and use of artificial intelligence and emerging technologies. "
            f"Are they building AI-powered products or features? Do they use AI/ML internally for operations, security, or decision-making? "
            f"Have they made public statements, blog posts, or press releases about their AI strategy? "
            f"Have they hired AI/ML leadership roles (Head of AI, VP of Machine Learning, Chief AI Officer)? "
            f"Are they using third-party AI services (OpenAI, Anthropic, Google AI, AWS Bedrock, etc.)? "
            f"What AI-related risks do they face — model security, data poisoning, prompt injection, shadow AI usage, IP leakage through LLMs? "
            f"Have there been any controversies or incidents related to their AI use? "
            f"Also note any emerging technology adoption that creates new attack surface: IoT deployments, blockchain, edge computing, or quantum readiness initiatives."
        ),
    ]

    results = []
    for label, prompt in prompts:
        try:
            logger.info(f"Gemini search [{label}]: sending query for {company_name}")
            response = client.models.generate_content(
                model=Config.LLM_MODEL_NAME,
                contents=prompt,
                config=types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearch())],
                    temperature=0.2,
                ),
            )
            text = response.text or ""

            # Extract source URLs and search queries used
            sources = ""
            search_queries_used = []
            if response.candidates and response.candidates[0].grounding_metadata:
                meta = response.candidates[0].grounding_metadata
                chunks = meta.grounding_chunks or []
                urls = [c.web.uri for c in chunks if hasattr(c, "web") and c.web and c.web.uri]
                if urls:
                    sources = "\nSources: " + ", ".join(urls[:8])
                search_queries_used = meta.web_search_queries or []

            if search_queries_used:
                logger.info(f"Gemini search [{label}]: model searched for: {search_queries_used}")
            logger.info(f"Gemini search [{label}]: got {len(text)} chars, {len(sources.split(', ')) if sources else 0} sources")

            # Track costs
            if cost_tracker:
                if search_queries_used:
                    cost_tracker.track_search("research", len(search_queries_used), f"grounded_search_{label}")
                if hasattr(response, "usage_metadata") and response.usage_metadata:
                    um = response.usage_metadata
                    cost_tracker.track_llm(
                        "research", Config.LLM_MODEL_NAME,
                        getattr(um, "prompt_token_count", 0) or 0,
                        getattr(um, "candidates_token_count", 0) or 0,
                        f"grounded_search_{label}",
                    )

            results.append(f"## {label}\n{text[:4000]}{sources}\n")

        except Exception as e:
            logger.warning(f"Gemini search [{label}] failed: {e}")
            results.append(f"## {label}\n(Search failed: {e})\n")

    return "\n---\n".join(results)


def _web_search_duckduckgo(company_name: str) -> str:
    """Fallback: search via DuckDuckGo lite HTML scraping."""
    queries = [
        f'"{company_name}" security incident OR data breach',
        f'"{company_name}" technology stack engineering',
        f'"{company_name}" org structure leadership team',
    ]

    results = []
    for query in queries:
        try:
            encoded_query = urllib.parse.quote_plus(query)
            search_result = subprocess.run(
                ["curl", "-sL", "--max-time", "10",
                 f"https://lite.duckduckgo.com/lite/?q={encoded_query}"],
                capture_output=True, text=True, timeout=15
            )
            if search_result.returncode == 0:
                text = re.sub(r"<[^>]+>", " ", search_result.stdout)
                text = re.sub(r"\s+", " ", text).strip()
                results.append(f"Search: {query}\n{text[:3000]}\n")
        except Exception as e:
            logger.warning(f"Search failed for '{query}': {e}")
            results.append(f"Search: {query}\nFailed: {e}\n")

    return "\n---\n".join(results)


def _process_documents(files_dir: Path, filenames: list[str]) -> str:
    """Extract text from uploaded PDF/MD/TXT files using existing FileParser."""
    if not filenames:
        return ""
    file_paths = [str(files_dir / f) for f in filenames if (files_dir / f).exists()]
    if not file_paths:
        return ""
    return FileParser.extract_from_multiple(file_paths)


def _synthesize_dossier(scraped: str, search: str, docs: str, user_context: str, cost_tracker: CostTracker = None) -> dict:
    """Use LLM to synthesize a structured Company Dossier from all gathered data."""
    llm = LLMClient()

    prompt = f"""You are a corporate intelligence analyst. Analyze the following data about a company and produce a structured Company Dossier as JSON.

## Scraped Website Content
{scraped[:12000]}

## Web Search Results
{search[:16000]}

## Uploaded Documents
{docs[:5000] if docs else "None provided."}

## User Context
{user_context if user_context else "None provided."}

## Output Format
Return ONLY valid JSON matching this exact structure. Fields marked "// optional" can be omitted if data is unavailable.
{{
  "company": {{
    "name": "Company Name",
    "industry": "industry sector",
    "size": "small|medium|large",
    "products": ["product1", "product2"],
    "geography": "regions of operation",
    "publicCompany": true/false,
    "employeeCount": 1000,               // optional — approximate headcount
    "foundedYear": 2010,                  // optional
    "revenue": "$100M",                   // optional — latest known annual revenue
    "website": "https://example.com",     // optional
    "description": "One-line summary"     // optional
  }},
  "org": {{
    "departments": ["Dept1", "Dept2"],
    "roles": [
      {{
        "title": "Role Title",
        "department": "Department",
        "reportsTo": "Manager Role",
        "name": "Person Name",            // optional — real name if publicly known
        "responsibilities": "Brief desc"  // optional
      }}
    ]
  }},
  "systems": [
    {{
      "name": "System Name",
      "category": "database|infrastructure|application|security|communication|cloud|cicd|identity",
      "criticality": "low|medium|high|critical",
      "vendor": "Vendor Name",            // optional
      "description": "What it does"       // optional
    }}
  ],
  "compliance": ["GDPR", "PCI-DSS", "SOC 2"],
  "risks": [
    {{
      "name": "Risk Name",
      "likelihood": "low|medium|high",
      "impact": "low|medium|high|critical",
      "description": "Detailed description of the risk",            // optional
      "affectedSystems": ["System Name from systems list above"],   // optional — MUST be an array of strings
      "mitigations": ["Mitigation 1", "Mitigation 2"]              // optional — MUST be an array of strings, not a single string
    }}
  ],
  "recentEvents": [
    {{
      "date": "YYYY-MM-DD",
      "description": "Event description",
      "source": "news|document|inferred",
      "category": "breach|acquisition|leadership_change|regulatory|product_launch|layoff|other",  // optional
      "impact": "Description of business impact"  // optional
    }}
  ],
  "securityPosture": {{                          // optional — entire section
    "certifications": ["ISO 27001", "SOC 2"],    // optional
    "securityTeamSize": 10,                      // optional — approximate
    "securityTools": ["CrowdStrike", "Splunk"],  // optional
    "incidentResponsePlan": true,                // optional — boolean
    "bugBountyProgram": false                    // optional — boolean
  }},
  "vendorEntities": [
    {{
      "name": "Vendor Name",
      "category": "security|cloud|infrastructure|saas|consulting|networking|identity",
      "criticality": "low|medium|high|critical",
      "systemsProvided": ["System Name 1", "System Name 2"],
      "contractType": "subscription|license|managed_service",  // optional
      "singlePointOfFailure": true                             // optional — true if no alternative vendor
    }}
  ],
  "dataFlows": [
    {{
      "source": "Source System Name",
      "target": "Target System Name",
      "dataTypes": ["PII", "financial", "credentials", "logs", "operational"],
      "protocol": "API/REST|gRPC|JDBC|SFTP|streaming|internal",  // optional
      "encrypted": true,                                          // optional
      "frequency": "real-time|batch|hourly|daily"                 // optional
    }}
  ],
  "accessMappings": [
    {{
      "role": "Role Title from org.roles",
      "systems": ["System Name 1", "System Name 2"],
      "privilegeLevel": "admin|read-write|read-only|operator",
      "mfaRequired": true                                         // optional
    }}
  ],
  "networkTopology": [
    {{
      "zone": "Zone Name",
      "systems": ["System Name 1", "System Name 2"],
      "exposedToInternet": true,
      "connectedZones": ["Other Zone Name"]                       // optional
    }}
  ]
}}

IMPORTANT GUIDELINES:
- For securityPosture, extract from security/trust pages and search results. If not available, infer from company size and industry.
- For roles, PRIORITIZE security-relevant positions: CISO, Head of Risk, Head of Compliance, VP of Security, SOC Manager, General Counsel, SOC Analyst, IR Lead. Include their real names and responsibilities where publicly known. Generic "Partner" roles are less useful than security/risk roles.
- For systems, include at least: their cloud provider, primary database, SIEM/monitoring tool, identity provider, communication tools (Slack/Teams/email), CI/CD pipeline, firewall/WAF, and backup systems. Infer from industry norms if not explicitly found.
- For risks, return 6-8 risks specific to this company. The "mitigations" and "affectedSystems" fields MUST be arrays of strings, never a single string.
- For recentEvents, include ALL newsworthy events from the last 6-12 months: regulatory actions, breaches, leadership changes, acquisitions, layoffs, product launches, lawsuits, earnings. Aim for 6-8 events.
- For vendorEntities, extract EVERY third-party vendor referenced in systems. Mark singlePointOfFailure=true if the company has no alternative for that vendor's service. Cross-reference systemsProvided with the systems list.
- For dataFlows, map how sensitive data moves between systems. Every system that stores PII, financial data, or credentials should have at least one inbound and one outbound flow. Infer from industry norms where not explicit.
- For accessMappings, map which roles have access to which systems. Security roles should have broad read access. Admin/operator access should be limited to relevant system owners. Infer from role responsibilities.
- For networkTopology, define at least: a DMZ/edge zone (internet-facing), an internal/corporate zone, and a data/backend zone. Map systems to their zones based on their category and exposure. Cloud systems go in a cloud VPC zone.
- Be thorough but realistic. If information is not available, make reasonable inferences based on the industry and company size.

MINIMUMS: at least 12 roles with names, 12 systems with vendors, 3 compliance frameworks, 8 risks with descriptions, 8 recent events, 4 vendors, 6 data flows, 6 access mappings, and 3 network zones."""

    dossier = llm.chat_json([{"role": "user", "content": prompt}], max_tokens=8192)
    if cost_tracker and llm.last_usage:
        cost_tracker.track_llm("research", llm.model, llm.last_usage["input_tokens"], llm.last_usage["output_tokens"], "synthesize_dossier")
    return dossier


