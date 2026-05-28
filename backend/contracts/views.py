import os
import json
import joblib
import requests
from django.conf import settings
from django.contrib.auth.models import User
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from google import genai
from google.genai import types

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
GEMINI_MODEL_CANDIDATES = [
    os.getenv("GEMINI_MODEL", "gemini-2.0-flash"),
    "gemini-2.0-flash",
]
GEMINI_MODEL_CANDIDATES = list(dict.fromkeys([m for m in GEMINI_MODEL_CANDIDATES if m]))

ai_client = None
if GEMINI_API_KEY:
    try:
        # Force stable API routing instead of default v1beta.
        ai_client = genai.Client(
            api_key=GEMINI_API_KEY,
            http_options=types.HttpOptions(api_version="v1"),
        )
        print("GenAI client initialized on API v1.")
    except Exception as gemini_init_err:
        print(f"Gemini client initialization failed: {gemini_init_err}")
else:
    print("Gemini API key missing. Set GOOGLE_API_KEY or GEMINI_API_KEY.")

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

    def post(self, request):
        access_token = request.data.get("access_token")
        if not access_token:
            return Response({"error": "Token is required"}, status=status.HTTP_400_BAD_REQUEST)

        google_verify_url = f"https://www.googleapis.com/oauth2/v3/tokeninfo?id_token={access_token}"
        response = requests.get(google_verify_url)

        if response.status_code != 200:
            return Response({"error": "Invalid Google token"}, status=status.HTTP_400_BAD_REQUEST)

        user_info = response.json()
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


class DocumentListCreateView(generics.ListCreateAPIView):
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Document.objects.filter(user=self.request.user).order_by("-created_at")

    @staticmethod
    def _generate_simplified_text(prompt_text):
        if not ai_client:
            raise RuntimeError("Gemini client is not initialized.")

        last_error = None
        for candidate in GEMINI_MODEL_CANDIDATES:
            model_name = candidate if candidate.startswith("models/") else f"models/{candidate}"
            try:
                response = ai_client.models.generate_content(
                    model=model_name,
                    contents=prompt_text,
                )
                if getattr(response, "text", None):
                    return response.text.strip()
            except Exception as err:
                last_error = err
                print(f"Gemini model attempt failed ({model_name}): {err}")

        raise RuntimeError(f"All Gemini model candidates failed. Last error: {last_error}")

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
    def _local_simplified_text(paragraph: str, category: str) -> str:
        cleaned = " ".join((paragraph or "").split())
        if not cleaned:
            return f"This clause relates to {category.lower()} terms."

        snippet = cleaned[:320].rstrip()
        if len(cleaned) > 320:
            snippet += "..."
        return f"This clause relates to {category.lower()} terms: {snippet}"

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

        if any(k in text for k in high_keywords) or category_key in high_categories:
            return "HIGH", "Potentially strict or one-sided obligations were detected."
        if any(k in text for k in medium_keywords) or category_key in medium_categories:
            return "MEDIUM", "Contains legal/commercial terms that require review."
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
            if ai_client and clause_data:
                try:
                    batch_results = self._batch_simplify_clauses(clause_data)
                    ai_results = {item["index"]: item for item in batch_results}
                    print(
                        f"Gemini batch call succeeded: {len(ai_results)} clauses processed."
                    )
                except Exception as llm_err:
                    err_str = str(llm_err)
                    if "RESOURCE_EXHAUSTED" in err_str:
                        print("Gemini quota exhausted - falling back to defaults.")
                    else:
                        print(f"Gemini batch call failed: {llm_err}")
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
                document.save(update_fields=["overall_risk_score"])
                print(f"Document overall risk score: {overall_score}/100")

            serializer = self.get_serializer(document)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        except Exception as err:
            print(f"System core processing failure: {err}")
            return Response(
                {"error": "An internal processing error occurred."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
