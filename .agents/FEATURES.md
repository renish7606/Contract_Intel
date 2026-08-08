# ContractIntel — Advanced Features Implementation Skill

> Implementation-ready spec for Gemini CLI / Claude Code.
> Revised priority order: build in the sequence below — each phase is
> lower-risk and builds on infrastructure the previous phase already added.

---

## Why This Order

The original three features (Redline Comparison, Explainable Scoring,
Negotiation Suggestions) are strongest when combined, but they are NOT
equal in implementation risk. Given ContractIntel already runs on
Render's free tier (512MB RAM, 30s timeout, prone to 502s under load —
see prior incident), features are ordered from **lowest risk / most
reuse of existing code** to **highest risk / most new infrastructure**:

1. **Explainable Clause-Level Risk Scoring** — enriches the existing
   single-document Gemini call. No new upload UI, no new algorithm.
2. **Clause Negotiation Suggestions** — extends the same Gemini call
   from Phase 1 with one more output field. Zero new infrastructure.
3. **Redline / Version Comparison** — genuinely new: two-file upload,
   clause alignment, diffing. Build this last, once 1+2 are stable
   and demoable.

Do not start Phase 3 until Phase 1 and 2 are deployed and confirmed
working on the live Render backend without new 502s.

---

## Phase 1 — Explainable Clause-Level Risk Scoring

### Goal
Replace the current single overall risk score with a per-clause
breakdown, so the user understands *which* clauses drive the risk and
*why* — not just a HIGH/MEDIUM/LOW badge with no reasoning.

### What changes
This is **not** a new pipeline stage. It's a richer prompt on the
existing `SUMMARY_PROMPT` call in `gemini_client.py` — the same
request you already make, asking for more structured output.

### Updated Gemini prompt addition

Add this to the existing JSON schema requested in `SUMMARY_PROMPT`:

```python
CLAUSE_SCORING_ADDITION = """
For each clause in critical_clauses, also include these fields:

{
  "name": "...",              # already exists
  "plain_explanation": "...", # already exists
  "risk_level": "...",        # already exists — HIGH or MEDIUM

  "risk_score": 0-100,        # NEW — numeric score, your judgment as the model
  "detected_text": "the exact clause text that drove this score, max 40 words",  # NEW
  "why_risky": "1 sentence: what specifically makes this risky",  # NEW
  "who_benefits": "Service Provider" or "Customer" or "Neither party specifically",  # NEW
  "potential_impact": "1 sentence: what could actually happen to the user because of this clause",  # NEW
  "confidence": "HIGH" or "MEDIUM" or "LOW"  # NEW — how confident the model is in this assessment
}

IMPORTANT: risk_score is a direct LLM judgment (0-100), not a computed
formula. Do not claim it is derived from sub-scores — just provide your
best single number based on: financial exposure, one-sidedness, missing
protections, and how unusual the term is versus standard contracts.
Be honest and consistent — a clause capping liability at 12 months fees
is materially different risk than one with no cap at all.
"""
```

Append `CLAUSE_SCORING_ADDITION` to your existing `SUMMARY_PROMPT`
string — do not create a second Gemini call for this.

### Overall score calculation (backend, no LLM call needed)

```python
def calculate_overall_risk(critical_clauses: list) -> dict:
    """
    Aggregate per-clause risk_score into one overall number.
    Pure Python — no extra Gemini call.
    """
    if not critical_clauses:
        return {"score": 10, "level": "LOW"}

    # Weight HIGH-confidence scores more than LOW-confidence ones
    confidence_weight = {"HIGH": 1.0, "MEDIUM": 0.7, "LOW": 0.4}

    weighted_scores = [
        c["risk_score"] * confidence_weight.get(c.get("confidence", "MEDIUM"), 0.7)
        for c in critical_clauses
    ]
    weights = [confidence_weight.get(c.get("confidence", "MEDIUM"), 0.7) for c in critical_clauses]

    overall = sum(weighted_scores) / sum(weights) if weights else 0

    level = "HIGH" if overall >= 65 else "MEDIUM" if overall >= 35 else "LOW"

    return {"score": round(overall), "level": level}
```

