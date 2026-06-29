import os
import json
import re
import joblib
import requests
from django.conf import settings
from django.contrib.auth.models import User
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError

try:
    from google import genai
    from google.genai import types
except Exception as genai_import_err:
    genai = None
    types = None
    print(f"Google GenAI SDK import unavailable: {genai_import_err}")

from .models import ContractClause, Document
from .parser import ContractFileParser
from .serializers import DocumentSerializer
from .utils import PIIScrubber

scrubber = PIIScrubber()

GEMINI_API_KEY = (
    os.getenv("GOOGLE_API_KEY")
    or os.getenv("GEMINI_API_KEY")
    or getattr(settings, "GOOGLE_API_KEY", None)
    or getattr(settings, "GEMINI_API_KEY", None)
)
raw_models = (
    os.getenv("GEMINI_MODELS", "").strip()
    or os.getenv("GEMINI_MODEL", "").strip()
)
if raw_models:
    GEMINI_MODEL_CANDIDATES = [m.strip() for m in raw_models.split(",") if m.strip()]
else:
    GEMINI_MODEL_CANDIDATES = ["gemini-2.5-flash-lite", "gemini-2.0-flash"]
GEMINI_MODEL_CANDIDATES = list(dict.fromkeys(GEMINI_MODEL_CANDIDATES))
MAX_BATCH_CLAUSES = 25
MAX_CLAUSE_CHARS_FOR_AI = 350

SUMMARY_PROMPT = """
You are a legal assistant helping non-lawyers understand contracts.
Analyse the following contract text and return ONLY a JSON object - no preamble, no explanation, no markdown.

Extract the actual specific facts from the contract. Do NOT use generic phrases like
"legal and commercial obligations" or "as defined in the opening clauses".
If information is not found, write "Not specified" - never guess or use placeholders.

Return this exact JSON structure:

{
  "plain_summary": "Write 3-4 sentences in plain English that a non-lawyer can understand. Include: (1) what type of agreement this is and who the parties are, (2) what service or work is involved and the payment amount if mentioned, (3) how long the contract lasts and how it can be ended, (4) where disputes are resolved. Use simple words. No legal jargon. Copy the style of this example: 'This agreement is between a software provider and a client for software testing work. The provider will be paid USD 4,500 per month and must keep the client's information private. The contract lasts 12 months and can be ended with 30 days notice. Any disputes will be settled through arbitration in Chicago under Illinois law.'",

  "key_facts": {
    "contract_type": "one phrase, e.g. Service Agreement, NDA, Employment Contract, Lease Agreement",
    "party_1": "what type of entity Party 1 is, e.g. software service provider, landlord, employer",
    "party_2": "what type of entity Party 2 is, e.g. client, tenant, employee",
    "payment": "exact payment amount and frequency if mentioned, e.g. USD 4,500 per month. Write Not specified if absent.",
    "duration": "contract length, e.g. 12 months, 2 years, indefinite",
    "termination": "how the contract can be ended, e.g. 30 days written notice by either party",
    "dispute_resolution": "how disputes are handled and where, e.g. arbitration in Chicago, Illinois under Illinois law"
  },

  "critical_clauses": [
    {
      "name": "clause name in plain English",
      "plain_explanation": "1-2 sentences explaining what this clause means for the person signing. Start with 'This means...' or 'This clause says...'",
      "risk_level": "HIGH or MEDIUM"
    }
  ],

  "verdict": "1-2 sentences. The single most important thing this person should know before signing. Be direct and specific."
}

RULES FOR critical_clauses:
- Include MAXIMUM 5 clauses. Choose only the ones that genuinely affect the person's rights or money.
- Only include HIGH risk if the clause: limits liability severely, assigns IP broadly, has auto-renewal traps, restricts what the person can do after the contract ends, or requires large indemnification.
- MEDIUM risk: payment terms, termination penalties, confidentiality obligations, dispute location.
- DO NOT include standard boilerplate: governing law choice, notice requirements, severability, entire agreement clauses.
- Each plain_explanation must be specific to THIS contract's actual text, not generic.

CONTRACT TEXT (PII has been removed and replaced with [REDACTED] tokens):
{contract_text}
"""

