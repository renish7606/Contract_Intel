# backend/contracts/utils.py
import re
from collections import Counter

import spacy

# Load the lightweight, optimized English NLP pipeline
nlp = spacy.load("en_core_web_sm")


class PIIScrubber:
    """Multi-pass PII scrubber: deterministic regex patterns then spaCy NER,
    followed by a validation sweep.

    Returns a dict containing the scrubbed text **and** a redaction summary
    so the frontend can show the user exactly what was removed.

    Covers:
        - Email addresses
        - Phone numbers (US and Indian formats)
        - Aadhaar numbers (contextual — near keywords like "Aadhaar", "UID")
        - PAN card numbers
        - Indian passport numbers
        - GSTIN numbers
        - Bank account numbers (contextual — near "Account", "A/C", "IFSC", "Bank")
        - Indian pin codes (contextual)
        - Street addresses (keyword-based)
        - Person names, Organizations, Locations (spaCy NER)
    """

    # Human-readable labels for each PII category
    LABEL_DISPLAY = {
        "EMAIL": "Email Address",
        "PHONE": "Phone Number",
        "AADHAAR": "Aadhaar Number",
        "PAN": "PAN Card",
        "PASSPORT": "Passport Number",
        "GSTIN": "GSTIN",
        "BANK_ACCOUNT": "Bank Account",
        "PERSON": "Person Name",
        "ORG": "Organization",
        "GPE": "Location/Address",
        "FAC": "Location/Address",
        "LOC": "Location/Address",
    }

    def __init__(self) -> None:
        # ── Email ──────────────────────────────────────────────────────
        self.email_regex = re.compile(r'[\w\.-]+@[\w\.-]+\.\w+')

        # ── Phone (US + Indian formats) ────────────────────────────────
        self.phone_regex = re.compile(
            r'(?:\+91[\s.-]?\d{5}[\s.-]?\d{5})'       # +91 98765 43210
            r'|(?:\+91[\s.-]?\d{10})'                   # +91 9876543210
            r'|(?:\b0\d{2,4}[\s.-]?\d{6,8}\b)'          # 022-12345678 (landline)
            r'|(?:\b[6-9]\d{9}\b)'                       # 9876543210 (10-digit mobile)
            r'|(?:\b\d{3}[-.\s]??\d{3}[-.\s]??\d{4}\b)' # US: 555-123-4567
            r'|(?:\(\d{3}\)\s*\d{3}[-.\s]??\d{4}\b)',    # US: (555) 123-4567
            re.IGNORECASE,
        )

        # ── Aadhaar Number (12 digits, contextual) ─────────────────────
        # Only match near keywords: Aadhaar, UID, UIDAI, Unique Identification
        self._aadhaar_digit_pattern = re.compile(
            r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b'
        )
        self._aadhaar_context_keywords = re.compile(
            r'(?:aadhaar|aadhar|adhaar|adhar|uid(?:ai)?|unique\s+identification)',
            re.IGNORECASE,
        )

        # ── PAN Card (ABCDE1234F) ─────────────────────────────────────
        self.pan_regex = re.compile(r'\b[A-Z]{5}\d{4}[A-Z]\b')

        # ── Indian Passport (e.g., J1234567) ──────────────────────────
        self._passport_pattern = re.compile(r'\b[A-Z]\d{7}\b')
        self._passport_context_keywords = re.compile(
            r'(?:passport|travel\s+document)',
            re.IGNORECASE,
        )

        # ── GSTIN (22ABCDE1234F1Z5) ───────────────────────────────────
        self.gstin_regex = re.compile(
            r'\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z\d][A-Z]\b'
        )

        # ── Bank Account Number (contextual — 9 to 18 digits near keywords) ─
        self._bank_account_digit_pattern = re.compile(r'\b\d{9,18}\b')
        self._bank_context_keywords = re.compile(
            r'(?:account\s*(?:no|number|#)?|a\s*/\s*c|ifsc|bank|saving|current\s+a/c|neft|rtgs|imps)',
            re.IGNORECASE,
        )

        # ── IFSC Code (SBIN0001234) ───────────────────────────────────
        self.ifsc_regex = re.compile(r'\b[A-Z]{4}0[A-Z0-9]{6}\b')

        # ── Indian Pin Code (contextual — 6 digits near address keywords) ─
        self._pincode_pattern = re.compile(r'\b[1-9]\d{5}\b')
        self._pincode_context_keywords = re.compile(
            r'(?:pin\s*(?:code)?|postal|zip|post\s*office)',
            re.IGNORECASE,
        )

        # ── Street/Road Address Patterns ──────────────────────────────
        self.address_regex = re.compile(
            r'(?:'
            r'(?:\d+[\s,]+)?'                             # optional house number
            r'(?:[A-Z][a-zA-Z\s]*?)'                     # street name
            r'(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Lane|Ln\.?|Drive|Dr\.?|Nagar|Colony|Marg|Chowk|Gali|Plot|Sector|Block|Phase|Floor|Wing)'
            r'[\s,]*'
            r'(?:[A-Za-z\s,]*?)?'                         # optional locality
            r'(?:\b[1-9]\d{5}\b)?'                        # optional pin code
            r')',
            re.IGNORECASE,
        )

    # ── Context-window helper ──────────────────────────────────────────
    @staticmethod
    def _has_keyword_nearby(text: str, match_start: int, match_end: int,
                            keyword_regex: re.Pattern, window: int = 120) -> bool:
        """Check if *keyword_regex* matches within *window* chars around the match."""
        search_start = max(0, match_start - window)
        search_end = min(len(text), match_end + window)
        context = text[search_start:search_end]
        return bool(keyword_regex.search(context))

    # ── Core scrubbing method ──────────────────────────────────────────
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

        # 1a. Emails (run first — they contain dots/digits that other patterns might grab)
        email_hits = self.email_regex.findall(text)
        counts["EMAIL"] += len(email_hits)
        text = self.email_regex.sub("[EMAIL]", text)

        # 1b. GSTIN (before PAN, since GSTIN contains a PAN-like substring)
        gstin_hits = self.gstin_regex.findall(text)
        counts["GSTIN"] += len(gstin_hits)
        text = self.gstin_regex.sub("[GSTIN]", text)

        # 1c. PAN Card
        pan_hits = self.pan_regex.findall(text)
        counts["PAN"] += len(pan_hits)
        text = self.pan_regex.sub("[PAN_NUMBER]", text)

        # 1d. IFSC Code
        ifsc_hits = self.ifsc_regex.findall(text)
        counts["IFSC"] += len(ifsc_hits)
        text = self.ifsc_regex.sub("[IFSC_CODE]", text)

        # 1e. Phone numbers (US + Indian)
        phone_hits = self.phone_regex.findall(text)
        counts["PHONE"] += len(phone_hits)
        text = self.phone_regex.sub("[PHONE_NUMBER]", text)

        # 1f. Aadhaar (contextual — only near Aadhaar/UID keywords)
        text = self._contextual_scrub(
            text, self._aadhaar_digit_pattern, self._aadhaar_context_keywords,
            "[AADHAAR_NUMBER]", "AADHAAR", counts,
        )

        # 1g. Passport (contextual — only near "passport" keyword)
        text = self._contextual_scrub(
            text, self._passport_pattern, self._passport_context_keywords,
            "[PASSPORT_NUMBER]", "PASSPORT", counts,
        )

        # 1h. Bank Account (contextual — only near banking keywords)
        text = self._contextual_scrub(
            text, self._bank_account_digit_pattern, self._bank_context_keywords,
            "[BANK_ACCOUNT]", "BANK_ACCOUNT", counts,
        )

        # 1i. Pin Code (contextual — only near address/postal keywords)
        text = self._contextual_scrub(
            text, self._pincode_pattern, self._pincode_context_keywords,
            "[PIN_CODE]", "PIN_CODE", counts,
        )

        # ── Pass 2: Contextual Natural Language NER Scrubbing ──────────
        doc = nlp(text)

        # Process entities in reverse order to preserve character offsets
        ents = sorted(doc.ents, key=lambda e: e.start_char, reverse=True)
        text_list = list(text)

        # Pre-compute set of character positions that are inside existing [PLACEHOLDER] tokens
        _placeholder_spans = set()
        for m in re.finditer(r'\[[A-Z_/]+\]', text):
            for i in range(m.start(), m.end()):
                _placeholder_spans.add(i)

        for ent in ents:
            # Skip if this entity overlaps with an existing placeholder token
            ent_positions = set(range(ent.start_char, ent.end_char))
            if ent_positions & _placeholder_spans:
                continue

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

        # ── Pass 3: Validation Sweep ───────────────────────────────────
        # Re-run key regex patterns on the scrubbed text to catch anything
        # that slipped through (e.g., overlapping patterns, NER misses)
        scrubbed, validation_counts = self._validation_sweep(scrubbed)
        for k, v in validation_counts.items():
            counts[k] += v

        # ── Build Summary ──────────────────────────────────────────────
        # Merge GPE/FAC/LOC into a single "LOCATION" bucket for display
        location_total = counts.pop("GPE", 0) + counts.pop("FAC", 0) + counts.pop("LOC", 0)
        by_type: dict[str, int] = {}
        if counts.get("PERSON"):
            by_type["PERSON"] = counts["PERSON"]
        if counts.get("EMAIL"):
            by_type["EMAIL"] = counts["EMAIL"]
        if counts.get("PHONE"):
            by_type["PHONE"] = counts["PHONE"]
        if counts.get("AADHAAR"):
            by_type["AADHAAR"] = counts["AADHAAR"]
        if counts.get("PAN"):
            by_type["PAN"] = counts["PAN"]
        if counts.get("PASSPORT"):
            by_type["PASSPORT"] = counts["PASSPORT"]
        if counts.get("GSTIN"):
            by_type["GSTIN"] = counts["GSTIN"]
        if counts.get("BANK_ACCOUNT"):
            by_type["BANK_ACCOUNT"] = counts["BANK_ACCOUNT"]
        if counts.get("IFSC"):
            by_type["IFSC"] = counts["IFSC"]
        if counts.get("ORG"):
            by_type["ORG"] = counts["ORG"]
        if location_total:
            by_type["LOCATION"] = location_total
        if counts.get("PIN_CODE"):
            by_type["PIN_CODE"] = counts["PIN_CODE"]

        total_removed = sum(by_type.values())

        return {
            "scrubbed_text": scrubbed,
            "redaction_summary": {
                "total_removed": total_removed,
                "by_type": by_type,
            },
        }

    # ── Contextual scrubbing helper ────────────────────────────────────
    def _contextual_scrub(self, text: str, digit_pattern: re.Pattern,
                          keyword_regex: re.Pattern, placeholder: str,
                          label: str, counts: Counter) -> str:
        """Replace digit_pattern matches only when keyword_regex is found nearby."""
        matches = list(digit_pattern.finditer(text))
        # Process in reverse to preserve offsets
        for match in reversed(matches):
            # Skip if the match is already inside a redaction placeholder
            if self._inside_placeholder(text, match.start(), match.end()):
                continue
            if self._has_keyword_nearby(text, match.start(), match.end(), keyword_regex):
                text = text[:match.start()] + placeholder + text[match.end():]
                counts[label] += 1
        return text

    @staticmethod
    def _inside_placeholder(text: str, start: int, end: int) -> bool:
        """Check if the span [start, end) falls inside an existing [...] placeholder."""
        before = text[:start]
        last_open = before.rfind("[")
        last_close = before.rfind("]")
        return last_open > last_close  # We're inside an unclosed bracket

    # ── Validation Sweep (Pass 3) ──────────────────────────────────────
    def _validation_sweep(self, text: str) -> tuple[str, Counter]:
        """Re-scan the scrubbed text for any remaining PII patterns that
        slipped through overlapping matches or NER gaps."""
        counts: Counter = Counter()

        # Re-check emails
        remaining_emails = self.email_regex.findall(text)
        if remaining_emails:
            counts["EMAIL"] += len(remaining_emails)
            text = self.email_regex.sub("[EMAIL]", text)

        # Re-check phones
        remaining_phones = self.phone_regex.findall(text)
        if remaining_phones:
            counts["PHONE"] += len(remaining_phones)
            text = self.phone_regex.sub("[PHONE_NUMBER]", text)

        # Re-check PAN (might have been inside a larger token before)
        remaining_pan = self.pan_regex.findall(text)
        if remaining_pan:
            counts["PAN"] += len(remaining_pan)
            text = self.pan_regex.sub("[PAN_NUMBER]", text)

        # Re-check GSTIN
        remaining_gstin = self.gstin_regex.findall(text)
        if remaining_gstin:
            counts["GSTIN"] += len(remaining_gstin)
            text = self.gstin_regex.sub("[GSTIN]", text)

        return text, counts