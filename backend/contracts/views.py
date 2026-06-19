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
    GEMINI_MODEL_CANDIDATES = ["gemini-2.5-flash-lite"]
GEMINI_MODEL_CANDIDATES = list(dict.fromkeys(GEMINI_MODEL_CANDIDATES))
MAX_BATCH_CLAUSES = 25
MAX_CLAUSE_CHARS_FOR_AI = 350

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


class GoogleLoginView(APIView):
    permission_classes = [AllowAny]

    @staticmethod
    def _fetch_google_user_info(token: str, token_type: str) -> dict | None:
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
            token_type = "id_token" if request.data.get("access_token") else "id_token"

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
    def _generate_executive_summary(title: str, scrubbed_text: str, clauses: list, overall_score: int) -> str:
        text = " ".join((scrubbed_text or "").split())
        preview = text[:2500]

        document_type = "Contract"
        title_lower = (title or "").lower()
        if "nda" in title_lower:
            document_type = "Non-Disclosure Agreement"
        elif "service" in title_lower:
            document_type = "Service Agreement"
        elif "power" in title_lower and "attorney" in title_lower:
            document_type = "Power of Attorney"

        parties_match = re.search(
            r"\bbetween\s+(.{3,140}?)\s+and\s+(.{3,140}?)(?:,|\.|;|\n)",
            preview,
            flags=re.IGNORECASE,
        )
        if parties_match:
            party_a = parties_match.group(1).strip()
            party_b = parties_match.group(2).strip()
            parties_line = f"The agreement appears to be between {party_a} and {party_b}."
        else:
            parties_line = "The contracting parties are defined in the opening clauses."

        categories = [c.get("category", "General/Unclassified") for c in clauses]
        top_categories = []
        for cat in categories:
            if cat not in top_categories:
                top_categories.append(cat)
            if len(top_categories) == 3:
                break
        purpose_line = (
            f"It mainly covers {', '.join(top_categories)} terms."
            if top_categories
            else "It defines core legal rights, obligations, and governance terms."
        )

        risk_band = "low"
        if overall_score >= 60:
            risk_band = "high"
        elif overall_score >= 30:
            risk_band = "moderate"
        risk_line = (
            f"Overall risk profile is {risk_band} (score: {overall_score}/100), "
            "so priority clauses should be reviewed first."
        )

        intro_line = f"This document is a {document_type} outlining legal and commercial obligations."
        return "\n".join([intro_line, parties_line, purpose_line, risk_line])

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
            scrubbed_data = scrubber.scrub_text(raw_text)

            document = Document.objects.create(
                user=request.user,
                title=uploaded_file.name,
                scrubbed_text=scrubbed_data,
            )

            paragraphs = ContractFileParser.split_into_clauses(scrubbed_data)
            clause_data = []
            for idx, paragraph in enumerate(paragraphs):
                predicted_label = (
                    clause_model.predict([paragraph])[0]
                    if clause_model
                    else "General/Unclassified"
                )
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
                    with ThreadPoolExecutor(max_workers=1) as executor:
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

            serializer = self.get_serializer(document)
            response_data = dict(serializer.data)
            response_data["executive_summary"] = self._generate_executive_summary(
                title=uploaded_file.name,
                scrubbed_text=scrubbed_data,
                clauses=clause_data,
                overall_score=document.overall_risk_score or 0,
            )
            return Response(response_data, status=status.HTTP_201_CREATED)

        except Exception as err:
            print(f"System core processing failure: {err}")
            return Response(
                {"error": "An internal processing error occurred."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