### Frontend — Risk Breakdown UI

Add to `SummaryCard.jsx`, above the existing critical clauses list:

```jsx
// Risk Breakdown bar chart — one row per critical clause
<div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm mb-4">
  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
    Risk Breakdown
  </h3>
  {criticalClauses.map(clause => (
    <div key={clause.name} className="flex items-center gap-3 mb-3">
      <span className="text-sm text-gray-700 w-40 truncate">{clause.name}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${
            clause.risk_score >= 65 ? 'bg-red-500' :
            clause.risk_score >= 35 ? 'bg-yellow-500' : 'bg-green-500'
          }`}
          style={{ width: `${clause.risk_score}%` }}
        />
      </div>
      <span className="text-sm font-medium text-gray-600 w-12 text-right">
        {clause.risk_score}/100
      </span>
    </div>
  ))}
</div>
```

Each clause card, when expanded, should show `why_risky`,
`who_benefits`, and `potential_impact` as labeled rows — reuse the
existing critical clause card component, just add these three fields
under the existing `plain_explanation`.

### Definition of Done — Phase 1
- [ ] Overall risk score is now a computed aggregate, not a flat LLM guess
- [ ] Every critical clause shows: score, why it's risky, who benefits, potential impact
- [ ] Risk Breakdown bar chart renders on the summary card
- [ ] No new Gemini API calls added — same request, richer response
- [ ] Tested on Render: confirm response time hasn't increased past the 18s local-fallback threshold

---

## Phase 2 — Clause Negotiation Suggestions

### Goal
For every critical clause, suggest what the user could ask to change —
turning the tool from diagnostic to actionable.

### What changes
Same principle as Phase 1 — extend the existing prompt, don't add a
new API call.

### Updated Gemini prompt addition

```python
NEGOTIATION_ADDITION = """
For each clause in critical_clauses, also include:

{
  "suggested_action": "1 short sentence — what to ask for, e.g. 'Request a liability cap of 12 months' fees.'",  # NEW
  "suggested_clause_text": "A rewritten version of this clause that would be fairer to the user, 1-2 sentences. Write it as actual contract language.",  # NEW
  "suggestion_reasoning": "1 sentence: why this specific change addresses the risk"  # NEW
}

Only generate suggested_action and suggested_clause_text for clauses
where risk_level is HIGH or MEDIUM. Do not suggest changes to LOW-risk
or standard clauses.

Keep suggested_clause_text realistic and generic — it is a starting
point for negotiation, not a guaranteed legally sound replacement.
"""
```

Append to the same prompt as Phase 1. One Gemini call now returns:
plain summary + key facts + critical clauses with scores + negotiation
suggestions, all in one response.

### Frontend — Negotiation Card

Extend each critical clause card in `SummaryCard.jsx`:

```jsx
{clause.suggested_action && (
  <div className="mt-3 pt-3 border-t border-gray-100">
    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
      💡 Suggested Action
    </p>
    <p className="text-sm text-gray-700">{clause.suggested_action}</p>

    <div className="mt-2 bg-blue-50 rounded-lg p-3">
      <p className="text-xs text-gray-500 mb-1">Suggested Alternative Wording</p>
      <p className="text-sm text-gray-800 italic">"{clause.suggested_clause_text}"</p>
      <button
        onClick={() => navigator.clipboard.writeText(clause.suggested_clause_text)}
        className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
      >
        Copy Suggested Clause
      </button>
    </div>
  </div>
)}
```

### Required disclaimer

Add this once, near the top of the summary card (not per-clause — it
would be repetitive):

```jsx
<p className="text-xs text-gray-400 mt-2">
  ⚠️ Risk scores and negotiation suggestions are AI-generated for
  informational purposes and are not a substitute for advice from a
  qualified legal professional.