ai_client = None
if genai and types and GEMINI_API_KEY:
    try:
        # Force stable API routing instead of default v1beta.
        ai_client = genai.Client(
            api_key=GEMINI_API_KEY,
            http_options=types.HttpOptions(api_version="v1"),
        )
        print("GenAI client initialized on API v1.")
    except Exception as gemini_init_err:
        print(f"Gemini client initialization failed: {gemini_init_err}")
elif not GEMINI_API_KEY:
    print("Gemini API key missing. Set GOOGLE_API_KEY or GEMINI_API_KEY.")
else:
    print("Gemini SDK unavailable. Running in local analysis mode only.")

print(f"Gemini model candidates: {GEMINI_MODEL_CANDIDATES}")

MODEL_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "clause_classifier_model.pkl",
)
if os.path.exists(MODEL_PATH):
    print("Successfully loaded local CUAD Clause Classifier Model.")
    clause_model = joblib.load(MODEL_PATH)
else:
    print("Warning: clause_classifier_model.pkl not found.")
    clause_model = None


# ── High-risk clause types used for risk score calculation ────────────
HIGH_RISK_CLAUSE_TYPES = [
    "Limitation of Liability",
    "Cap on Liability",
    "IP Ownership Assignment",
    "Non-Compete",
    "Competitive Restriction Exception",
    "Automatic Renewal",
    "Unilateral Amendment",
    "Indemnification",
    "Exclusivity",
    "Liquidated Damages",
    "Termination for Convenience",
]


def calculate_risk_score(flagged_clauses: list) -> str:
    """Return HIGH / MEDIUM / LOW based on how many high-risk clause types appear."""
    high_risk_set = {t.lower() for t in HIGH_RISK_CLAUSE_TYPES}
    high_count = sum(
        1 for c in flagged_clauses
        if (c.get("category") or "").strip().lower() in high_risk_set
    )
    if high_count >= 3:
        return "HIGH"
    elif high_count >= 1:
        return "MEDIUM"
    return "LOW"


def _extract_json_object(raw: str) -> dict:
    cleaned = (raw or "").strip()
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        cleaned = parts[1] if len(parts) > 1 else cleaned
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        cleaned = cleaned[start : end + 1]
    return json.loads(cleaned)


def _plain_clause_explanation(clause: dict) -> str:
    explanation = (
        clause.get("plain_explanation")
        or clause.get("simplified_text")
        or clause.get("text")
        or ""
    )
    explanation = re.sub(r"Local trigger matched[^.]*\.", "", explanation).strip()
    if not explanation:
        explanation = "This means you should review this clause before signing."
    if not explanation.lower().startswith(("this means", "this clause says")):
        explanation = f"This means {explanation[0].lower()}{explanation[1:]}"
    return explanation


