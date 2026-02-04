# ESG Response Generator: Feature & Technical Improvement Plan

## Executive Summary

**Current State:** A functional MVP that parses questionnaires (Excel/CSV/PDF/DOCX), matches questions to data domains via keywords, generates template-based answers from user-entered company data, and exports to CSV.

**Target:** A stateless, privacy-first tool where users upload → process → pay €99 → download + receive email. No data persistence on our side.

**Gap Assessment:** The implementation in `ecosystems-united/tools/esg-response-generator` is significantly more advanced than the V1 spec in `esg-response-generator`, but has notable gaps in several areas that would improve reliability, accuracy, and commercial viability.

---

## Architecture: Stateless "Upload and Done"

### Design Principles
- **Zero data retention** — we don't store company data, questionnaires, or answers
- **Privacy as a feature** — "We never see your data" is a selling point
- **Simple legal posture** — no GDPR data subject requests, no breach risk
- **Browser-first** — all processing happens client-side where possible

### User Flow
```
1. User enters company data (browser only, optional localStorage)
2. Upload questionnaire → parse in browser → match & generate answers
3. Review/edit answers in UI
4. Pay €99 (Stripe)
5. Download Excel + receive email copy
6. Session ends — all data discarded
```

### Tech Stack
```
┌─────────────────────────────────────────────────────────────────┐
│                    Browser                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  React App                                                │  │
│  │  - File parsing (SheetJS, PDF.js, Mammoth)               │  │
│  │  - Keyword matching (rules loaded from CSV)              │  │
│  │  - Answer generation (templates + LLM)                   │  │
│  │  - Excel export (SheetJS)                                │  │
│  │  - LocalStorage (optional, user-controlled)              │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Supabase Edge Functions                            │
│  - generate-answer (LLM calls, stateless)                      │
│  - create-checkout (Stripe session)                            │
│  - send-export (email with attachment)                         │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                 External Services                               │
│  - Stripe (payment processing)                                 │
│  - Anthropic API (LLM, no data retention)                      │
│  - Resend (email delivery)                                     │
└─────────────────────────────────────────────────────────────────┘
```

### What We Store
| Data | Where | Retention |
|------|-------|-----------|
| Payment record | Stripe | Per Stripe policy |
| Email address | Resend (for delivery) | Transient |
| Anonymous analytics | Optional (PostHog) | Aggregated only |

### What We Explicitly DON'T Store
- Company data entered by user
- Uploaded questionnaire files
- Generated answers
- Any supporting documents

---

## Current Implementation Analysis

### What's Working Well ✅

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-format parsing | ✅ Complete | Excel, CSV, PDF, DOCX supported |
| Framework detection | ✅ Complete | CSRD, GRI, CDP, EcoVadis, SASB, TCFD auto-detected |
| Keyword matching | ✅ Complete | ~50 keyword rules covering major ESG domains |
| Template-based answers | ✅ Complete | Rich templates for Energy, Emissions, Workforce, H&S, Waste, Water, etc. |
| Company data input | ✅ Complete | Comprehensive form for all major data categories |
| Emissions estimation | ✅ Basic | Auto-calculates Scope 1/2 from fuel/electricity data |
| Export to CSV | ✅ Complete | Full export with confidence ratings |
| Session persistence | ✅ Complete | LocalStorage-based session recovery |
| Payment flow | ✅ Stubbed | Stripe integration skeleton present |

### Critical Gaps 🔴

| Gap | Impact | Priority |
|-----|--------|----------|
| **Excel export (not CSV)** | Spec requires .xlsx output | P0 |
| **Email delivery** | Users need copy sent to them | P0 |
| **Mapping rules not loaded from CSV** | Hardcoded instead of configurable | P1 |
| **Metric keys not used** | Spec defines canonical keys, not implemented | P1 |
| **No "Unknown" handling per spec** | Should show "Unknown — input required" | P1 |
| **Evidence field missing** | Required output column not present | P1 |
| **LLM integration not functional** | Supabase function exists but not wired up | P2 |

### Moderate Gaps 🟡

| Gap | Impact | Priority |
|-----|--------|----------|
| Unit conversion | No m³→kWh gas conversion etc. | P2 |
| Edit/regenerate individual answers | UI exists but could be improved | P2 |
| Country-specific emission factors | Currently generic values | P2 |
| Multi-site support | Defer to V1.1, design data model now | V1.1 |

---

## Detailed Improvement Plan

### Phase 1: Core Functionality (Priority 0-1)

#### 1.1 Excel Export (.xlsx)
**Current:** CSV export only
**Required:** Proper .xlsx matching template structure

**Work Items:**
- [ ] Use SheetJS (`xlsx` already in dependencies) to write Excel files
- [ ] Match export structure to `exports/answers_export_template.xlsx`:
  - QuestionID
  - Question
  - Category
  - MetricKeysUsed
  - Answer
  - Assumptions
  - Evidence
  - Confidence (Provided | Estimated | Unknown)
- [ ] Apply basic styling (header formatting, column widths)
- [ ] Add data validation for Confidence column (dropdown)

**Effort:** 2-3 hours

#### 1.2 Email Delivery
**Current:** Not implemented
**Required:** Send Excel file to user's email after payment

**Work Items:**
- [ ] Add email input field (collect before/during payment)
- [ ] Set up Resend account and API key
- [ ] Create Edge Function `send-export`:
  ```typescript
  // Receives: email, filename, file (base64), questionnaire name
  // Sends: Email with attachment + receipt info
  ```
