# ContractIntel — Fix Skill
## Two Critical Issues + Complete Implementation Guide

---

## ISSUE 1 — Summary Is Generic & Unreadable

### Root Cause Diagnosis

The summary currently outputs:
> *"This document is a Contract outlining legal and commercial obligations. The contracting parties are defined in the opening clauses."*

This is the **local fallback firing**, not Gemini. When Render cold-starts (after 15 min idle), the full pipeline exceeds the 18-second timeout → Gemini never runs → local template fires → useless generic text.

**Secondary problem:** Even when Gemini does run, the current prompt does not ask for specific facts (payment amount, parties, duration, termination terms). ChatGPT's output shows what the prompt MUST extract:

✅ ChatGPT result (target):
> *"This agreement is between a software service provider and a client for software testing and quality assurance work. The provider will be paid USD 4,500 per month, must keep the client's confidential information private, and the client will own the project deliverables after full payment. The agreement lasts 12 months, can be ended with 30 days' written notice, and any disputes will be settled through arbitration in Chicago, Illinois, under Illinois law."*

❌ ContractIntel result (current):
> *"This document is a Contract outlining legal and commercial obligations. The contracting parties are defined in the opening clauses. It mainly covers Document Name, Parties, Audit Rights terms."*

**Third problem:** 38 "Critical Clauses" — the threshold is too low, everything is flagged. A non-lawyer sees 38 warnings and panics or ignores all of them. Max 5 should be shown as critical.

---

### Fix 1A — New Gemini Prompt (`backend/analysis/gemini_client.py`)

Replace the existing `SUMMARY_PROMPT` with this:

```python
SUMMARY_PROMPT = """
You are a legal assistant helping non-lawyers understand contracts.
Analyse the following contract text and return ONLY a JSON object — no preamble, no explanation, no markdown.

Extract the actual specific facts from the contract. Do NOT use generic phrases like
"legal and commercial obligations" or "as defined in the opening clauses".
If information is not found, write "Not specified" — never guess or use placeholders.

Return this exact JSON structure:

{
  "plain_summary": "Write 3-4 sentences in plain English that a non-lawyer can understand. Include: (1) what type of agreement this is and who the parties are, (2) what service or work is involved and the payment amount if mentioned, (3) how long the contract lasts and how it can be ended, (4) where disputes are resolved. Use simple words. No legal jargon. Copy the style of this example: 'This agreement is between a software provider and a client for software testing work. The provider will be paid USD 4,500 per month and must keep the client's information private. The contract lasts 12 months and can be ended with 30 days notice. Any disputes will be settled through arbitration in Chicago under Illinois law.'",

  "key_facts": {
    "contract_type": "one phrase, e.g. Service Agreement, NDA, Employment Contract, Lease Agreement",
    "party_1": "what type of entity Party 1 is, e.g. software service provider, landlord, employer",
    "party_2": "what type of entity Party 2 is, e.g. client, tenant, employee",
    "payment": "exact payment amount and frequency if mentioned, e.g. USD 4,500 per month. Write Not specified if absent.",
    "duration": "contract length, e.g. 12 months, 2 years, indefinite",
    "termination": "how the contract can be ended, e.g. 30 days written notice by either party",
    "dispute_resolution": "how disputes are handled and where, e.g. arbitration in Chicago, Illinois under Illinois law"
  },

  "critical_clauses": [
    {
      "name": "clause name in plain English",
      "plain_explanation": "1-2 sentences explaining what this clause means for the person signing. Start with 'This means...' or 'This clause says...'",
      "risk_level": "HIGH or MEDIUM"
    }
  ],

  "verdict": "1-2 sentences. The single most important thing this person should know before signing. Be direct and specific."
}

RULES FOR critical_clauses:
- Include MAXIMUM 5 clauses. Choose only the ones that genuinely affect the person's rights or money.
- Only include HIGH risk if the clause: limits liability severely, assigns IP broadly, has auto-renewal traps, restricts what the person can do after the contract ends, or requires large indemnification.
- MEDIUM risk: payment terms, termination penalties, confidentiality obligations, dispute location.
- DO NOT include standard boilerplate: governing law choice, notice requirements, severability, entire agreement clauses.
- Each plain_explanation must be specific to THIS contract's actual text, not generic.

CONTRACT TEXT (PII has been removed and replaced with [REDACTED] tokens):
{contract_text}
"""
```

---

### Fix 1B — Better Local Fallback (`backend/analysis/gemini_client.py`)

The current fallback returns generic template text. Replace it with a fallback that still extracts real information using keyword matching:

```python
def local_fallback_summary(contract_text: str, clause_classifications: dict) -> dict:
    """
    Fallback when Gemini times out. Extracts real facts using keyword/regex matching
    instead of returning generic template text.
    """
    import re

    text_lower = contract_text.lower()

    # --- Extract payment amount ---
    payment = "Not specified"
    payment_patterns = [
        r'\$[\d,]+(?:\.\d{2})?(?:\s*(?:per\s+month|monthly|per\s+year|annually))?',
        r'USD\s*[\d,]+(?:\.\d{2})?',
        r'[\d,]+(?:\.\d{2})?\s*(?:dollars|USD)',
    ]
    for pattern in payment_patterns:
        match = re.search(pattern, contract_text, re.IGNORECASE)
        if match:
            payment = match.group(0).strip()
            break

    # --- Extract duration ---
    duration = "Not specified"
    duration_patterns = [
        r'(?:term|period|duration)[^.]*?(\d+)\s*(month|year|week)',
        r'(\d+)[- ](month|year)[^.]*?(?:term|period|agreement)',
        r'for\s+a\s+period\s+of\s+(\d+)\s+(month|year)',
    ]
    for pattern in duration_patterns:
        match = re.search(pattern, text_lower)
        if match:
            duration = f"{match.group(1)} {match.group(2)}s"
            break

    # --- Extract termination notice ---
    termination = "Not specified"
    term_match = re.search(
        r'(\d+)[- ]day[s]?\s+(?:written\s+)?notice', text_lower
    )
    if term_match:
        termination = f"{term_match.group(1)} days written notice"

    # --- Extract dispute location ---
    dispute = "Not specified"
    if 'arbitration' in text_lower:
        dispute = "Arbitration"
        # Try to find jurisdiction
        juris_match = re.search(
            r'arbitration\s+in\s+([A-Z][a-zA-Z\s,]+?)(?:\.|,|\s+under)',
            contract_text
        )
        if juris_match:
            dispute = f"Arbitration in {juris_match.group(1).strip()}"
    elif 'court' in text_lower:
        dispute = "Court proceedings"

    # --- Build plain summary from extracted facts ---
    facts = []
    top_clauses = sorted(clause_classifications.items(), key=lambda x: x[1], reverse=True)[:3]
    clause_names = [c[0] for c in top_clauses]

    facts.append(f"This is a legal agreement covering {', '.join(clause_names[:2])} terms.")
    if payment != "Not specified":
        facts.append(f"The payment involved is {payment}.")
    if duration != "Not specified":
        facts.append(f"The contract runs for {duration}.")
    if termination != "Not specified":
        facts.append(f"It can be terminated with {termination}.")
    if dispute != "Not specified":
        facts.append(f"Disputes are handled via {dispute}.")

    plain_summary = " ".join(facts) if facts else (
        "This is a legal agreement. Upload a non-scanned PDF for a more detailed analysis."
    )

    return {
        "plain_summary": plain_summary,
        "key_facts": {
            "contract_type": clause_names[0] if clause_names else "Legal Agreement",
            "party_1": "Party as defined in contract",
            "party_2": "Counterparty as defined in contract",
            "payment": payment,
            "duration": duration,
            "termination": termination,
            "dispute_resolution": dispute
        },
        "critical_clauses": [],
        "verdict": "Review the full contract carefully. Enable AI Analysis Mode for a complete risk assessment.",
        "source": "local_fallback"
    }
```

---

### Fix 1C — Redesign the Summary Card UI

**Problem:** The current card shows `What This Contract Is` with 4 bullet-like lines that feel robotic. Replace with a clean layout matching ChatGPT's readable style.

**New SummaryCard structure (`frontend/src/components/SummaryCard.jsx`):**

```jsx
// SECTION 1 — Plain Summary (replaces "What This Contract Is")
// Show plain_summary as a single paragraph in a clean card.
// Large readable font (text-lg), normal line height, no bullet points.

<div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
    📋 What This Contract Says
  </h2>
  <p className="text-gray-800 text-lg leading-relaxed">
    {summary.plain_summary}
  </p>
</div>

// SECTION 2 — Key Facts Grid (replaces "It mainly covers X, Y, Z")
// Show key_facts as a 2-column grid of fact chips

<div className="grid grid-cols-2 gap-3 mt-4">
  {[
    { label: "Contract Type", value: summary.key_facts.contract_type, icon: "📄" },
    { label: "Payment",       value: summary.key_facts.payment,        icon: "💰" },
    { label: "Duration",      value: summary.key_facts.duration,       icon: "📅" },
    { label: "Termination",   value: summary.key_facts.termination,    icon: "🔔" },
    { label: "Disputes",      value: summary.key_facts.dispute_resolution, icon: "⚖️" },
  ].map(fact => (
    <div key={fact.label} className="bg-gray-50 rounded-lg p-3">
      <span className="text-xs text-gray-500">{fact.icon} {fact.label}</span>
      <p className="text-sm font-medium text-gray-800 mt-1">{fact.value}</p>
    </div>
  ))}
</div>

// SECTION 3 — Critical Clauses (MAX 5, not 38)
// Only show clauses where risk_level === "HIGH" or "MEDIUM"
// Each clause shows: name, plain_explanation, risk badge
// plain_explanation starts with "This means..." — no technical text

// REMOVE: "Local trigger matched medium-risk keyword: 'arbitration'"
// That is internal debug text leaking into the UI. Never show source/trigger info to users.

// SECTION 4 — Plain-English Verdict
// Show verdict prominently in a blue highlighted box
// This is the #1 thing the user needs to read
```