def local_fallback_summary(contract_text: str, clause_classifications: dict) -> dict:
    """
    Fallback when Gemini times out. Extracts real facts using keyword/regex matching
    instead of returning generic template text.
    """
    text_lower = (contract_text or "").lower()

    payment = "Not specified"
    payment_patterns = [
        r'\$[\d,]+(?:\.\d{2})?(?:\s*(?:per\s+month|monthly|per\s+year|annually))?',
        r'USD\s*[\d,]+(?:\.\d{2})?(?:\s*(?:per\s+month|monthly|per\s+year|annually))?',
        r'[\d,]+(?:\.\d{2})?\s*(?:dollars|USD)(?:\s*(?:per\s+month|monthly|per\s+year|annually))?',
    ]
    for pattern in payment_patterns:
        match = re.search(pattern, contract_text or "", re.IGNORECASE)
        if match:
            payment = match.group(0).strip()
            break

    duration = "Not specified"
    duration_patterns = [
        r'(?:term|period|duration)[^.]*?(\d+)\s*(month|year|week)',
        r'(\d+)[- ](month|year)[^.]*?(?:term|period|agreement)',
        r'for\s+a\s+period\s+of\s+(\d+)\s+(month|year)',
    ]
    for pattern in duration_patterns:
        match = re.search(pattern, text_lower)
        if match:
            unit = match.group(2)
            suffix = "" if match.group(1) == "1" or unit.endswith("s") else "s"
            duration = f"{match.group(1)} {unit}{suffix}"
            break

    termination = "Not specified"
    term_match = re.search(r'(\d+)[- ]day[s]?\s+(?:written\s+)?notice', text_lower)
    if term_match:
        termination = f"{term_match.group(1)} days written notice"

    dispute = "Not specified"
    if "arbitration" in text_lower:
        dispute = "Arbitration"
        juris_match = re.search(
            r'arbitration\s+in\s+([A-Z][a-zA-Z\s,]+?)(?:\.|,|\s+under)',
            contract_text or "",
        )
        if juris_match:
            dispute = f"Arbitration in {juris_match.group(1).strip()}"
    elif "court" in text_lower:
        dispute = "Court proceedings"

    contract_type = "Legal Agreement"
    if "non-disclosure" in text_lower or "confidentiality agreement" in text_lower:
        contract_type = "Non-Disclosure Agreement"
    elif "service agreement" in text_lower or "services agreement" in text_lower:
        contract_type = "Service Agreement"
    elif "employment" in text_lower:
        contract_type = "Employment Contract"
    elif "lease" in text_lower:
        contract_type = "Lease Agreement"

    clause_names = [
        name for name, _count in sorted(
            clause_classifications.items(),
            key=lambda item: item[1],
            reverse=True,
        )
        if name and name != "General/Unclassified"
    ]

    if contract_type == "Non-Disclosure Agreement":
        facts = [
            "This is a non-disclosure agreement between the parties, meaning it is mainly about keeping shared information private.",
            "The person or company receiving confidential information must protect it, use it only for the allowed business purpose, and avoid sharing it without permission.",
        ]
    elif contract_type == "Service Agreement":
        facts = [
            "This is a service agreement between a service provider and a client.",
            "It explains the work or services to be provided and the main responsibilities each side accepts.",
        ]
    elif contract_type == "Employment Contract":
        facts = [
            "This is an employment contract between an employer and an employee.",
            "It explains the work relationship, duties, and important rules the employee must follow.",
        ]
    elif contract_type == "Lease Agreement":
        facts = [
            "This is a lease agreement between a property owner and a tenant.",
            "It explains the tenant's right to use the property and the main duties for rent, care of the property, and compliance with lease rules.",
        ]
    else:
        facts = [
            "This is a legal agreement between the parties.",
            "It explains important rights, responsibilities, and restrictions that apply after the document is signed.",
        ]

    timing_parts = []
    if payment != "Not specified":
        timing_parts.append(f"the payment term found is {payment}")
    else:
        timing_parts.append("no payment amount was found in the extracted text")
    if duration != "Not specified":
        timing_parts.append(f"it runs for {duration}")
    if termination != "Not specified":
        timing_parts.append(f"it can be ended with {termination}")
    if duration == "Not specified" and termination == "Not specified":
        timing_parts.append("no fixed contract length or specific termination notice period was found")
    facts.append(f"For money and timing, {'; '.join(timing_parts)}.")

    if dispute != "Not specified":
        facts.append(f"If there is a dispute, it is handled through {dispute}.")
    else:
        facts.append("The extracted text does not clearly say where disputes must be resolved.")

    return {
        "plain_summary": " ".join(facts[:4]),
        "key_facts": {
            "contract_type": contract_type,
            "party_1": "Party as defined in contract",
            "party_2": "Counterparty as defined in contract",
            "payment": payment,
            "duration": duration,
            "termination": termination,
            "dispute_resolution": dispute,
        },
        "critical_clauses": [],
        "verdict": "Review payment, termination, confidentiality, liability, and dispute terms before signing.",
        "source": "local_fallback",
    }


