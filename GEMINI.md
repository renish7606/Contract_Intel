# ContractIntel — Gemini CLI Project Skill

> Drop this file at the **root of your repo** as `GEMINI.md`.  
> Gemini CLI (and Gemini Code Assist in VS Code / IntelliJ) will automatically read it as project-level context before every response.

---

## Project Overview

**ContractIntel** is a privacy-first AI contract analysis tool. Users upload legal contracts (PDF/DOCX); the system scrubs PII, classifies 41+ clause categories, generates a structured summary, and surfaces risk insights — all without sending raw personal data to any external API.

**Live backend:** Render (Django REST)  
**Live frontend:** Vercel (React + Vite)  
**Repo owner:** renish7606  

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TailwindCSS |
| Backend | Django 5, Django REST Framework |
| ML (Clause Classification) | TF-IDF + LinearSVC, trained on CUAD dataset (41+ categories) |
| PII Scrubbing | Two-pass: Regex patterns → spaCy NER (`en_core_web_sm`) |
| AI Summary | Gemini 2.5 Flash Lite (primary) + deterministic local fallback |
| Auth | Google OAuth (django-allauth + react-oauth/google) |
| Document Parsing | pdfplumber (PDF), python-docx (DOCX) |
| Deployment | Backend → Render (free tier, 512MB RAM), Frontend → Vercel |
| Database | SQLite (dev) → PostgreSQL (prod) |

---

## Repository Structure

```
Contract_Intel/
├── backend/
│   ├── contractintel/          # Django project settings
│   ├── analysis/               # Core app
│   │   ├── models.py           # Contract, AnalysisResult, User models
│   │   ├── views.py            # Upload, analyze, summary endpoints
│   │   ├── serializers.py
│   │   ├── pii_scrubber.py     # Two-pass regex + spaCy PII removal
│   │   ├── clause_classifier.py # TF-IDF + LinearSVC pipeline
│   │   ├── gemini_client.py    # Gemini 2.5 Flash Lite + local fallback
│   │   └── urls.py
│   ├── requirements.txt
│   └── render.yaml
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── App.jsx
│   ├── .env.example
│   └── vite.config.js
└── GEMINI.md  ← this file
```

---

## Known Constraints (Critical — Read Before Coding)

1. **Render 30s timeout**: All document processing uses `ThreadPoolExecutor` with an 18-second timeout + local fallback. Never add synchronous blocking calls that exceed ~15 seconds. Use `batch_size` reduction if hitting timeouts.

2. **spaCy model on Render**: `en_core_web_sm` must be listed in `render.yaml` build commands as `python -m spacy download en_core_web_sm`. Do NOT assume it is pre-installed.

3. **Vite env vars**: All frontend environment variables MUST be prefixed with `VITE_` (e.g., `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`). Plain `REACT_APP_` prefixes are for CRA, not Vite.

4. **CORS**: `CORS_ALLOWED_ORIGINS` in Django settings must explicitly include both the Vercel production URL and `http://localhost:5173` for dev. Wildcard is not acceptable.

5. **Google OAuth mobile/incognito**: The OAuth redirect must use `https://` in production. Incognito issues were previously caused by missing `SECURE_CROSS_ORIGIN_OPENER_POLICY` header — keep it set to `same-origin-allow-popups`.

6. **Render free tier cold start**: A keep-alive ping endpoint (`/api/health/`) exists. Frontend pings it on app load to warm the backend before the user uploads a document.

7. **RAM limit (512MB)**: Never load large ML models (e.g., large spaCy models, transformer-based models) in the Django process. Stick to `en_core_web_sm` + sklearn pipeline only.

---

## Active Features

- PDF and DOCX document upload (max 10MB)
- Two-pass PII scrubbing before any external API call
- 41+ clause category classification (CUAD-trained LinearSVC)
- Gemini 2.5 Flash Lite summary generation with local fallback
- Google OAuth login
- Keep-alive health endpoint
- Batch processing with timeout safety

---

## Planned Features (Next Sprint)

The following features are actively being built. When helping with any of these, follow the specifications below exactly.

---

### Feature 1: Landing Page (Public, Pre-Login)

**Goal:** Build trust immediately. Show what ContractIntel does and how privacy is protected — before asking for any login.

**Sections to include (in order):**

