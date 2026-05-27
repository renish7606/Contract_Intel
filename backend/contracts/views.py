import os
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
            clause_instances = []
            gemini_disabled_reason = None

            for paragraph in paragraphs:
                if clause_model:
                    predicted_label = clause_model.predict([paragraph])[0]
                    print(f"ML MODEL PREDICTION: [ {predicted_label} ]")
                else:
                    predicted_label = "General/Unclassified"

                ai_prompt = (
                    "You are an expert contract analyst. Translate this legal paragraph string classified as a "
                    f"'{predicted_label}' clause type into plain, clear, conversational English for a student. "
                    "Do not give generic descriptions. Explain the actual conditions, names, requirements, or specific terms "
                    "stated inside the sentence text. Keep it to 2 or 3 sentences max.\n"
                    f"Text context: {paragraph}"
                )

                try:
                    if gemini_disabled_reason:
                        raise RuntimeError(gemini_disabled_reason)
                    simplified_text = self._generate_simplified_text(ai_prompt)
                    print(f"AI SUMMARIZED: {simplified_text[:50]}...")
                except Exception as llm_err:
                    err_text = str(llm_err)
                    if "RESOURCE_EXHAUSTED" in err_text:
                        gemini_disabled_reason = "Gemini quota exhausted for this upload."
                    print(f"GEMINI API CONNECTION ERROR: {llm_err}")
                    simplified_text = (
                        "This section sets out the terms regarding the "
                        f"{predicted_label.lower()} baseline stipulations."
                    )

                clause_instances.append(
                    ContractClause(
                        document=document,
                        category=predicted_label,
                        original_text=paragraph,
                        simplified_text=simplified_text,
                        risk_level="LOW",
                        risk_explanation="Processed locally by ContractIntel.",
                    )
                )

            if clause_instances:
                ContractClause.objects.bulk_create(clause_instances)

            serializer = self.get_serializer(document)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        except Exception as err:
            print(f"System core processing failure: {err}")
            return Response(
                {"error": "An internal processing error occurred."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
