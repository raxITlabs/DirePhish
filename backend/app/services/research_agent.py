# backend/app/services/research_agent.py
"""
Research Agent — gathers company intelligence from Cloudflare /crawl API, web search,
uploaded documents, and LLM synthesis. Produces a structured Company Dossier
and pushes it to Zep as a knowledge graph.
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
from ..utils.logger import get_logger
from . import project_manager

logger = get_logger("research_agent")


def run_research(project_id: str) -> None:
    """Run the full research pipeline in a background thread."""
    thread = threading.Thread(target=_research_pipeline, args=(project_id,), daemon=True)
    thread.start()


def _research_pipeline(project_id: str) -> None:
    """Execute research steps sequentially with progress tracking."""
    try:
        # Step 1: Web scrape
        project_manager.update_project(project_id, progress=5, progress_message="Scraping company website...")
        project = project_manager.get_project(project_id)
        scraped_text = _scrape_website(project["company_url"])

        # Step 2: Web search
        project_manager.update_project(project_id, progress=25, progress_message="Searching for company intelligence...")
        search_results = _web_search(scraped_text)

        # Step 3: Process uploaded documents
        project_manager.update_project(project_id, progress=45, progress_message="Processing uploaded documents...")
        project_dir = project_manager.get_project_dir(project_id)
        doc_text = _process_documents(project_dir / "files", project.get("uploaded_files", []))

        # Step 4: LLM synthesis
        project_manager.update_project(project_id, progress=55, progress_message="Synthesizing company dossier...")
        user_context = project.get("user_context", "")
        dossier = _synthesize_dossier(scraped_text, search_results, doc_text, user_context)
        project_manager.save_dossier(project_id, dossier)

        # Step 5: Push to Zep
        project_manager.update_project(project_id, progress=85, progress_message="Building knowledge graph...")
        graph_id = _push_to_zep(project_id, dossier)

        project_manager.update_project(
            project_id,
            status="research_complete",
            progress=100,
            progress_message="Research complete.",
            graph_id=graph_id,
        )
    except Exception as e:
        logger.error(f"Research failed for {project_id}: {e}")
        project_manager.update_project(
            project_id,
            status="failed",
            error_message=str(e),
            progress_message="Research failed.",
        )


def _scrape_website(url: str) -> str:
    """Scrape company website using Cloudflare /crawl API. Returns markdown content."""
    cf_account_id = Config.CLOUDFLARE_ACCOUNT_ID
    cf_token = Config.CLOUDFLARE_API_TOKEN

    if not cf_account_id or not cf_token:
        logger.warning("Cloudflare credentials not configured, falling back to basic fetch")
        return _scrape_basic(url)

    try:
        # Step 1: Initiate crawl job
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
            return _scrape_basic(url)

        # Step 2: Poll for completion (max 60s)
        for _ in range(12):
            time.sleep(5)
            poll = requests.get(f"{crawl_url}/{job_id}?limit=1", headers={
                "Authorization": f"Bearer {cf_token}",
            }, timeout=15)
            poll.raise_for_status()
            status = poll.json().get("result", {}).get("status")
            if status != "running":
                break

        # Step 3: Get full results
        results_resp = requests.get(f"{crawl_url}/{job_id}?status=completed", headers={
            "Authorization": f"Bearer {cf_token}",
        }, timeout=30)
        results_resp.raise_for_status()
        records = results_resp.json().get("result", {}).get("records", [])

        # Combine markdown from all crawled pages
        pages = []
        for record in records:
            md = record.get("markdown", "")
            page_url = record.get("url", "")
            title = record.get("metadata", {}).get("title", "")
            if md:
                pages.append(f"## {title}\nURL: {page_url}\n\n{md}")

        combined = "\n\n---\n\n".join(pages)
        return combined[:20000] if combined else _scrape_basic(url)

    except Exception as e:
        logger.warning(f"Cloudflare crawl failed for {url}: {e}, falling back to basic fetch")
        return _scrape_basic(url)


def _scrape_basic(url: str) -> str:
    """Fallback scraper using curl when Cloudflare is not available."""
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


def _web_search(scraped_text: str) -> str:
    """Search for additional company intelligence. Returns combined search results."""
    # Extract company name from scraped text using a quick LLM call
    llm = LLMClient()
    try:
        company_name = llm.chat(
            [{"role": "user", "content": "Extract ONLY the company name from this text. Return just the name, nothing else:\n\n" + scraped_text[:3000]}]
        ).strip()
    except Exception:
        company_name = "the company"

    # Build search queries
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


def _synthesize_dossier(scraped: str, search: str, docs: str, user_context: str) -> dict:
    """Use LLM to synthesize a structured Company Dossier from all gathered data."""
    llm = LLMClient()

    prompt = f"""You are a corporate intelligence analyst. Analyze the following data about a company and produce a structured Company Dossier as JSON.