---

### Fix 1D — Remove Debug Text From Clause Cards

The clause cards currently show:
> *"Local trigger matched medium-risk clause category: 'Governing Law'."*

This is internal debug info that was accidentally left in the UI. In `SummaryCard.jsx` or wherever clause cards are rendered:

```jsx
// REMOVE this line entirely — never show to users:
// <p className="text-xs text-gray-400 italic">{clause.trigger_info}</p>
// or whatever field renders "Local trigger matched..."

// Only show these three fields per clause:
// 1. clause.name (bold header)
// 2. clause.plain_explanation (the "This means..." text)  
// 3. risk badge (HIGH / MEDIUM)
```

---

## ISSUE 2 — Google Sign-In Fails on Live Site

### Root Cause Diagnosis

The browser console shows:
```
Cross-Origin-Opener-Policy policy would block the window.postMessage call.
```

Google OAuth uses a **popup window** that communicates back to your app via `postMessage`. The `Cross-Origin-Opener-Policy` (COOP) header on Vercel is set to `same-origin` by default, which blocks cross-origin postMessage — killing the OAuth callback.

This only fails on the live Vercel URL, not localhost, because Vercel adds security headers that localhost doesn't have.

---

### Fix 2A — Add `vercel.json` to Frontend Root

Create `frontend/vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cross-Origin-Opener-Policy",
          "value": "same-origin-allow-popups"
        },
        {
          "key": "Cross-Origin-Embedder-Policy",
          "value": "unsafe-none"
        }
      ]
    }
  ]
}
```

**Why `same-origin-allow-popups`?**
- `same-origin` (default) = blocks ALL postMessage from cross-origin popups → kills OAuth
- `same-origin-allow-popups` = allows postMessage only from popups you opened → OAuth works, security maintained

---

### Fix 2B — Verify Google OAuth Authorized Origins

In [Google Cloud Console → APIs & Services → Credentials → your OAuth Client]:

**Authorized JavaScript origins — must include ALL of these:**
```
https://contract-intel-omega.vercel.app
http://localhost:5173
http://localhost:3000
```

**Authorized redirect URIs — must include:**
```
https://contract-intel-omega.vercel.app
https://contract-intel-omega.vercel.app/auth/callback
http://localhost:5173
```

**Common mistake:** Only adding the Vercel URL without `http://localhost` variants, or forgetting to save after adding.

---

### Fix 2C — Django Backend CORS + COOP Headers (`backend/contractintel/settings.py`)

```python
# Ensure these are set correctly:

CORS_ALLOWED_ORIGINS = [
    "https://contract-intel-omega.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
]

CORS_ALLOW_CREDENTIALS = True

# Add this middleware for COOP header on API responses:
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin-allow-popups"
```

---

### Fix 2D — Test OAuth After Deploying

After pushing `vercel.json`, verify the fix:

1. Open `https://contract-intel-omega.vercel.app` in a **normal Chrome window** (not incognito first)
2. Open DevTools → Console
3. Click "Sign in with Google"
4. The popup should open and close cleanly
5. Console should show **zero** `Cross-Origin-Opener-Policy` errors

If it still fails in incognito: Chrome blocks third-party cookies in incognito which affects some OAuth flows. This is expected behaviour — add a note in your UI: *"For best results, sign in using a regular browser window."*

---

## Summary — Files to Change

| File | Change |
|---|---|
| `backend/analysis/gemini_client.py` | Replace `SUMMARY_PROMPT` + replace `local_fallback_summary()` |
| `frontend/src/components/SummaryCard.jsx` | New layout: paragraph summary + key facts grid + max 5 clauses + remove debug text |
| `frontend/vercel.json` | **CREATE NEW** — add COOP header fix |
| `backend/contractintel/settings.py` | Add `SECURE_CROSS_ORIGIN_OPENER_POLICY` |
| Google Cloud Console | Verify authorized origins include localhost + production URL |

---

## What Good Output Looks Like After These Fixes

**Before (current):**
> This document is a Contract outlining legal and commercial obligations. The contracting parties are defined in the opening clauses. It mainly covers Document Name, Parties, Audit Rights terms. Overall risk profile is moderate (score: 43/100).

**After (target):**
> This is a software testing and quality assurance agreement between a service provider and a client. The provider will be paid USD 4,500 per month and must keep all client information confidential. The contract runs for 12 months and can be ended with 30 days written notice. Any disputes will be resolved through arbitration in Chicago under Illinois law.

That is readable. That is what your users need.

---

*Fix skill for ContractIntel — authored June 2026*