</p>
```

### Definition of Done — Phase 2
- [ ] Every HIGH/MEDIUM clause shows a suggested action and alternative wording
- [ ] "Copy Suggested Clause" button works
- [ ] Disclaimer is visible on every analysis result page
- [ ] No new Gemini API calls — extends the same call from Phase 1

---

## Phase 3 — Redline / Version Comparison

**Do not start this phase until Phase 1 and 2 are live and stable.**

### Goal
User uploads two versions of the same contract. ContractIntel aligns
matching clauses between versions, detects what changed, and shows the
risk impact of each change.

### The hard part — clause alignment (this was underspecified before)

Naive line-by-line or position-based diffing breaks the moment a clause
is reordered, added, or removed. **Use the existing TF-IDF clause
classifier to align clauses by category, not by position:**

```python
def align_clauses(v1_clauses: list, v2_clauses: list) -> list:
    """
    Match clauses between two contract versions using the existing
    clause_classifier.py categories — not text position.

    v1_clauses / v2_clauses: list of dicts like
        {"category": "Payment Terms", "text": "...", "confidence": 0.91}

    Returns list of aligned pairs:
        {"category": "Payment Terms", "v1_text": "...", "v2_text": "...", "status": "modified"}
        {"category": "Non-Compete", "v1_text": "...", "v2_text": None, "status": "removed"}
        {"category": "Data Retention", "v1_text": None, "v2_text": "...", "status": "added"}
    """
    v1_by_category = {c["category"]: c for c in v1_clauses}
    v2_by_category = {c["category"]: c for c in v2_clauses}

    all_categories = set(v1_by_category) | set(v2_by_category)
    aligned = []

    for category in all_categories:
        v1_clause = v1_by_category.get(category)
        v2_clause = v2_by_category.get(category)

        if v1_clause and v2_clause:
            status = "modified" if v1_clause["text"] != v2_clause["text"] else "unchanged"
        elif v1_clause and not v2_clause:
            status = "removed"
        else:
            status = "added"

        aligned.append({
            "category": category,
            "v1_text": v1_clause["text"] if v1_clause else None,
            "v2_text": v2_clause["text"] if v2_clause else None,
            "status": status,
        })

    return aligned
```

This reuses `clause_classifier.py` — run it on both documents
separately, then align by category label. No new ML model needed.

### Diffing the modified clauses

For clauses with `status: "modified"`, use word-level diffing to
highlight exactly what changed:

```python
import difflib

def word_diff(text_v1: str, text_v2: str) -> dict:
    """Word-level diff for display — highlights added/removed words."""
    v1_words = text_v1.split()
    v2_words = text_v2.split()
    matcher = difflib.SequenceMatcher(None, v1_words, v2_words)

    diff_html = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            diff_html.append({"type": "same", "text": " ".join(v1_words[i1:i2])})
        elif tag == 'delete':
            diff_html.append({"type": "removed", "text": " ".join(v1_words[i1:i2])})
        elif tag == 'insert':
            diff_html.append({"type": "added", "text": " ".join(v2_words[j1:j2])})
        elif tag == 'replace':
            diff_html.append({"type": "removed", "text": " ".join(v1_words[i1:i2])})
            diff_html.append({"type": "added", "text": " ".join(v2_words[j1:j2])})

    return {"diff": diff_html}
```

### Cost control — batch the risk-impact explanation

For each `modified`, `added`, or `removed` clause, you need one
sentence explaining the risk impact of the change. **Do not call
Gemini once per clause** — batch all changed clauses into a single
prompt:

```python
BATCH_CHANGE_EXPLANATION_PROMPT = """
For each contract clause change below, explain in 1 sentence what the
practical impact of this change is, and whether it makes the contract
MORE or LESS risky for the person receiving this contract (not the
party who drafted it).

Return a JSON array, one object per change, in the same order given:

[
  {
    "category": "clause category from input",
    "impact_direction": "MORE_RISKY" or "LESS_RISKY" or "NEUTRAL",
    "impact_score": 0-100,
    "explanation": "1 sentence"
  }
]

CHANGES:
{changes_list}
"""
```

This keeps it to **one Gemini call for the entire comparison**,
regardless of how many clauses changed — critical for staying inside
Render's timeout.

### UI — Comparison Mode

This is additive, not a replacement for the existing single-upload
flow:

```jsx
// On Dashboard.jsx — add a toggle above the upload panel
<div className="flex gap-2 mb-4">
  <button
    onClick={() => setMode('single')}
    className={mode === 'single' ? 'active-tab' : 'tab'}
  >
    Analyse Contract
  </button>
  <button
    onClick={() => setMode('compare')}
    className={mode === 'compare' ? 'active-tab' : 'tab'}
  >
    Compare Versions
  </button>