class GoogleLoginView(APIView):
    permission_classes = [AllowAny]

    @staticmethod
    def _fetch_google_user_info(token: str, token_type: str) -> dict | None:
        """Verify a Google OAuth token and return user info."""
        try:
            if token_type == "access_token":
                response = requests.get(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=10,
                )
            else:
                response = requests.get(
                    "https://www.googleapis.com/oauth2/v3/tokeninfo",
                    params={"id_token": token},
                    timeout=10,
                )
        except requests.RequestException as exc:
            print(f"Google token verification failed: {exc}")
            return None

        if response.status_code != 200:
            print(f"Google token rejected ({token_type}): {response.text}")
            return None

        return response.json()

    def post(self, request):
        token = request.data.get("token") or request.data.get("access_token")
        token_type = request.data.get("token_type")

        if not token:
            return Response({"error": "Token is required"}, status=status.HTTP_400_BAD_REQUEST)

        if token_type not in {"id_token", "access_token"}:
            token_type = "access_token" if request.data.get("access_token") else "id_token"

        user_info = self._fetch_google_user_info(token, token_type)
        if not user_info:
            return Response({"error": "Invalid Google token"}, status=status.HTTP_400_BAD_REQUEST)

        email = user_info.get("email")
        if not email:
            return Response(
                {"error": "Email not provided by Google account"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user, _ = User.objects.get_or_create(
            email=email,
            defaults={
                "username": email,
                "first_name": user_info.get("given_name", ""),
                "last_name": user_info.get("family_name", ""),
            },
        )

        if not user.first_name and user_info.get("given_name"):
            user.first_name = user_info.get("given_name", "")
            user.last_name = user_info.get("family_name", user.last_name)
            user.save(update_fields=["first_name", "last_name"])

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "first_name": user.first_name,
                    "picture": user_info.get("picture", ""),
                },
            },
            status=status.HTTP_200_OK,
        )


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(
            {
                "id": request.user.id,
                "email": request.user.email,
                "first_name": request.user.first_name,
            },
            status=status.HTTP_200_OK,
        )