## Scraped Website Content
{scraped[:8000]}

## Web Search Results
{search[:5000]}

## Uploaded Documents
{docs[:5000] if docs else "None provided."}

## User Context
{user_context if user_context else "None provided."}

## Output Format
Return ONLY valid JSON matching this exact structure:
{{
  "company": {{
    "name": "Company Name",
    "industry": "industry sector",
    "size": "small|medium|large",
    "products": ["product1", "product2"],
    "geography": "regions of operation",
    "publicCompany": true/false
  }},
  "org": {{
    "departments": ["Dept1", "Dept2"],
    "roles": [
      {{ "title": "Role Title", "department": "Department", "reportsTo": "Manager Role" }}
    ]
  }},
  "systems": [
    {{ "name": "System Name", "category": "database|infrastructure|application|security|communication", "criticality": "low|medium|high|critical" }}
  ],
  "compliance": ["GDPR", "PCI-DSS", "SOC 2"],
  "risks": [
    {{ "name": "Risk Name", "likelihood": "low|medium|high", "impact": "low|medium|high|critical" }}
  ],
  "recentEvents": [
    {{ "date": "YYYY-MM-DD", "description": "Event description", "source": "news|document|inferred" }}
  ]
}}

Be thorough but realistic. If information is not available, make reasonable inferences based on the industry and company size. Include at least 5 roles, 3 systems, 2 compliance frameworks, and 3 risks."""

    dossier = llm.chat_json([{"role": "user", "content": prompt}])
    return dossier


def _push_to_zep(project_id: str, dossier: dict) -> str:
    """Push the dossier to Zep as a knowledge graph. Returns the graph ID."""
    from zep_cloud.client import Zep
    from zep_cloud.types import EpisodeData

    client = Zep(api_key=Config.ZEP_API_KEY)
    graph_id = f"crucible_{project_id}"

    # Push company info as an episode
    company = dossier.get("company", {})
    company_text = (
        f"Company: {company.get('name', 'Unknown')}. "
        f"Industry: {company.get('industry', 'Unknown')}. "
        f"Size: {company.get('size', 'Unknown')}. "
        f"Products: {', '.join(company.get('products', []))}. "
        f"Geography: {company.get('geography', 'Unknown')}."
    )

    # Push org structure as episodes
    org_texts = []
    for role in dossier.get("org", {}).get("roles", []):
        org_texts.append(
            f"{role['title']} works in {role['department']} department and reports to {role['reportsTo']}."
        )

    # Push systems
    system_texts = []
    for sys in dossier.get("systems", []):
        system_texts.append(
            f"System: {sys['name']} ({sys['category']}, criticality: {sys['criticality']})."
        )

    # Push compliance
    compliance_text = f"Compliance requirements: {', '.join(dossier.get('compliance', []))}."

    # Push risks
    risk_texts = []
    for risk in dossier.get("risks", []):
        risk_texts.append(
            f"Risk: {risk['name']} (likelihood: {risk['likelihood']}, impact: {risk['impact']})."
        )

    # Push recent events
    event_texts = []
    for event in dossier.get("recentEvents", []):
        event_texts.append(f"Event ({event['date']}): {event['description']} [source: {event['source']}].")

    # Combine all into episodes and push
    all_texts = [company_text] + org_texts + system_texts + [compliance_text] + risk_texts + event_texts

    for i, text in enumerate(all_texts):
        try:
            client.graph.add(
                graph_id=graph_id,
                data=text,
                type="text",
            )
        except Exception as e:
            logger.warning(f"Failed to push episode {i} to Zep: {e}")

    return graph_id