1. **Hero** — Headline + subheadline + single CTA button ("Analyse Your Contract — Free")
   - Headline: "Understand Any Contract in 30 Seconds"
   - Subheadline: "AI-powered clause detection and risk summary — your data never leaves your control"
   - CTA scrolls to upload section or redirects to login

2. **How It Works** — 4-step visual flow (horizontal on desktop, vertical on mobile)
   - Step 1: Upload your PDF or DOCX
   - Step 2: PII is automatically redacted before any AI processing
   - Step 3: 41+ contract clauses are detected and classified
   - Step 4: You get a plain-English summary with a risk score

3. **Privacy Section** — Dedicated "Your Privacy, Guaranteed" block
   - Bullet: "PII is scrubbed client-side before reaching our AI"  ← **Note: currently server-side; update copy if changed**
   - Bullet: "Raw contract text is never stored permanently"
   - Bullet: "Gemini API only receives anonymised clause text"
   - Bullet: "No data is sold or shared with third parties"
   - Include a small diagram: Contract → [PII Scrub] → [Clause Analysis] → Summary (no PII visible after first step)

4. **Feature Highlights** — 3-column card grid
   - "41+ Clause Categories" / "Risk Score in Seconds" / "Zero PII to External APIs"

5. **Footer** — GitHub link, LinkedIn, Contact

**Implementation notes:**
- This page is `src/pages/Landing.jsx`
- Route: `/` (unauthenticated users land here; authenticated users redirect to `/dashboard`)
- Use TailwindCSS; no external UI library
- Dark mode support via `dark:` classes
- Animations: use `framer-motion` for the How It Works step reveal (stagger 0.15s per step)

---

### Feature 2: Header with Auth

**Goal:** Clean sticky header with login state awareness.

**Unauthenticated state:**
```
[ContractIntel Logo]          [How It Works]  [Privacy]  [Login with Google →]
```

**Authenticated state:**
```
[ContractIntel Logo]          [Dashboard]  [History]  [Avatar + Name ▼]
                                                         └ Sign Out
```

**Implementation notes:**
- Component: `src/components/Header.jsx`
- Auth state from `useAuth` context (`src/context/AuthContext.jsx`)
- Google OAuth handled via `@react-oauth/google` — `GoogleLogin` component
- On successful login, store JWT token in `localStorage` as `ci_token` and user profile as `ci_user`
- Avatar: use Google profile picture from OAuth response; fallback to initials avatar
- Header is sticky (`sticky top-0 z-50`) with a subtle backdrop blur (`backdrop-blur-md bg-white/80`)

---

### Feature 3: Post-Login Dashboard

