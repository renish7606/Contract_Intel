"""Low-volume external-context router for contract clauses."""
import logging
import os
import time
from typing import TypedDict

from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field
from tavily import TavilyClient

logger = logging.getLogger(__name__)
# Optional separate development key keeps router experiments isolated from the
# main analysis quota. It falls back to the existing key when unset.
GOOGLE_API_KEY = (os.getenv("GEMINI_ROUTER_API_KEY") or os.getenv("GOOGLE_API_KEY")
                  or os.getenv("GEMINI_API_KEY"))
GEMINI_MODEL = (os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite").strip().rstrip(",").strip()
                or "gemini-2.5-flash-lite")

_EXTERNAL_CATEGORIES = {
    "non solicitation", "non solicit of employees", "no solicit of employees",
    "no solicitation of employees", "non compete",
    "limitation of liability", "cap on liability", "indemnification",
    "governing law", "ip ownership assignment", "ip assignment",
}

def _normalise_category(category: str) -> str:
    return " ".join((category or "").lower().replace("_", " ").replace("-", " ").split())

def should_route_to_external(clause_category: str, risk_level: str) -> bool:
    return (_normalise_category(clause_category) in _EXTERNAL_CATEGORIES
            and (risk_level or "").upper() in {"MEDIUM", "HIGH"})

class RouterResult(BaseModel):
    needs_external: bool = Field(description="Whether external context is relevant.")
    legal_context: str | None = Field(default=None, description="One to three concise sentences.")
    sources_hint: str | None = Field(default=None, description="Supporting result URLs.")

class RouterState(TypedDict, total=False):
    clause_text: str
    clause_category: str
    risk_explanation: str
    governing_law: str
    risk_level: str
    deadline: float
    search_query: str
    search_results: list[dict]
    needs_external: bool
    legal_context: str
    sources: list[str]

def _deadline_expired(state: RouterState) -> bool:
    deadline = state.get("deadline")
    return deadline is not None and time.monotonic() >= deadline

def _get_llm():
    if not GOOGLE_API_KEY:
        raise RuntimeError("GOOGLE_API_KEY / GEMINI_API_KEY is not configured.")
    return ChatGoogleGenerativeAI(model=GEMINI_MODEL, google_api_key=GOOGLE_API_KEY,
                                  temperature=0, max_retries=0)

def _make_search_query(state: RouterState) -> str:
    category = _normalise_category(state.get("clause_category", "contract clause"))
    law = state.get("governing_law") or "applicable law"
    concepts = {
        "non solicitation": "employee non-solicitation restraint of trade enforceability",
        "non solicit of employees": "employee non-solicitation restraint of trade enforceability",
        "no solicit of employees": "employee non-solicitation restraint of trade enforceability",
        "no solicitation of employees": "employee non-solicitation restraint of trade enforceability",
        "non compete": "employee non-compete restraint of trade enforceability",
        "cap on liability": "contract limitation of liability enforceability",
        "limitation of liability": "contract limitation of liability enforceability",
        "indemnification": "contract indemnification scope enforceability",
        "governing law": "contract governing law jurisdiction dispute enforcement",
        "ip ownership assignment": "contract intellectual property assignment ownership enforceability",
        "ip assignment": "contract intellectual property assignment ownership enforceability",
    }
    return f"{concepts.get(category, category)} {law}".strip()

def web_search(state: RouterState) -> dict:
    tavily_api_key = (os.getenv("TAVILY_API_KEY") or "").strip()
    if _deadline_expired(state) or not tavily_api_key:
        return {"search_results": []}
    query = _make_search_query(state)
    response = TavilyClient(api_key=tavily_api_key).search(
        query=query, search_depth="advanced", max_results=5, include_answer=False)
    results = []
    for item in response.get("results", [])[:5]:
        url = (item.get("url") or "").strip()
        if url:
            results.append({"title": (item.get("title") or "").strip(), "url": url,
                            "content": (item.get("content") or "").strip()})
    return {"search_query": query, "search_results": results}

def synthesize(state: RouterState) -> dict:
    results = state.get("search_results") or []
    if _deadline_expired(state) or not results:
        return {"needs_external": False, "legal_context": "", "sources": []}
    source_text = "\n\n".join(f"SOURCE {i}\nURL: {r['url']}\nCONTENT: {r['content'][:3000]}"
                                for i, r in enumerate(results, 1))
    prompt = f"""Assess and summarize external context for this contract clause.
Return JSON matching the schema. Set needs_external=true whenever real-world legal,
regulatory, or industry context would meaningfully add to the existing risk explanation.
This includes general enforceability considerations under the governing law, even when
no specific statute is available. Prefer true over false when the search results contain
relevant legal or industry information. If false, legal_context must be null. If true,
write 1-3 concise sentences using only supplied sources and put supporting URLs in
sources_hint. Do not invent legal rules.
Category: {state.get('clause_category', '')}
Governing law: {state.get('governing_law') or 'Not specified'}
Clause: {state.get('clause_text', '')}
Existing risk explanation: {state.get('risk_explanation', '')}
Search results:\n{source_text}"""
    result = _get_llm().with_structured_output(RouterResult, method="json_schema").invoke(prompt)
    urls = [r["url"] for r in results]
    hinted = result.sources_hint or ""
    valid_sources = [url for url in urls if url in hinted]
    context = (result.legal_context or "").strip() if result.needs_external else ""
    if context and not valid_sources:
        valid_sources = urls[:1]
    return {"needs_external": bool(result.needs_external), "legal_context": context,
            "sources": valid_sources}

def build_router_graph():
    graph = StateGraph(RouterState)
    graph.add_node("web_search", web_search)
    graph.add_node("synthesize", synthesize)
    graph.add_edge(START, "web_search")
    graph.add_edge("web_search", "synthesize")
    graph.add_edge("synthesize", END)
    return graph.compile()

router_graph = build_router_graph()

def run_external_context_router(*, clause_text: str, clause_category: str,
                                risk_explanation: str, governing_law: str,
                                risk_level: str = "HIGH", deadline: float | None = None) -> dict:
    if not should_route_to_external(clause_category, risk_level):
        return {"needs_external": False, "reason": "Category/risk gate skipped this clause.",
                "search_query": "", "legal_context": "", "sources": []}
    state: RouterState = {"clause_text": clause_text, "clause_category": clause_category,
                          "risk_explanation": risk_explanation, "governing_law": governing_law,
                          "risk_level": risk_level, "deadline": deadline or time.monotonic() + 10}
    try:
        result = router_graph.invoke(state)
        return {"needs_external": bool(result.get("needs_external")),
                "reason": "Rule-based category gate passed.",
                "search_query": result.get("search_query", _make_search_query(state)),
                "legal_context": result.get("legal_context", ""), "sources": result.get("sources", [])}
    except Exception:
        logger.warning("contractintel_router_failed", exc_info=True)
        return {"needs_external": False, "reason": "Router failed; using existing analysis.",
                "search_query": "", "legal_context": "", "sources": []}
