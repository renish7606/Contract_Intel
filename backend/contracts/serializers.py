# backend/contracts/serializers.py
from rest_framework import serializers
from .models import Document, ContractClause

class ContractClauseSerializer(serializers.ModelSerializer):
    """Serializes individual machine-learning classified clauses."""
    class Meta:
        model = ContractClause
        fields = ['id', 'category', 'original_text', 'simplified_text', 'risk_level', 'risk_explanation']

class DocumentSerializer(serializers.ModelSerializer):
    """Serializes the full document along with all its classified clauses."""
    # 🔥 FIX: Tell Django to fetch and nest all related clauses inside the document payload
    clauses = ContractClauseSerializer(many=True, read_only=True)

    class Meta:
        model = Document
        fields = ['id', 'title', 'scrubbed_text', 'created_at', 'overall_risk_score', 'clauses']
