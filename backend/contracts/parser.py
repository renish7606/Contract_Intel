# backend/contracts/parser.py
import io
from pypdf import PdfReader
from docx import Document as DocxReader

class ContractFileParser:
    @staticmethod
    def extract_text(file_obj, filename: str) -> str:
        """Reads a binary file object and extracts text based on its extension."""
        ext = filename.split('.')[-1].lower()
        extracted_text = ""

        # 1. Handle PDF Documents
        if ext == 'pdf':
            pdf = PdfReader(file_obj)
            text_layers = []
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_layers.append(page_text)
            extracted_text = "\n".join(text_layers)

        # 2. Handle Microsoft Word Documents (.docx)
        elif ext == 'docx':
            doc = DocxReader(file_obj)
            text_layers = [p.text for p in doc.paragraphs if p.text.strip()]
            extracted_text = "\n".join(text_layers)

        # 3. Handle Plain Text Documents (.txt)
        elif ext == 'txt':
            extracted_text = file_obj.read().decode('utf-8', errors='ignore')

        else:
            raise ValueError("Unsupported file format. Please upload a PDF, DOCX, or TXT file.")

        return extracted_text.strip()

    @staticmethod
    def split_into_clauses(text: str):
        """Splits a single raw text block into individual paragraph sections."""
        # Split the document by newlines
        raw_paragraphs = text.split('\n')
        clean_paragraphs = []
        
        for p in raw_paragraphs:
            cleaned = p.strip()
            # Only keep paragraphs that contain meaningful legal sentences
            if cleaned and len(cleaned) > 10:
                clean_paragraphs.append(cleaned)
                
        return clean_paragraphs