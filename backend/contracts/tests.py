from django.test import TestCase

from .views import align_clauses, calculate_overall_risk, word_diff


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


class ComparisonHelpersTests(TestCase):
    def test_alignment_uses_category_not_position(self):
        original = [
            {"category": "Payment Terms", "text": "Pay within 30 days."},
            {"category": "Confidentiality", "text": "Keep information private."},
        ]
        revised = [
            {"category": "Confidentiality", "text": "Keep information private."},
            {"category": "Payment Terms", "text": "Pay within 15 days."},
        ]
        aligned = align_clauses(original, revised)
        payment = next(item for item in aligned if item["category"] == "Payment Terms")
        self.assertEqual(payment["status"], "modified")
        self.assertEqual(payment["v1_text"], "Pay within 30 days.")

    def test_word_diff_marks_removed_and_added_words(self):
        diff = word_diff("Payment is due in 30 days", "Payment is due in 15 days")
        self.assertIn({"type": "removed", "text": "30"}, diff)
        self.assertIn({"type": "added", "text": "15"}, diff)