class DocumentListCreateView(generics.ListCreateAPIView):
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Document.objects.filter(user=self.request.user).order_by("-created_at")

    @staticmethod
    def _risk_rank(level: str) -> int:
        return {"LOW": 1, "MEDIUM": 2, "HIGH": 3}.get((level or "").upper(), 1)

    @staticmethod
    def _category_risk_baseline(category: str) -> tuple[str, str] | None:
        category_key = (category or "").strip().lower()
        baseline_map = {
            "cap on liability": ("HIGH", "Baseline risk policy: liability-cap clauses are monitored as high impact."),
            "termination for convenience": ("HIGH", "Baseline risk policy: termination flexibility is high impact."),
            "exclusivity": ("HIGH", "Baseline risk policy: exclusivity clauses can materially restrict operations."),
            "competitive restriction exception": ("HIGH", "Baseline risk policy: competition restrictions are high impact."),
            "liquidated damages": ("HIGH", "Baseline risk policy: liquidated-damages exposure is high impact."),
            "governing law": ("MEDIUM", "Baseline risk policy: governing-law clauses require legal review."),
            "anti-assignment": ("MEDIUM", "Baseline risk policy: assignment constraints require review."),
            "audit rights": ("MEDIUM", "Baseline risk policy: audit-rights clauses require review."),
            "insurance": ("MEDIUM", "Baseline risk policy: insurance terms require coverage review."),
            "license grant": ("MEDIUM", "Baseline risk policy: licensing scope and limits require review."),
            "ip ownership assignment": ("HIGH", "Baseline risk policy: IP ownership transfer is high impact."),
            "revenue/profit sharing": ("MEDIUM", "Baseline risk policy: revenue-sharing clauses need commercial review."),
        }
        return baseline_map.get(category_key)

    @staticmethod
    def _generate_ai_contract_summary(scrubbed_text: str) -> dict:
        if not ai_client:
            raise RuntimeError("Gemini client is not initialized.")

        prompt = SUMMARY_PROMPT.replace("{contract_text}", (scrubbed_text or "")[:12000])
        last_error = None
        for candidate in GEMINI_MODEL_CANDIDATES:
            model_name = candidate if candidate.startswith("models/") else f"models/{candidate}"
            try:
                response = ai_client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                )
                return _extract_json_object(response.text or "")
            except Exception as err:
                last_error = err
                print(f"Gemini summary attempt failed ({model_name}): {err}")
        raise RuntimeError(f"All Gemini summary candidates failed. Last error: {last_error}")

    @staticmethod
    def _build_contract_summary(scrubbed_text: str, clauses: list, analysis_mode: str) -> dict:
        clause_counts = {}
        for clause in clauses:
            category = clause.get("category") or "General/Unclassified"
            clause_counts[category] = clause_counts.get(category, 0) + 1

        fallback_summary = local_fallback_summary(scrubbed_text, clause_counts)
        summary = dict(fallback_summary)
        if ai_client and analysis_mode == "AI":
            executor = ThreadPoolExecutor(max_workers=1)
            future = executor.submit(
                DocumentListCreateView._generate_ai_contract_summary,
                scrubbed_text,
            )
            try:
                ai_summary = future.result(timeout=6)
                if isinstance(ai_summary, dict):
                    summary.update(ai_summary)
                    summary["source"] = "gemini"
            except FuturesTimeoutError:
                print("Gemini summary exceeded 6s timeout - using local summary.")
            except Exception as err:
                print(f"Gemini summary failed - using local summary: {err}")
            finally:
                executor.shutdown(wait=False, cancel_futures=True)

        key_facts = summary.get("key_facts") if isinstance(summary.get("key_facts"), dict) else {}
        default_facts = fallback_summary["key_facts"]
        summary["key_facts"] = {**default_facts, **key_facts}
        sentence_count = len(re.findall(r"[.!?](?:\s|$)", summary.get("plain_summary") or ""))
        if sentence_count < 3:
            summary["plain_summary"] = fallback_summary["plain_summary"]

        if not summary.get("critical_clauses"):
            risk_order = {"HIGH": 0, "MEDIUM": 1}
            important = [
                clause for clause in clauses
                if (clause.get("risk_level") or "").upper() in risk_order
                and (clause.get("category") or "").strip().lower() not in {
                    "governing law",
                    "notice",
                    "notices",
                    "severability",
                    "entire agreement",
                }
            ]
            important.sort(key=lambda c: risk_order[(c.get("risk_level") or "").upper()])
            summary["critical_clauses"] = [
                {
                    "name": clause.get("category") or "Important Clause",
                    "plain_explanation": _plain_clause_explanation(clause),
                    "risk_level": (clause.get("risk_level") or "MEDIUM").upper(),
                }
                for clause in important[:5]
            ]
        else:
            summary["critical_clauses"] = [
                {
                    "name": clause.get("name") or clause.get("category") or "Important Clause",
                    "plain_explanation": _plain_clause_explanation(clause),
                    "risk_level": (clause.get("risk_level") or "MEDIUM").upper(),
                }
                for clause in summary["critical_clauses"]
                if (clause.get("risk_level") or "").upper() in {"HIGH", "MEDIUM"}
            ][:5]

        summary["verdict"] = summary.get("verdict") or (
            "Review the flagged clauses before signing, especially any terms that affect payment, termination, liability, confidentiality, or dispute handling."
        )
        return summary

    @staticmethod
    def _batch_simplify_clauses(clause_data: list) -> list:
        """
        Sends ALL clauses to Gemini in ONE API call.
        clause_data: [{"index": int, "category": str, "text": str}, ...]
        Returns:     [{"index": int, "simplified": str, "risk_level": str,
                       "risk_explanation": str}, ...]
        """
        if not ai_client:
            raise RuntimeError("Gemini client is not initialized.")

        prompt_lines = [
            "You are an expert contract analyst. Below are numbered legal clauses.",
            "For EACH clause do two things:",
            "  1. Write a 2-3 sentence plain-English summary of the ACTUAL conditions "
            "stated (not a generic description of the clause type).",
            "  2. Assign a risk level: LOW, MEDIUM, or HIGH, with a one-sentence reason.",
            "",
            "Return ONLY a valid JSON array - no markdown, no code fences, nothing else.",
            "Format: "
            '[{"index":0,"simplified":"...","risk_level":"LOW","risk_explanation":"..."}, ...]',
            "",
            "Clauses:",
        ]
        for item in clause_data:
            prompt_lines.append(
                f'\n[{item["index"]}] Category: {item["category"]}\nText: {item["text"]}'
            )

        full_prompt = "\n".join(prompt_lines)
        last_error = None
        raw = ""

        for candidate in GEMINI_MODEL_CANDIDATES:
            model_name = (
                candidate if candidate.startswith("models/") else f"models/{candidate}"
            )
            try:
                response = ai_client.models.generate_content(
                    model=model_name,
                    contents=full_prompt,
                )
                raw = (response.text or "").strip()

                if raw.startswith("```"):
                    parts = raw.split("```")
                    raw = parts[1] if len(parts) > 1 else raw
                    if raw.lower().startswith("json"):
                        raw = raw[4:]
                    raw = raw.strip()

                return json.loads(raw)

            except json.JSONDecodeError as json_err:
                last_error = json_err
                print(f"Gemini JSON parse error ({model_name}): {json_err}\nRaw: {raw[:300]}")
            except Exception as err:
                last_error = err
                print(f"Gemini batch attempt failed ({model_name}): {err}")

        raise RuntimeError(
            f"All Gemini model candidates failed. Last error: {last_error}"
        )

    @staticmethod
    def _prepare_clause_batch_payload(clause_data: list) -> tuple[list, int]:
        """
        Keep the upload as one Gemini request while reducing prompt/token pressure.
        Returns the compacted clause list and count of truncated clauses.
        """
        compact = []
        truncated_count = 0
        for item in clause_data[:MAX_BATCH_CLAUSES]:
            text = " ".join((item.get("text") or "").split())
            if len(text) > MAX_CLAUSE_CHARS_FOR_AI:
                text = f"{text[:MAX_CLAUSE_CHARS_FOR_AI].rstrip()}..."
                truncated_count += 1
            compact.append(
                {
                    "index": item["index"],
                    "category": item["category"],
                    "text": text,
                }
            )
        return compact, truncated_count

    @staticmethod
    def _local_simplified_text(paragraph: str, category: str) -> str:
        cleaned = " ".join((paragraph or "").split())
        if not cleaned:
            return f"This clause relates to {category.lower()} terms."

        sentence_candidates = [
            s.strip()
            for s in re.split(r"(?<=[.!?])\s+", cleaned)
            if s and len(s.strip()) > 20
        ]
        if not sentence_candidates:
            sentence_candidates = [cleaned]

        priority_terms = {
            "shall", "must", "terminate", "liability", "indemnify", "indemnification",
            "penalty", "exclusive", "confidential", "governing law", "assignment",
            "audit", "warranty", "notice", "license",
        }
        top_sentences = []
        scored = []
        for sentence in sentence_candidates:
            sentence_l = sentence.lower()
            keyword_hits = sum(1 for term in priority_terms if term in sentence_l)
            length_bonus = 1 if 60 <= len(sentence) <= 220 else 0
            score = (keyword_hits * 3) + length_bonus
            scored.append((score, sentence))

        scored.sort(key=lambda x: x[0], reverse=True)
        for _, sentence in scored:
            if len(top_sentences) >= 2:
                break
            if sentence not in top_sentences:
                top_sentences.append(sentence)

        summary = " ".join(top_sentences).strip()
        if len(summary) > 260:
            summary = f"{summary[:257].rstrip()}..."

        # Make local summary less verbatim and more plain-English.
        replacements = [
            ("hereinafter", "later in this document"),
            ("whereas", ""),
            ("shall", "must"),
            ("thereof", "of it"),
            ("therein", "in it"),
            ("witnesseth", "states"),
            ("party of the first part", "first party"),
            ("party of the second part", "second party"),
        ]
        normalized = summary
        for source, target in replacements:
            normalized = re.sub(rf"\b{re.escape(source)}\b", target, normalized, flags=re.IGNORECASE)
        normalized = " ".join(normalized.split()).strip(" ,.;:")

        # If still too similar to original, compress harder to a conceptual sentence.
        original_tokens = cleaned.lower().split()
        normalized_tokens = normalized.lower().split()
        overlap = 0
        if normalized_tokens:
            original_set = set(original_tokens)
            overlap = sum(1 for tok in normalized_tokens if tok in original_set) / len(normalized_tokens)

        if overlap > 0.82:
            key_actions = []
            text_l = cleaned.lower()
            if "terminate" in text_l:
                key_actions.append("termination conditions")
            if "payment" in text_l or "fee" in text_l:
                key_actions.append("payment obligations")
            if "liability" in text_l or "indemn" in text_l:
                key_actions.append("liability and indemnity exposure")
            if "confidential" in text_l:
                key_actions.append("confidentiality duties")
            if "governing law" in text_l or "jurisdiction" in text_l:
                key_actions.append("legal venue and governing law")
            if not key_actions:
                key_actions.append("core rights and obligations")

            normalized = (
                f"This clause explains {', '.join(key_actions)} under the "
                f"{category.lower()} section."
            )

        return f"This clause relates to {category.lower()} terms. {normalized}"

    @staticmethod
    def _local_risk_from_clause(paragraph: str, category: str) -> tuple[str, str]:
        text = (paragraph or "").lower()
        category_key = (category or "").lower()

        high_keywords = [
            "unlimited liability",
            "indemnify",
            "indemnification",
            "terminate immediately",
            "sole discretion",
            "without notice",
            "non-compete",
            "exclusive",
            "penalty",
        ]
        medium_keywords = [
            "auto-renew",
            "arbitration",
            "governing law",
            "assignment",
            "audit",
            "confidential",
            "warranty",
            "license",
            "ip ownership",
            "limitation of liability",
        ]

        high_categories = {
            "cap on liability",
            "competitive restriction exception",
            "termination for convenience",
            "ip ownership assignment",
            "exclusivity",
        }
        medium_categories = {
            "governing law",
            "anti-assignment",
            "audit rights",
            "insurance",
            "license grant",
            "revenue/profit sharing",
        }

        matched_high_keyword = next((k for k in high_keywords if k in text), None)
        matched_medium_keyword = next((k for k in medium_keywords if k in text), None)

        if matched_high_keyword:
            return (
                "HIGH",
                f"Local trigger matched high-risk keyword: '{matched_high_keyword}'.",
            )
        if category_key in high_categories:
            return (
                "HIGH",
                f"Local trigger matched high-risk clause category: '{category}'.",
            )
        if matched_medium_keyword:
            return (
                "MEDIUM",
                f"Local trigger matched medium-risk keyword: '{matched_medium_keyword}'.",
            )
        if category_key in medium_categories:
            return (
                "MEDIUM",
                f"Local trigger matched medium-risk clause category: '{category}'.",
            )
        return "LOW", "No strong high-risk indicators detected in local analysis."

    def create(self, request, *args, **kwargs):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"error": "No file uploaded."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            raw_text = ContractFileParser.extract_text(uploaded_file, uploaded_file.name)

            # PIIScrubber now returns a dict with scrubbed_text + redaction_summary
            scrub_result = scrubber.scrub_text(raw_text)
            scrubbed_text = scrub_result["scrubbed_text"]
            redaction_summary = scrub_result["redaction_summary"]

            document = Document.objects.create(
                user=request.user,
                title=uploaded_file.name,
                scrubbed_text=scrubbed_text,
                redaction_summary=redaction_summary,
            )

            paragraphs = ContractFileParser.split_into_clauses(scrubbed_text)
            clause_data = []
            for idx, paragraph in enumerate(paragraphs):
                predicted_label = "General/Unclassified"
                if clause_model:
                    try:
                        probs = clause_model.predict_proba([paragraph])[0]
                        max_prob = max(probs)
                        # We only accept classifications with at least 60% confidence
                        if max_prob >= 0.60:
                            classes = list(clause_model.classes_)
                            max_idx = list(probs).index(max_prob)
                            predicted_label = classes[max_idx]
                        else:
                            predicted_label = "General/Unclassified"
                    except Exception:
                        try:
                            predicted_label = clause_model.predict([paragraph])[0]
                        except Exception:
                            predicted_label = "General/Unclassified"
                print(f"ML MODEL PREDICTION [{idx}]: [ {predicted_label} ]")
                clause_data.append(
                    {"index": idx, "category": predicted_label, "text": paragraph}
                )

            ai_results = {}
            analysis_mode = "LOCAL_FALLBACK"
            if ai_client and clause_data:
                try:
                    compact_clause_data, truncated_count = self._prepare_clause_batch_payload(clause_data)
                    if len(clause_data) > MAX_BATCH_CLAUSES:
                        print(
                            f"Batch capped to {MAX_BATCH_CLAUSES} clauses for AI call "
                            f"(total clauses: {len(clause_data)})."
                        )
                    if truncated_count:
                        print(
                            f"AI batch payload compacted: {truncated_count} clause(s) truncated "
                            f"to {MAX_CLAUSE_CHARS_FOR_AI} chars."
                        )

                    # ── Hard 18-second timeout so Render's 30s proxy limit is never hit ──
                    executor = ThreadPoolExecutor(max_workers=1)
                    try:
                        future = executor.submit(
                            self._batch_simplify_clauses, compact_clause_data
                        )
                        try:
                            batch_results = future.result(timeout=18)
                            ai_results = {item["index"]: item for item in batch_results}
                            analysis_mode = "AI"
                            print(
                                f"Gemini batch call succeeded: {len(ai_results)} clauses processed."
                            )
                        except FuturesTimeoutError:
                            print("Gemini call exceeded 18s timeout — falling back to local analysis.")
                        except Exception as llm_err:
                            err_str = str(llm_err)
                            if "RESOURCE_EXHAUSTED" in err_str:
                                print("Gemini quota exhausted — falling back to local analysis.")
                            else:
                                print(f"Gemini batch call failed: {llm_err}")
                    finally:
                        executor.shutdown(wait=False, cancel_futures=True)
                except Exception as outer_err:
                    print(f"AI processing setup failed: {outer_err}")
            else:
                print("Gemini not available - using fallback summaries.")

            valid_risk = {"LOW", "MEDIUM", "HIGH"}
            clause_instances = []

            for item in clause_data:
                idx = item["index"]
                ai = ai_results.get(idx, {})

                simplified = ai.get(
                    "simplified",
                    self._local_simplified_text(item["text"], item["category"]),
                )
                local_risk_level, local_risk_explanation = self._local_risk_from_clause(
                    item["text"], item["category"]
                )
                risk_level = ai.get("risk_level", local_risk_level).upper()
                if risk_level not in valid_risk:
                    risk_level = local_risk_level
                risk_explanation = ai.get(
                    "risk_explanation", local_risk_explanation
                )
                baseline = self._category_risk_baseline(item["category"])
                if baseline:
                    baseline_level, baseline_explanation = baseline
                    if self._risk_rank(baseline_level) > self._risk_rank(risk_level):
                        risk_level = baseline_level
                        risk_explanation = baseline_explanation

                clause_instances.append(
                    ContractClause(
                        document=document,
                        category=item["category"],
                        original_text=item["text"],
                        simplified_text=simplified,
                        risk_level=risk_level,
                        risk_explanation=risk_explanation,
                    )
                )

            if clause_instances:
                ContractClause.objects.bulk_create(clause_instances)

            risk_weights = {"LOW": 1, "MEDIUM": 2, "HIGH": 3}
            if clause_instances:
                total_weight = sum(
                    risk_weights.get(c.risk_level, 1) for c in clause_instances
                )
                avg_weight = total_weight / len(clause_instances)
                overall_score = int(((avg_weight - 1) / 2) * 100)
                document.overall_risk_score = overall_score
                print(f"Document overall risk score: {overall_score}/100")
            document.analysis_mode = analysis_mode
            if clause_instances:
                document.save(update_fields=["overall_risk_score", "analysis_mode"])
            else:
                document.save(update_fields=["analysis_mode"])

            # Compute the risk_score label using the GEMINI.md spec logic
            risk_score_label = calculate_risk_score(clause_data)

            serializer = self.get_serializer(document)
            response_data = dict(serializer.data)
            summary_clauses = [
                {
                    "category": clause.category,
                    "simplified_text": clause.simplified_text,
                    "risk_level": clause.risk_level,
                    "risk_explanation": clause.risk_explanation,
                }
                for clause in clause_instances
            ]
            summary = self._build_contract_summary(
                scrubbed_text=scrubbed_text,
                clauses=summary_clauses,
                analysis_mode=analysis_mode,
            )
            response_data["summary"] = summary
            response_data["executive_summary"] = summary.get("plain_summary", "")
            response_data["risk_score"] = risk_score_label
            return Response(response_data, status=status.HTTP_201_CREATED)

        except Exception as err:
            print(f"System core processing failure: {err}")
            return Response(
                {"error": "An internal processing error occurred."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