**Goal:** The user's home after login. Upload a new contract or view past analyses.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Welcome back, [Name]               [+ New Analysis] │
├───────────────────┬─────────────────────────────────┤
│                   │                                 │
│  Upload Panel     │   Recent Analyses               │
│                   │   (list of past contracts)      │
│  [Drag & Drop     │                                 │
│   or Browse]      │   Contract_A.pdf  High Risk  → │
│                   │   NDA_2024.pdf    Low Risk   → │
│  Supported:       │   Lease_June.pdf  Med Risk   → │
│  PDF, DOCX        │                                 │
│  Max 10MB         │                                 │
│                   │                                 │
└───────────────────┴─────────────────────────────────┘
```

**Implementation notes:**
- Page: `src/pages/Dashboard.jsx`
- Route: `/dashboard` (protected; redirect to `/` if not authenticated)
- Upload component: `src/components/UploadPanel.jsx`
  - Drag-and-drop via `react-dropzone`
  - File validation: PDF/DOCX only, max 10MB, client-side before API call
  - On drop: show filename + size + "Analysing..." spinner
  - POST to `VITE_API_URL/api/analyse/` with `multipart/form-data`
  - Include `Authorization: Bearer <ci_token>` header
- Recent analyses: GET `VITE_API_URL/api/history/` — list of past `AnalysisResult` objects
- Each history item shows: filename, risk badge, date, arrow link to full result
- Risk badge colours: `bg-red-100 text-red-700` (High), `bg-yellow-100 text-yellow-700` (Medium), `bg-green-100 text-green-700` (Low)

---

### Feature 4: Redaction Disclosure Panel

**Goal:** Show the user exactly what PII was removed before analysis. Builds trust.

**Component:** `src/components/RedactionPanel.jsx`

**Display format:**
```
┌─────────────────────────────────────────────────────┐
│  🔒 Privacy Shield Applied                          │
│  We removed 7 pieces of personal data before        │
│  sending your contract for analysis.                │
│                                                     │
│  Removed:  3 × Person Name   2 × Email Address     │
│            1 × Phone Number  1 × Organization      │
│                                                     │
│  [View Redacted Preview ▼]                         │
└─────────────────────────────────────────────────────┘
```

**Backend:** The `/api/analyse/` response must include a `redaction_summary` field:
```json
{
  "redaction_summary": {
    "total_removed": 7,
    "by_type": {
      "PERSON": 3,
      "EMAIL": 2,
      "PHONE": 1,
      "ORG": 1
    }
  }
}
```
Add this to `pii_scrubber.py` — count entities removed by category and return alongside scrubbed text.

---

### Feature 5: Restructured Summary Card (MOST IMPORTANT)

**Goal:** The current summary output is a wall of text across multiple tabs. Replace it with a single, scannable Summary Card that answers the user's real question: "Should I sign this, and what do I need to know?"

**Summary Card structure:**

```
┌─────────────────────────────────────────────────────────┐
│  CONTRACT SUMMARY                          [HIGH RISK ⚠] │
│  Analysed: Service_Agreement_2024.pdf                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  📋 What This Contract Is                              │
│  [2-sentence plain-English description of contract type │
│  and parties involved, no legal jargon]                 │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  ⚠️  Critical Clauses to Review (3 found)              │
│                                                         │
│  • Limitation of Liability  — Caps liability at $500.  │
│    You waive rights to consequential damages.          │
│                                                         │
│  • Termination Without Cause — Either party can        │
│    terminate with 14 days notice. No compensation.     │
│                                                         │
│  • Intellectual Property Assignment — All work product │
│    becomes company property, including pre-existing IP.│
│                                                         │
├─────────────────────────────────────────────────────────┤
│  ✅  Standard Clauses (38 present)                     │
│  Confidentiality · Governing Law · Dispute Resolution  │
│  Payment Terms · Force Majeure  [+ 33 more ▼]         │
├─────────────────────────────────────────────────────────┤
│  💡 Plain-English Verdict                              │
│  "This is a standard service contract with three       │
│  clauses that warrant legal review before signing.     │
│  The IP assignment clause is unusually broad."        │
│                                                         │
│  [Download Report PDF]   [Copy Summary]   [New Upload] │
└─────────────────────────────────────────────────────────┘
```

**Risk Score Logic (backend, `analysis/views.py`):**
```python
def calculate_risk_score(flagged_clauses: list) -> str:
    HIGH_RISK_CLAUSE_TYPES = [
        "Limitation of Liability", "IP Assignment", "Non-Compete",
        "Automatic Renewal", "Unilateral Amendment", "Indemnification"
    ]
    high_count = sum(1 for c in flagged_clauses if c["type"] in HIGH_RISK_CLAUSE_TYPES)
    if high_count >= 3:
        return "HIGH"
    elif high_count >= 1:
        return "MEDIUM"
    return "LOW"
```

**Gemini prompt for summary generation (`gemini_client.py`):**

```python
SUMMARY_PROMPT = """
You are a legal contract analyst. Analyse the following anonymised contract text and return a JSON object with exactly these fields:

{
  "contract_type": "short description (e.g., Service Agreement, NDA, Employment Contract)",
  "parties_description": "plain-English description of who the parties are (use [Party A] and [Party B] since PII was removed)",
  "what_this_is": "2 sentences max. Plain English. No legal jargon. What this contract does.",
  "critical_clauses": [
    {
      "name": "clause name",
      "why_critical": "1-2 sentence explanation of why this clause is risky or unusual",
      "extracted_text": "the relevant clause text (50 words max)"
    }
  ],
  "verdict": "2-3 sentences. Would a non-lawyer understand what they're signing? What's the #1 thing they should know?",
  "standard_clause_names": ["list", "of", "standard", "clause", "names"]
}

CRITICAL_CLAUSE_THRESHOLD: Only include clauses in critical_clauses if they:
- Limit the user's rights significantly
- Create unusual financial obligations
- Transfer IP or ownership
- Have auto-renewal or hard-to-exit terms
- Contain indemnification obligations

DO NOT include standard boilerplate (governing law, notices, severability) as critical.
Respond ONLY with valid JSON. No preamble, no explanation.

CONTRACT TEXT:
{contract_text}
"""
```

**Frontend rendering (`src/components/SummaryCard.jsx`):**
- Risk badge: fixed to top-right of card, colour-coded
- Critical clauses: always visible, never collapsed
- Standard clauses: collapsed by default, expandable
- Verdict: highlighted with a soft background (`bg-blue-50 dark:bg-blue-900/20`)
- Action buttons: Download PDF (use `jsPDF`), Copy (clipboard API), New Upload (navigate to dashboard)
- If `critical_clauses` is empty: show a green "✅ No High-Risk Clauses Found" banner instead

---

## API Endpoints Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/analyse/` | Required | Upload + analyse document |
| GET | `/api/history/` | Required | List user's past analyses |
| GET | `/api/result/<id>/` | Required | Get single analysis result |
| GET | `/api/health/` | None | Keep-alive ping |
| POST | `/auth/google/` | None | Google OAuth token exchange |