- [ ] Email template:
  - Subject: "Your ESG Questionnaire Responses — [Name]"
  - Body: Thank you, brief instructions, support contact
  - Attachment: Generated .xlsx file
- [ ] Trigger after successful Stripe payment (webhook or redirect)
- [ ] Add "Resend email" button in success screen

**Effort:** 3-4 hours

#### 1.3 Load Mapping Rules from CSV
**Current:** `KEYWORD_RULES` hardcoded in `keywordMatcher.ts`
**Required:** Load from `specs/question-mapping-v1.csv` at runtime

**Work Items:**
- [ ] Copy spec CSVs to `public/specs/` folder
- [ ] Create `loadMappingRules()` function to parse CSV
- [ ] Convert CSV format to internal `KeywordRule[]` format
- [ ] Support regex patterns from CSV (priority 1-14)
- [ ] Implement priority-based matching (lower number = higher priority)
- [ ] Fall back to keyword contains if regex fails
- [ ] Cache parsed rules for session

**Effort:** 3-4 hours

#### 1.4 Implement Metric Keys
**Current:** Answers reference data loosely
**Required:** Map to canonical metric keys from `specs/metric-keys-v1.csv`

**Work Items:**
- [ ] Load `metric-keys-v1.csv` at startup
- [ ] Create `MetricKey` type matching CSV schema:
  ```typescript
  interface MetricKey {
    key: string;           // e.g., "energy.electricity_kwh_12m"
    label: string;
    unit: string;
    period: string;
    allowedInputType: 'number' | 'boolean';
    definition: string;
    notes: string;
  }
  ```
- [ ] Map CompanyData fields to metric keys
- [ ] Include `MetricKeysUsed` in export
- [ ] Validate inputs against metric key definitions

**Effort:** 3-4 hours

#### 1.5 Unknown/Missing Data Handling
**Current:** Shows "Insufficient data is currently available..."
**Required:** Explicit "Unknown — input required" + prompt text

**Work Items:**
- [ ] Add `promptIfMissing` from mapping CSV to UI
- [ ] Show explicit prompt when metric value is missing
- [ ] Set Confidence to "Unknown" when data missing
- [ ] Allow user to mark values as "Estimated" with checkbox
- [ ] Track which values are Provided vs Estimated vs Unknown

**Effort:** 2-3 hours

#### 1.6 Evidence Field
**Current:** Not implemented
**Required:** Free-text field per answer

**Work Items:**
- [ ] Add `evidence` field to `AnswerDraft` type
- [ ] Add evidence input field in expanded answer card
- [ ] Include in export
- [ ] Placeholder suggestions (e.g., "Electricity bill Jan–Dec 2025")

**Effort:** 1-2 hours

#### 1.7 Payment Integration (Stripe)
**Current:** Skeleton exists
**Required:** Working €99 one-time payment

**Work Items:**
- [ ] Complete Stripe Checkout integration
- [ ] Set price: €99 (incl. VAT) — yields ~€54 net after fees/tax
- [ ] Success redirect → trigger email + show download
- [ ] Handle payment failures gracefully
- [ ] Add Stripe webhook for reliable email delivery

**Effort:** 3-4 hours

#### 1.8 Executive Summary Sheet
**Current:** Not implemented
**Required:** Professional first sheet in Excel export

**Work Items:**
- [ ] Auto-generate summary sheet as first tab:
  - Company name, reporting period, date generated
  - Framework detected
  - Total questions: X
  - Answers by confidence: X high / Y medium / Z low / W unknown
  - Top 5 data gaps (fields with "Unknown")
  - Simple visual (conditional formatting or mini table)
- [ ] Position as "your at-a-glance status"

**Effort:** 2-3 hours

#### 1.9 Methodology Statement Sheet
**Current:** Not implemented
**Required:** Auditor-friendly documentation

**Work Items:**
- [ ] Second sheet with professional boilerplate:
  - "How this response was prepared"
  - Data sources: user-provided operational data
  - Emission factors used (with sources: DEFRA, IEA, etc.)
  - Calculation methodology for estimates
  - Limitations and assumptions
  - "This document should be reviewed by [Company] before submission"
- [ ] Dynamic sections based on what data was used
- [ ] Suitable for attaching to questionnaire submission

**Effort:** 1-2 hours

#### 1.10 Review Checklist Sheet
**Current:** Not implemented  
**Required:** Actionable next steps for user

**Work Items:**
- [ ] Final sheet listing:
  - All "Estimated" answers → "Verify with source documents"
  - All "Unknown" answers → "Data collection needed"
  - All blank Evidence fields → "Add supporting references"
  - Checkbox column for internal tracking
- [ ] Grouped by category
- [ ] Clear instructions at top

**Effort:** 1-2 hours

---

### Phase 2: Technical Improvements (Priority 2)

#### 2.1 LLM Integration
**Current:** Skeleton exists, not functional
**Required:** Working Claude integration for answer enhancement

**Work Items:**
- [ ] Complete Supabase Edge Function `generate-answer`
- [ ] Add toggle in UI: "Enhance with AI"
- [ ] Implement request/response handling
- [ ] Add fallback to template-based answers on failure
- [ ] Rate limiting per session (prevent abuse)
- [ ] No logging of question/answer content (privacy)

**Effort:** 4-6 hours

#### 2.2 Emission Factor Accuracy
**Current:** Generic factors (0.0004 kgCO2e/kWh electricity, 0.00202 kgCO2e/m³ gas)
**Required:** Country/region-specific factors

