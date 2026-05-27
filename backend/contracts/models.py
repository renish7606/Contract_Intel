from django.db import models

# Create your models here.

from django.contrib.auth.models import User

class Document(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='documents')
    title = models.CharField(max_length=255)
    scrubbed_text = models.TextField()  # Only data-compliant scrubbed text touches our database
    contract_type = models.CharField(max_length=100, blank=True, null=True)  # e.g., NDA, SLA, SaaS Agreement
    governing_law = models.CharField(max_length=100, blank=True, null=True)  # e.g., Delaware, California
    overall_risk_score = models.IntegerField(default=0)  # Evaluation scale: 0 to 100
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} | Owner: {self.user.email}"


class ContractClause(models.Model):
    RISK_CHOICES = [
        ('LOW', 'Low Risk'),
        ('MEDIUM', 'Medium Risk'),
        ('HIGH', 'High Risk'),
    ]

    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='clauses')
    category = models.CharField(max_length=100)  # e.g., Indemnification, Termination, Choice of Law
    original_text = models.TextField()           # Local scrubbed source text snippet
    simplified_text = models.TextField()         # Plain Conversational English translation
    risk_level = models.CharField(max_length=10, choices=RISK_CHOICES, default='LOW')
    risk_explanation = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.document.title} - {self.category} ({self.risk_level})"