</div>

{mode === 'compare' && (
  <div className="grid grid-cols-2 gap-4">
    <UploadPanel label="Version 1 (Original)" onUpload={setV1File} />
    <UploadPanel label="Version 2 (Revised)" onUpload={setV2File} />
  </div>
)}
```

### UI — Comparison Result

```jsx
{comparisonResults.map(change => (
  <div key={change.category} className={`rounded-xl p-4 border ${
    change.status === 'added' ? 'border-green-200 bg-green-50' :
    change.status === 'removed' ? 'border-red-200 bg-red-50' :
    'border-yellow-200 bg-yellow-50'
  }`}>
    <div className="flex justify-between items-center mb-2">
      <h4 className="font-semibold">{change.category}</h4>
      <span className="text-xs uppercase font-medium">{change.status}</span>
    </div>

    {change.status === 'modified' && (
      <div className="text-sm space-y-1">
        {change.diff.map((part, i) => (
          <span
            key={i}
            className={
              part.type === 'added' ? 'bg-green-200 line-through-none' :
              part.type === 'removed' ? 'bg-red-200 line-through' :
              ''
            }
          >
            {part.text}{' '}
          </span>
        ))}
      </div>
    )}

    <p className="text-sm text-gray-600 mt-2">{change.explanation}</p>
  </div>
))}
```

### New API endpoint

```
POST /api/compare/
Body: multipart/form-data with file_v1, file_v2
Auth: Required

Response:
{
  "id": "uuid",
  "overall_change_summary": "3 major changes detected, 2 increase risk",
  "changes": [
    {
      "category": "Payment Terms",
      "status": "modified",
      "v1_text": "...",
      "v2_text": "...",
      "diff": [...],
      "impact_direction": "MORE_RISKY",
      "impact_score": 55,
      "explanation": "Payment window shortened from 30 to 15 days, increasing pressure on the paying party."
    }
  ]
}
```

### Definition of Done — Phase 3
- [ ] Clause alignment uses the existing classifier by category, not text position
- [ ] Word-level diff renders with added (green) / removed (red) highlighting
- [ ] Only ONE Gemini call per comparison, regardless of clause count
- [ ] Comparison mode is a toggle, doesn't replace single-document analysis
- [ ] Tested with: identical documents (should show "no changes"), completely different documents (should handle gracefully), documents with reordered clauses (alignment should still work)

---

## What NOT to Build (Scope Guard)

To keep this shippable on a free-tier backend:

- ❌ Don't build a formula-based risk score with fake sub-component
  weights — be honest that it's an LLM judgment call
- ❌ Don't call Gemini separately for scoring, then again for
  suggestions, then again for comparison — batch everything possible
  into single calls
- ❌ Don't support more than 2 document versions in comparison mode
  for now — that's a v2 feature
- ❌ Don't remove or hide the existing single-document analysis flow —
  comparison is additive

---

## Summary — Effort vs Risk

| Phase | New Gemini Calls | New UI | New Algorithm | Risk |
|---|---|---|---|---|
| 1. Risk Scoring | 0 (extends existing) | Bar chart | None (aggregation is pure math) | Low |
| 2. Negotiation | 0 (extends existing) | Suggestion cards | None | Low |
| 3. Redline Comparison | 1 (batched) | Toggle + diff view | Clause alignment + word diff | Medium |

Build in this order. Each phase should be its own PR, deployed and
verified on the live Render backend before starting the next.