**Work Items:**
- [ ] Add emission factor lookup table by country
- [ ] Support location-based vs market-based Scope 2
- [ ] Add gas unit conversion (m³ to kWh: ~10.55 kWh/m³)
- [ ] Allow user to input custom emission factors
- [ ] Source: IEA, DEFRA, EPA factors

**Effort:** 4-5 hours

#### 2.3 Improved Question Parsing
**Current:** Heuristic column detection
**Required:** More robust parsing

**Work Items:**
- [ ] Add manual column mapping UI as fallback
- [ ] Better handling of merged cells
- [ ] Support multi-sheet questionnaires (each tab = section)
- [ ] Preserve questionnaire structure (sections, sub-questions)

**Effort:** 4-5 hours

---

### Phase 3: Polish & Launch (Priority 3)

#### 3.1 Landing Page & Onboarding
**Current:** Basic landing
**Required:** Clear value proposition, trust signals

**Work Items:**
- [ ] Improve landing page copy
- [ ] Add "How it works" walkthrough
- [ ] Add sample output preview
- [ ] Trust signals: "No data stored", frameworks supported
- [ ] FAQ section

**Effort:** 2-3 hours

#### 3.2 Error Handling & Edge Cases
**Current:** Basic try/catch
**Required:** User-friendly error messages

**Work Items:**
- [ ] Add specific error types
- [ ] Show recovery suggestions
- [ ] Graceful degradation when LLM unavailable
- [ ] Handle payment failures with clear next steps

**Effort:** 2-3 hours

#### 3.3 Testing
**Current:** 4 test files, basic coverage
**Required:** Confidence in core flows

**Work Items:**
- [ ] Add tests for question parsing (all file types)
- [ ] Add tests for keyword matching (edge cases)
- [ ] Add tests for Excel export formatting
- [ ] Add golden file comparison test
- [ ] Manual E2E test checklist

**Effort:** 4-6 hours

#### 3.4 Analytics (Optional)
**Current:** None
**Required:** Understand usage without storing PII

**Work Items:**
- [ ] Add anonymous event tracking (PostHog or Plausible)
- [ ] Track: questionnaire uploaded, questions count, framework detected, payment completed
- [ ] No PII, no content logging

**Effort:** 1-2 hours

---

### Deferred to V1.1

| Feature | Rationale |
|---------|-----------|
| Multi-site data entry | Adds significant complexity; users can aggregate manually for V1 |
| Document parsing (extract data from bills) | High complexity, reliability risk; V1 = reference only |
| Questionnaire templates library | Nice-to-have; users upload their own for now |
| Bulk answer editing | Power feature, not essential for launch |

### Future Premium Tier (€149-199)

| Feature | Value Proposition |
|---------|-------------------|
| Benchmark comparison | "See how you compare to industry averages" |
| Detailed gap analysis report | "Prioritized action plan for data collection" |
| Multi-site breakdown | "Site-by-site analysis and aggregation" |
| Year-over-year tracking | "Show progress vs. last year's submission" |
| Custom emission factors | "Use your verified factors, not defaults" |

---

## Ecosystems United Tool Suite (Future Vision)

The Response Generator is one tool in a broader ecosystem. Each tool is focused, standalone, and priced for its specific value.

### The Suite

| Tool | Purpose | User Has | User Needs | Price | Status |
|------|---------|----------|------------|-------|--------|
| **ESG Response Generator** | Answer questionnaires | Data + Questionnaire | Answers | €99 | Building now |
| **Document Data Extractor** | Pull metrics from bills/certs | Documents | Structured data | €29-49 | Future |
| **Readiness Scorecard** | Assess supplier readiness | Nothing | Gap awareness | Free | Exists |
| **Baseline Calculator** | Energy & emissions baseline | Bills/invoices | Emissions numbers | €49? | Exists (Excel) |
| **Compliance Tracker** | Track questionnaire deadlines | Multiple requests | Organization | €19/mo? | Future |

### User Journey

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Readiness     │     │    Document     │     │     Response    │
│   Scorecard     │ ──▶ │    Extractor    │ ──▶ │    Generator    │
│   (Free)        │     │    (€29-49)     │     │    (€99)        │
│                 │     │                 │     │                 │
│ "Am I ready?"   │     │ "Get my data"   │     │ "Answer this"   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Future Bundle

> **"Complete ESG Response Service"** — €149
> Upload your questionnaire AND your utility bills. 
> We extract the data, generate the answers, deliver the pack.

### Product Page Vision

```
Ecosystems United Tools

For suppliers who need to respond to sustainability requests — fast.

┌─────────────────────────────────────────────────────────────────┐
│  ESG Response Generator                                    €99  │
│  Upload questionnaire → Enter data → Get complete response pack │
│  [Get Started]                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Document Data Extractor                              Coming Soon│
│  Upload utility bills & certificates → Get structured data      │
│  [Join Waitlist]                                                │
├─────────────────────────────────────────────────────────────────┤
│  Supplier Readiness Scorecard                              Free │
│  5-minute assessment → Know where you stand                     │
│  [Take Assessment]                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Product Positioning

### What You're Selling (€99)

**"Complete ESG Response Pack"** — not just answers, a professional submission-ready package.

### Landing Page Structure
```
Answer ESG Questionnaires in Minutes, Not Days

Upload your questionnaire. Enter your data. Get a complete response pack.

What You Get:

