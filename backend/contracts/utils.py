# backend/contracts/utils.py
import re
import spacy

# Load the lightweight, optimized English NLP pipeline
nlp = spacy.load("en_core_web_sm")

class PIIScrubber:
    def __init__(self):
        # Pre-compile regex strings for maximum throughput speed
        self.email_regex = re.compile(r'[\w\.-]+@[\w\.-]+\.\w+')
        self.phone_regex = re.compile(r'\b\d{3}[-.\s]??\d{3}[-.\s]??\d{4}\b|\(\d{3}\)\s*\d{3}[-.\s]??\d{4}\b')

    def scrub_text(self, text: str) -> str:
        if not text:
            return ""

        # 1. Deterministic Regex Scrubbing
        text = self.email_regex.sub("[EMAIL]", text)
        text = self.phone_regex.sub("[PHONE_NUMBER]", text)

        # 2. Contextual Natural Language NER Scrubbing
        doc = nlp(text)
        
        # Modify backwards (reversed) to avoid changing token index offsets during replacement
        ents = sorted(doc.ents, key=lambda e: e.start_char, reverse=True)
        text_list = list(text)

        for ent in ents:
            if ent.label_ == "PERSON":
                text_list[ent.start_char:ent.end_char] = list("[PARTY_NAME]")
            elif ent.label_ in ["GPE", "FAC", "LOC"]:
                text_list[ent.start_char:ent.end_char] = list("[LOCATION/ADDRESS]")
            elif ent.label_ == "ORG":
                text_list[ent.start_char:ent.end_char] = list("[COMPANY/ORGANIZATION]")

        return "".join(text_list)