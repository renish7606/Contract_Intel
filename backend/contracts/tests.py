from django.test import TestCase

from .views import calculate_overall_risk


class OverallRiskCalculationTests(TestCase):
    def test_empty_clause_list_is_low_risk(self):
        self.assertEqual(calculate_overall_risk([]), {"score": 10, "level": "LOW"})

    def test_confidence_weighted_average_sets_high_risk(self):
        result = calculate_overall_risk([
            {"risk_score": 80, "confidence": "HIGH"},
            {"risk_score": 40, "confidence": "LOW"},
        ])
        self.assertEqual(result, {"score": 69, "level": "HIGH"})

    def test_invalid_score_is_safely_normalised(self):
        result = calculate_overall_risk([
            {"risk_score": "not-a-number", "confidence": "MEDIUM"},
            {"risk_score": 150, "confidence": "MEDIUM"},
        ])
        self.assertEqual(result, {"score": 50, "level": "MEDIUM"})