✓ Draft answers for every question
✓ AI-enhanced professional language  
✓ Confidence ratings (know where you need more data)
✓ Evidence fields for audit trail
✓ Executive Summary with gap overview
✓ Methodology Statement (attach to your submission)
✓ Review Checklist for your team

Works with: CSRD · CDP · EcoVadis · GRI · SASB · TCFD

€99 one-time · Delivered in minutes · No data stored

[Get Started]
```

### Email Delivery Content
```
Subject: Your ESG Response Pack — [Questionnaire Name]

Your Complete ESG Response Pack is attached.

What's inside:
• Executive Summary — your at-a-glance status
• Answers — draft responses for all [X] questions  
• Methodology Statement — attach to your submission
• Review Checklist — action items for your team

Next steps:
1. Review answers marked "Estimated" or "Unknown"
2. Add evidence references where needed
3. Have your team verify key figures
4. Submit to your buyer/platform

Questions? Reply to this email.

—
Ecosystems United
```

---

## Technical Debt to Address

| Issue | Location | Fix |
|-------|----------|-----|
| Corrupted directory names | `src{components/ui,lib/...` | Delete malformed directories |
| Duplicate code with main app | `ecosystems-united/app/src/lib/respond` | Use tools version as source of truth |
| Hardcoded keyword rules | `keywordMatcher.ts` | Load from CSV |
| CSV export only | `App.tsx` | Replace with Excel export |

---

## Files to Modify

### High Priority (Phase 1)
- `src/lib/respond/keywordMatcher.ts` — Load rules from CSV
- `src/lib/respond/types.ts` — Add metric key types, evidence field
- `src/lib/respond/answerGenerator.ts` — Use metric keys, handle Unknown
- `src/lib/respond/dataRetrieval.ts` — Map to metric keys
- `src/App.tsx` — Excel export, evidence input, email collection, payment flow

### New Files Needed
- `src/lib/respond/configLoader.ts` — Load CSVs at startup
- `src/lib/respond/excelExporter.ts` — Excel export logic
- `src/lib/respond/emissionFactors.ts` — Country-specific factors (Phase 2)
- `public/specs/metric-keys-v1.csv` — Copy from spec pack
- `public/specs/question-mapping-v1.csv` — Copy from spec pack
- `supabase/functions/send-export/index.ts` — Email delivery function

### Files to Delete
- `src{components/ui,lib/...` (corrupted directories)

---

## Recommended Sequencing

### Week 1: Core V1 Features (~22-30 hours)
1. Excel export (1.1) — 2-3h
2. Email delivery setup (1.2) — 3-4h
3. Payment integration (1.7) — 3-4h
4. Load mapping rules from CSV (1.3) — 3-4h
5. Implement metric keys (1.4) — 3-4h
6. Unknown handling (1.5) — 2-3h
7. Evidence field (1.6) — 1-2h
8. Executive Summary sheet (1.8) — 2-3h
9. Methodology Statement sheet (1.9) — 1-2h
10. Review Checklist sheet (1.10) — 1-2h

**Milestone:** Working paid product with premium deliverables, can launch

### Week 2: Quality & Enhancement (~12-16 hours)
1. LLM integration (2.1) — 4-6h
2. Emission factors (2.2) — 4-5h
3. Testing (3.3) — 4-6h

**Milestone:** LLM-enhanced, more accurate

### Week 3: Polish & Launch (~6-10 hours)
1. Landing page (3.1) — 2-3h
2. Error handling (3.2) — 2-3h
3. Analytics (3.4) — 1-2h
4. Final testing & bug fixes — 2-3h

**Milestone:** Ready for public launch

---

## External Services Required

| Service | Purpose | Cost | Setup |
|---------|---------|------|-------|
| Stripe | Payments | 1.4% + €0.25 per transaction | Create account, get API keys |
| Resend | Email delivery | Free tier: 100/day, then ~€20/month | Create account, verify domain |
| Anthropic | LLM (Claude) | ~$0.01-0.05 per questionnaire | API key (you have this) |
| Supabase | Edge Functions only | Free tier sufficient | Already set up |

---

## Privacy & Legal

### Privacy Policy (Simple)
```
We do not store your data.

- Company information you enter stays in your browser
- Your questionnaire file is processed locally and discarded
- Generated answers are emailed to you and not retained
- Payment is processed by Stripe (see their privacy policy)
- We collect anonymous usage statistics only

For questions: [email]
```

### Terms of Service (Key Points)
- Tool provides draft responses, not legal/compliance advice
- User responsible for verifying accuracy before submission
- €99 fee is non-refundable after download/email delivery
- No guarantee of questionnaire acceptance by buyers

---

## Success Criteria for V1 Launch

- [ ] Upload `sample_questionnaire_v1.xlsx` successfully
- [ ] All questions mapped using rules from CSV
- [ ] Answers generated for 80%+ of questions
- [ ] Export matches template structure (8 columns)
- [ ] Evidence field present and editable
- [ ] Confidence correctly shows Provided / Estimated / Unknown
- [ ] Payment flow works (Stripe test mode)
- [ ] Email delivery works (with attachment)
- [ ] Golden file test passes
- [ ] No console errors in happy path
- [ ] Works on Chrome, Firefox, Safari
- [ ] Mobile-responsive (review/edit screens)

---

## Claude Code Implementation Instructions

Below are detailed instructions for each task. Copy the relevant section when starting work on that feature.

---

### TASK 1.1: Excel Export (.xlsx)

**Context:**
Currently the app exports to CSV only. We need proper Excel export matching the template structure.

**Files to modify:**
- `src/App.tsx` — replace CSV export with Excel export
- Create new file: `src/lib/respond/excelExporter.ts`

**Dependencies already installed:** `xlsx` (SheetJS)

**Instructions:**

1. Create `src/lib/respond/excelExporter.ts`:
```typescript
// Export function that creates a multi-sheet workbook
// Sheet 1: Executive Summary (Task 1.8)
// Sheet 2: Answers (main data)
// Sheet 3: Methodology (Task 1.9)
// Sheet 4: Review Checklist (Task 1.10)

// For now, implement Sheet 2 (Answers) only. Other sheets will be added later.
```

2. The Answers sheet must have these columns in order:
   - QuestionID (from question.referenceId or question.id)
   - Question (the question text)
   - Category (from question.category or matchResult)
   - MetricKeysUsed (comma-separated list of metric keys)
   - Answer (the generated answer text)
   - Assumptions (from answerDraft.assumptions, joined with semicolons)
   - Evidence (from answerDraft.evidence — new field, may be empty)
   - Confidence (must be exactly: "Provided" | "Estimated" | "Unknown")

3. Map confidence values:
   - "high" → "Provided"
   - "medium" + isEstimate=true → "Estimated"  
   - "medium" + isEstimate=false → "Provided"
   - "low" → "Estimated"
   - "none" → "Unknown"

4. Apply basic styling:
   - Header row: bold, light gray background
   - Column widths: QuestionID (12), Question (50), Category (15), MetricKeysUsed (25), Answer (60), Assumptions (30), Evidence (30), Confidence (12)
   - Wrap text on Answer and Assumptions columns

5. In `App.tsx`, replace the `handleExport` function to use the new exporter.

6. File should download as `{questionnaireName}_responses.xlsx`

**Test:** Export should open correctly in Excel and match the column structure in `exports/answers_export_template.xlsx`

---

### TASK 1.2: Email Delivery (Resend)

**Context:**
After payment, users should receive their Excel file via email. We'll use Resend for delivery.

**Files to create:**
- `supabase/functions/send-export/index.ts`

**Files to modify:**
- `src/App.tsx` — collect email, trigger send after payment

**Setup required:**
- Resend account (resend.com)
- Add `RESEND_API_KEY` to Supabase Edge Function secrets

**Instructions:**

1. Create Edge Function `supabase/functions/send-export/index.ts`:

```typescript
// Receives POST request with:
// {
//   email: string,
//   fileName: string,
//   fileBase64: string,  // The Excel file as base64
//   questionnaireName: string,
//   questionCount: number,
//   framework?: string
// }

// Uses Resend API to send email with attachment
// Resend docs: https://resend.com/docs/send-with-nodejs
```

2. Email template:
   - From: "Ecosystems United <noreply@ecosystemsunited.com>" (or your verified domain)
   - Subject: "Your ESG Response Pack — {questionnaireName}"
   - Body: See "Email Delivery Content" section in this document
   - Attachment: The Excel file

3. In `App.tsx`:
   - Add email input field on payment screen (before Stripe redirect)
   - Store email in state
   - After successful payment return, call the Edge Function with the generated Excel file
   - Show success message: "Your Response Pack has been sent to {email}"
   - Also offer direct download button as backup

4. Error handling:
   - If email fails, still allow download
   - Show message: "Email delivery failed. Please download your file directly."
   - Log error for debugging

**Test:** Complete payment flow in Stripe test mode, verify email arrives with attachment.

---

### TASK 1.3: Load Mapping Rules from CSV

**Context:**
Keyword matching rules are hardcoded in `keywordMatcher.ts`. They should load from CSV files at runtime so rules can be updated without code changes.

**Files to create:**
- `src/lib/respond/configLoader.ts`
- `public/specs/question-mapping-v1.csv` (copy from spec pack)
- `public/specs/metric-keys-v1.csv` (copy from spec pack)

**Files to modify:**
- `src/lib/respond/keywordMatcher.ts`
- `src/App.tsx` — load config on startup

**Instructions:**

1. Copy CSV files from `C:\Users\User\Documents\CY\esg-response-generator\specs\` to `public/specs/`

2. Create `src/lib/respond/configLoader.ts`:

```typescript
// Functions to load and parse the CSV files
// 
// loadMappingRules(): Promise<MappingRule[]>
// - Fetches /specs/question-mapping-v1.csv
// - Parses CSV (can use xlsx library or simple split)
// - Returns array of MappingRule objects
//
// loadMetricKeys(): Promise<MetricKey[]>
// - Fetches /specs/metric-keys-v1.csv
// - Parses and returns MetricKey objects
//
// Cache results so we only load once per session
```

3. MappingRule type (from CSV columns):
```typescript
interface MappingRule {
  priority: number;
  patternType: 'regex' | 'keyword';
  pattern: string;
  category: string;
  metricKeys: string[];  // Split by comma
  answerTemplate: string;
  promptIfMissing: string;
}
```

4. Update `keywordMatcher.ts`:
   - Remove hardcoded KEYWORD_RULES
   - Add function `initializeMatcher(rules: MappingRule[])` 
   - `matchQuestion` should use the loaded rules
   - For regex patterns: `new RegExp(rule.pattern)` and test against question text
   - Sort matches by priority (lower number wins)
   - If tie, prefer longer pattern (more specific)

5. In `App.tsx`, load config on mount:
```typescript
useEffect(() => {
  loadMappingRules().then(rules => initializeMatcher(rules));
  loadMetricKeys().then(keys => initializeMetricKeys(keys));
}, []);
```

**Test:** Matching should produce same results as before. Add a new rule to CSV, reload, verify it works.

---

### TASK 1.4: Implement Metric Keys

**Context:**
Answers should reference canonical metric keys (e.g., "energy.electricity_kwh_12m") so exports show exactly which data fields were used.

**Files to modify:**
- `src/lib/respond/types.ts` — add MetricKey type
- `src/lib/respond/configLoader.ts` — load metric keys
- `src/lib/respond/dataRetrieval.ts` — map CompanyData to metric keys
- `src/lib/respond/answerGenerator.ts` — include metric keys in output

**Instructions:**

1. Add to `types.ts`:
```typescript
interface MetricKey {
  key: string;           // e.g., "energy.electricity_kwh_12m"
  label: string;
  unit: string;
  period: string;        // "12m" or "point"
  allowedInputType: 'number' | 'boolean';
  definition: string;
  notes: string;
}
```

2. Create mapping from CompanyData fields to metric keys:
```typescript
const FIELD_TO_METRIC_KEY: Record<string, string> = {
  'electricityKwh': 'energy.electricity_kwh_12m',
  'naturalGasM3': 'energy.natural_gas_kwh_12m',  // Note: may need conversion
  'dieselLiters': 'energy.fuel_diesel_l_12m',
  'waterM3': 'water.withdrawal_m3_12m',
  'totalWasteKg': 'waste.total_kg_12m',
  'recyclingPercent': 'waste.recycled_kg_12m',  // Calculated field
  'hazardousWasteKg': 'waste.hazardous_kg_12m',
  'employeeCount': 'workforce.headcount_avg_12m',
  'trirRate': 'workforce.ltifr_12m',
  'scope1Tco2e': 'emissions.scope1_tco2e_12m',
  'scope2Tco2e': 'emissions.scope2_tco2e_12m',
  // ... etc
};
```

3. Update `AnswerDraft` type to include `metricKeysUsed: string[]`

4. In `dataRetrieval.ts`, when retrieving data points, tag each with its metric key.

5. In `answerGenerator.ts`, collect all metric keys used and add to draft.

6. In Excel export, join metric keys with commas for the MetricKeysUsed column.

**Test:** Export should show metric keys like "energy.electricity_kwh_12m, emissions.scope2_tco2e_12m" for relevant questions.

---

### TASK 1.5: Unknown/Missing Data Handling

**Context:**
When data is missing, the answer should clearly show "Unknown — input required" and prompt the user for what's needed.

**Files to modify:**
- `src/lib/respond/answerGenerator.ts`
- `src/lib/respond/types.ts`
- `src/App.tsx` — UI for marking estimates

**Instructions:**

1. Update confidence mapping in `answerGenerator.ts`:
   - If no data points available for matched domains → confidence = "none"
   - Answer text should be: "Unknown — input required. [promptIfMissing from mapping rule]"

2. Add to `AnswerDraft` type:
```typescript
  confidenceSource: 'provided' | 'estimated' | 'unknown';
  promptForMissing?: string;  // From mapping rule
```

3. In UI (expanded answer card), add:
   - Checkbox: "☐ This value is estimated" (only show if answer has data)
   - When checked, set `confidenceSource = 'estimated'`
   - Display `promptForMissing` as helper text when confidence is low/none

4. Export mapping:
   - confidenceSource = 'provided' → "Provided"
   - confidenceSource = 'estimated' → "Estimated"
   - confidenceSource = 'unknown' → "Unknown"

**Test:** 
- Question about water with no water data entered → "Unknown" + prompt text
- Question about electricity with data entered → "Provided"
- User checks "estimated" box → "Estimated"

---

### TASK 1.6: Evidence Field

**Context:**
Each answer needs an evidence field where users can note their source documents.

**Files to modify:**
- `src/lib/respond/types.ts`
- `src/lib/respond/answerGenerator.ts`
- `src/App.tsx` — add evidence input
- `src/lib/respond/excelExporter.ts` — include in export

**Instructions:**

1. Add to `AnswerDraft` type:
```typescript
  evidence: string;  // User-entered, defaults to empty
```

2. Initialize with empty string in `generateAnswerDraft`.

3. In `App.tsx`, in the expanded answer card, add:
```tsx
<Input 
  label="Evidence / Source"
  value={draft.evidence}
  onChange={e => updateAnswer(draft.questionId, { evidence: e.target.value })}
  placeholder="e.g., Electricity bill Jan-Dec 2024, ISO 14001 certificate"
/>
```

4. Include in Excel export in the Evidence column.

**Test:** Enter evidence text, export, verify it appears in Excel.

---

### TASK 1.7: Payment Integration (Stripe)

**Context:**
Complete the Stripe integration for €99 one-time payment.

**Files to modify:**
- `src/lib/stripe.ts`
- `src/App.tsx`
- `supabase/functions/create-checkout/index.ts`
- `supabase/functions/verify-payment/index.ts`

**Setup required:**
- Stripe account with product/price created (€99)
- Add `STRIPE_SECRET_KEY` to Supabase secrets
- Add `STRIPE_PRICE_ID` to Supabase secrets
- Set success/cancel URLs

**Instructions:**

1. In Stripe Dashboard:
   - Create Product: "ESG Response Pack"
   - Create Price: €99.00 EUR, one-time
   - Note the Price ID (price_xxxxx)

2. Update `create-checkout/index.ts`:
```typescript
// Create Stripe Checkout Session
// - price: from STRIPE_PRICE_ID env var
// - mode: 'payment'
// - success_url: {origin}?payment=success&session={CHECKOUT_SESSION_ID}
// - cancel_url: {origin}?payment=cancelled
// - customer_email: from request body (pre-fill)
// - metadata: { questionnaireName, questionCount }
```

3. Update `verify-payment/index.ts`:
```typescript
// Retrieve session from Stripe
// Check payment_status === 'paid'
// Return { paid: true/false }
```

4. In `App.tsx`:
   - Collect email on payment screen
   - On "Purchase" click: call create-checkout, redirect to Stripe
   - On return with ?payment=success: verify payment, then trigger email + show download
   - On return with ?payment=cancelled: show message, allow retry

5. For development/testing:
   - Use Stripe test mode
   - Test card: 4242 4242 4242 4242

**Test:** Complete full payment flow in test mode. Verify session state persists across redirect.

---

### TASK 1.8: Executive Summary Sheet

**Context:**
First sheet in Excel export showing at-a-glance status.

**Files to modify:**
- `src/lib/respond/excelExporter.ts`

**Instructions:**

1. Add "Executive Summary" as the first sheet (Sheet 1).

2. Layout:
```
Row 1: "ESG Response Pack — Executive Summary" (bold, larger)
Row 2: (empty)
Row 3: "Company:", {companyName}
Row 4: "Reporting Period:", {reportingPeriod}
Row 5: "Date Generated:", {current date}
Row 6: "Framework Detected:", {framework or "Not detected"}
Row 7: (empty)
Row 8: "Questions Analyzed:", {total count}
Row 9: (empty)
Row 10: "Confidence Breakdown:" (bold)
Row 11: "  Provided:", {count} ({percentage}%)
Row 12: "  Estimated:", {count} ({percentage}%)
Row 13: "  Unknown:", {count} ({percentage}%)
Row 14: (empty)
Row 15: "Top Data Gaps:" (bold, only if there are unknowns)
Row 16-20: List up to 5 items marked "Unknown" with their categories
Row 21: (empty)
Row 22: "Next Steps:" (bold)
Row 23: "1. Review all 'Estimated' answers and verify with source documents"
Row 24: "2. Collect data for 'Unknown' items listed above"
Row 25: "3. Add evidence references in the Answers sheet"
Row 26: "4. Have your team review before submission"
```

3. Apply styling:
   - Title row: bold, font size 14
   - Section headers: bold
   - Column A width: 25, Column B width: 40

**Test:** Export and verify summary sheet appears first with correct data.

---

### TASK 1.9: Methodology Statement Sheet

**Context:**
Second sheet providing auditor-ready documentation of how answers were generated.

**Files to modify:**
- `src/lib/respond/excelExporter.ts`

**Instructions:**

1. Add "Methodology" as Sheet 2 (after Executive Summary, before Answers).

2. Content (static text with some dynamic values):

```
METHODOLOGY STATEMENT

Prepared for: {companyName}
Date: {current date}
Questionnaire: {questionnaireName}

---

1. DATA SOURCES

The responses in this pack are based on operational data provided by {companyName} 
for the reporting period {reportingPeriod}. Data was entered manually by the user 
and has not been independently verified.

Data categories used:
- Energy consumption (electricity, natural gas, diesel)
- Water withdrawal
- Waste generation and disposal
- Workforce metrics
- Health and safety indicators
- Governance and certifications

---

2. EMISSION CALCULATIONS

Where Scope 1 and Scope 2 emissions were not directly provided, estimates were 
calculated using the following emission factors:

Scope 1 (Direct):
- Natural gas: 0.00202 tCO2e per m³
- Diesel: 0.00268 tCO2e per litre

Scope 2 (Indirect - Location-based):
- Grid electricity: 0.0004 tCO2e per kWh (generic factor)

Note: For more accurate emissions reporting, users should apply country-specific 
emission factors from sources such as IEA, DEFRA, or national registries.

---

3. ANSWER GENERATION

Answers were generated using:
- Pattern matching to identify relevant data domains for each question
- Template-based response generation using provided data
- AI-assisted language enhancement (where enabled)

Confidence levels:
- "Provided": Answer based on user-entered data
- "Estimated": Answer includes calculated or estimated values
- "Unknown": Insufficient data to generate a response

---

4. LIMITATIONS

- Data has not been independently verified or audited
- Emission factors used are generic defaults; actual factors may vary by region
- Responses are drafts intended for review before submission
- This tool does not provide compliance or legal advice

---

5. REVIEW REQUIREMENTS

Before submitting these responses, {companyName} should:
1. Verify all data values against source documents
2. Review and adjust estimated values where better data is available
3. Confirm emission calculation methodology meets questionnaire requirements
4. Add specific evidence references where requested
5. Obtain appropriate internal approval

---

Generated by: Ecosystems United ESG Response Generator
```

3. Format as plain text, with section headers bold.

**Test:** Export and verify methodology sheet is readable and professional.

---

### TASK 1.10: Review Checklist Sheet

**Context:**
Final sheet listing action items for the user.

**Files to modify:**
- `src/lib/respond/excelExporter.ts`

**Instructions:**

1. Add "Review Checklist" as the last sheet.

2. Structure as a table:

```
Header Row: "Status", "Item", "Category", "Action Required"

Then list:

Section: "Estimated Values — Verify with Source Documents"
(List all answers where confidenceSource = 'estimated')
- [ ], Question text (truncated), Category, "Verify value and update if needed"

Section: "Unknown Values — Data Collection Needed"  
(List all answers where confidenceSource = 'unknown')
- [ ], Question text (truncated), Category, "Collect data: {promptForMissing}"

Section: "Missing Evidence — Add Source References"
(List all answers where evidence is empty AND confidence is not 'unknown')
- [ ], Question text (truncated), Category, "Add evidence reference"
```

3. The "Status" column should be empty checkboxes (just "☐" character or leave blank for user to mark).

4. Truncate question text to ~60 characters with "..." if longer.

5. Group by section with a header row for each section.

**Test:** Export with mix of estimated/unknown/complete answers, verify checklist reflects the right items.

---

### TASK 2.1: LLM Integration

**Context:**
Enable AI-enhanced answer generation using Claude via Supabase Edge Function.

**Files to modify:**
- `supabase/functions/generate-answer/index.ts`
- `src/lib/respond/llmService.ts`
- `src/lib/respond/answerGenerator.ts`
- `src/App.tsx` — add toggle

**Instructions:**

1. Update `generate-answer/index.ts`:
```typescript
// Receives:
// {
//   question: string,
//   category: string,
//   dataPoints: Array<{ label, value, unit }>,
//   reportingPeriod: string,
//   framework?: string,
//   verbosity: 'concise' | 'standard' | 'detailed'
// }
//
// Calls Anthropic API with structured prompt
// Returns: { success: true, answer: string } or { success: false, error: string }
```

2. System prompt for Claude:
```
You are helping a company respond to an ESG/sustainability questionnaire. 
Generate a professional, factual response based on the provided data.

Rules:
- Use only the data provided. Do not invent numbers.
- Write in first person plural (we, our).
- Be concise but complete.
- If data is incomplete, acknowledge limitations.
- Match the tone expected by {framework} if specified.
```

3. In `answerGenerator.ts`, add option to use LLM:
```typescript
if (config.useLLM) {
  const llmResponse = await generateAnswerWithLLM(buildLLMRequest(...));
  if (llmResponse.success) {
    draft.answer = llmResponse.answer;
  }
  // Fall back to template if LLM fails
}
```

4. In `App.tsx`:
   - Add toggle in company data or settings: "☑ Enhance answers with AI"
   - Default: ON
   - Pass to generation config

5. Rate limiting:
   - Track LLM calls per session
   - Cap at ~100 questions per session (prevent abuse)

**Test:** Generate answers with LLM enabled, compare quality to template-only.

---

### TASK 2.2: Emission Factor Accuracy

**Context:**
Replace generic emission factors with country-specific values.

**Files to create:**
- `src/lib/respond/emissionFactors.ts`

**Files to modify:**
- `src/lib/respond/dataRetrieval.ts`

**Instructions:**

1. Create `emissionFactors.ts` with lookup tables:

```typescript
// Scope 2 electricity factors by country (tCO2e per kWh)
// Source: IEA 2023 or latest available
const ELECTRICITY_FACTORS: Record<string, number> = {
  'Germany': 0.000385,
  'France': 0.000052,
  'Poland': 0.000765,
  'United Kingdom': 0.000207,
  'United States': 0.000417,
  // ... add major countries
  'default': 0.0004,
};

// Natural gas: relatively consistent globally
const NATURAL_GAS_FACTOR = 0.00202; // tCO2e per m³

// Diesel: relatively consistent globally  
const DIESEL_FACTOR = 0.00268; // tCO2e per litre

export function getElectricityFactor(country: string): number {
  return ELECTRICITY_FACTORS[country] || ELECTRICITY_FACTORS['default'];
}
```

2. In `dataRetrieval.ts`, use company's country to look up factor:
```typescript
const emissionFactor = getElectricityFactor(data.country);
const scope2Estimate = data.electricityKwh * emissionFactor;
```

3. Also add unit conversion for natural gas:
```typescript
// Convert m³ to kWh if needed (1 m³ ≈ 10.55 kWh)
const gasKwh = data.naturalGasM3 * 10.55;
```

4. In Methodology sheet, note which factor was used.

**Test:** Enter data for Germany vs France, verify different Scope 2 estimates.

---

### TASK 2.3: Improved Question Parsing

**Context:**
Make parsing more robust with manual column mapping fallback.

**Files to modify:**
- `src/lib/respond/questionParser.ts`
- `src/App.tsx` — add column mapping UI

**Instructions:**

1. After auto-detection, if confidence is low (fewer than 50% of rows have valid questions), show manual mapping UI.

2. Manual mapping UI:
```tsx
// Show first 5 rows of data as preview
// Dropdowns for each required field:
// - "Which column contains the question text?" [dropdown of column headers]
// - "Which column contains the category?" [dropdown, optional]
// - "Which column contains the reference ID?" [dropdown, optional]
// Button: "Apply Mapping"
```

3. Add to `parseQuestionFile` return:
```typescript
  autoDetectionConfidence: 'high' | 'medium' | 'low';
  availableColumns: string[];  // For manual mapping UI
```

4. Add function `reprocessWithMapping(file, columnMapping)` that re-parses with explicit mapping.

**Test:** Upload a questionnaire with unusual column names, verify manual mapping works.

---

## End of Implementation Instructions