**Analyse response shape:**
```json
{
  "id": "uuid",
  "filename": "contract.pdf",
  "risk_score": "HIGH",
  "redaction_summary": { "total_removed": 7, "by_type": { "PERSON": 3 } },
  "summary": {
    "contract_type": "Service Agreement",
    "what_this_is": "...",
    "critical_clauses": [...],
    "standard_clause_names": [...],
    "verdict": "..."
  },
  "clause_classifications": { "Limitation of Liability": 0.94, ... },
  "created_at": "2024-06-24T10:30:00Z"
}
```

---

## Code Style Rules

- **Python**: Follow PEP 8. Type hints on all function signatures. Docstrings on all class methods.
- **React**: Functional components only. Custom hooks for all API calls (`useAnalysis`, `useHistory`, `useAuth`). No class components.
- **TailwindCSS**: Utility classes only. No inline `style={{}}` props unless absolutely necessary (e.g., dynamic colours).
- **No new dependencies** without checking Render's 512MB RAM limit impact.
- **Error boundaries**: Wrap `SummaryCard` and `UploadPanel` in React error boundaries.
- **Loading states**: Every async operation must have an explicit loading state shown to the user.

---

## Environment Variables

**Backend (`.env`):**
```
DJANGO_SECRET_KEY=
DJANGO_DEBUG=False
ALLOWED_HOSTS=contractintel-backend.onrender.com,localhost
CORS_ALLOWED_ORIGINS=https://contractintel.vercel.app,http://localhost:5173
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GEMINI_API_KEY=
DATABASE_URL=  # PostgreSQL URL for prod
```

**Frontend (`.env.local`):**
```
VITE_API_URL=https://contractintel-backend.onrender.com
VITE_GOOGLE_CLIENT_ID=
```

---

## Testing Checklist (Run Before Every PR)

- [ ] Upload a PDF — does PII scrubbing run? Does `redaction_summary` return?
- [ ] Upload a DOCX — same check
- [ ] Upload a file > 10MB — does client-side validation block it?
- [ ] Upload a non-PDF/DOCX — does client-side validation show an error?
- [ ] Login with Google — does `/dashboard` load with correct user name?
- [ ] Open in incognito — does OAuth complete without popup issues?
- [ ] Visit `/dashboard` without login — does it redirect to `/`?
- [ ] Simulate Render cold start (wait 15 min, then upload) — does keep-alive work?
- [ ] Check risk score: contract with 3+ high-risk clauses should show HIGH
- [ ] Summary card: critical clauses visible, standard clauses collapsed

---

## Common Mistakes to Avoid

1. **Never use `React.useEffect` with an empty dep array to fetch user data** — use the `useAuth()` hook which handles token refresh and expiry.
2. **Never call `/api/analyse/` without the `Authorization` header** — the backend will return 401 and the error message will be confusing.
3. **Never pass raw contract text directly to Gemini** — always route through `pii_scrubber.py` first. This is a privacy guarantee, not optional.
4. **Never collapse critical clauses** — they must always be visible without user interaction.
5. **Never show raw clause classification scores to users** — only show clause names and human-readable descriptions in the UI.

---

*Last updated: June 2026 | maintainer: renish7606*
