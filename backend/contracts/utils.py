# backend/contracts/utils.py
import re
from collections import Counter

import spacy

# Load the lightweight, optimized English NLP pipeline
nlp = spacy.load("en_core_web_sm")


class PIIScrubber:
    """Two-pass PII scrubber: deterministic regex patterns then spaCy NER.

    Returns a dict containing the scrubbed text **and** a redaction summary
    so the frontend can show the user exactly what was removed.
    """

    # Human-readable labels for each PII category
    LABEL_DISPLAY = {
        "EMAIL": "Email Address",
        "PHONE": "Phone Number",
        "PERSON": "Person Name",
        "ORG": "Organization",
        "GPE": "Location/Address",
        "FAC": "Location/Address",
        "LOC": "Location/Address",
    }

    def __init__(self) -> None:
        # Pre-compile regex strings for maximum throughput speed
        self.email_regex = re.compile(r'[\w\.-]+@[\w\.-]+\.\w+')
        self.phone_regex = re.compile(
            r'\b\d{3}[-.\s]??\d{3}[-.\s]??\d{4}\b'
            r'|\(\d{3}\)\s*\d{3}[-.\s]??\d{4}\b'
        )

    def scrub_text(self, text: str) -> dict:
        """Scrub PII from *text* and return scrubbed text with a summary.

        Returns:
            dict with keys:
                - ``scrubbed_text`` (str): The text with all PII replaced by
                  placeholder tokens.
                - ``redaction_summary`` (dict): ``{"total_removed": int,
                  "by_type": {"PERSON": N, "EMAIL": N, ...}}``.
        """
        if not text:
            return {
                "scrubbed_text": "",
                "redaction_summary": {"total_removed": 0, "by_type": {}},
            }

        counts: Counter = Counter()

        # ── Pass 1: Deterministic Regex Scrubbing ──────────────────────
        email_hits = self.email_regex.findall(text)
        counts["EMAIL"] += len(email_hits)
        text = self.email_regex.sub("[EMAIL]", text)

        phone_hits = self.phone_regex.findall(text)
        counts["PHONE"] += len(phone_hits)
        text = self.phone_regex.sub("[PHONE_NUMBER]", text)

        # ── Pass 2: Contextual Natural Language NER Scrubbing ──────────
        doc = nlp(text)

        # Process entities in reverse order to preserve character offsets
        ents = sorted(doc.ents, key=lambda e: e.start_char, reverse=True)
        text_list = list(text)

        for ent in ents:
            if ent.label_ == "PERSON":
                text_list[ent.start_char:ent.end_char] = list("[PARTY_NAME]")
                counts["PERSON"] += 1
            elif ent.label_ in ("GPE", "FAC", "LOC"):
                text_list[ent.start_char:ent.end_char] = list("[LOCATION/ADDRESS]")
                counts[ent.label_] += 1
            elif ent.label_ == "ORG":
                text_list[ent.start_char:ent.end_char] = list("[COMPANY/ORGANIZATION]")
                counts["ORG"] += 1

        scrubbed = "".join(text_list)

        # Merge GPE/FAC/LOC into a single "LOCATION" bucket for display
        location_total = counts.pop("GPE", 0) + counts.pop("FAC", 0) + counts.pop("LOC", 0)
        by_type: dict[str, int] = {}
        if counts.get("PERSON"):
            by_type["PERSON"] = counts["PERSON"]
        if counts.get("EMAIL"):
            by_type["EMAIL"] = counts["EMAIL"]
        if counts.get("PHONE"):
            by_type["PHONE"] = counts["PHONE"]
        if counts.get("ORG"):
            by_type["ORG"] = counts["ORG"]
        if location_total:
            by_type["LOCATION"] = location_total

        total_removed = sum(by_type.values())

        return {
            "scrubbed_text": scrubbed,
            "redaction_summary": {
                "total_removed": total_removed,
                "by_type": by_type,
            },
        }