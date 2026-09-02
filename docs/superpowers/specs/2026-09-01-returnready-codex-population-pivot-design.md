# ReturnReady Codex-Populated Draft Pivot

Date: 2026-09-01
Status: Approved section-by-section in conversation; pending written-spec review
Target: WebMCP Challenge prototype with two days remaining

## 1. Product decision

ReturnReady will pivot from reconciling evidence already loaded in the application to populating a sparse tax-preparation draft from evidence attached to Codex.

One-line pitch:

> Attach your scattered tax evidence to Codex and watch it populate an evidence-linked FY2025–26 draft through safe WebMCP actions.

ReturnReady is not a file processor. Codex reads the attached synthetic files, extracts structured facts, and calls narrow WebMCP tools. ReturnReady validates and displays those facts, preserves provenance, exposes gaps, and generates a review pack. It never lodges a return or calculates tax outcomes.

## 2. User and problem

The demonstration user is an Australian employee whose tax evidence is split across:

- a worksheet tracking work-from-home hours;
- a foreign broker statement;
- a crypto transaction export.

Manually transferring this evidence into a preparation workflow is repetitive and error-prone. The user asks Codex:

> Use these synthetic files to populate my FY2025–26 deductions and investment disposals.

Codex reads the attachments, checks the current ReturnReady draft, and records structured entries through WebMCP. The page fills in visibly. Missing facts remain explicit and require a user answer rather than being invented.

## 3. Goals

- Demonstrate Codex turning scattered attached evidence into structured draft entries.
- Show why WebMCP is safer and more reliable than screen scraping or unrestricted form control.
- Give manual and agent-driven users equivalent entry workflows backed by the same domain actions.
- Preserve source labels, actor identity, and documentary versus user-attested provenance.
- Keep the complete deterministic demo under three minutes.
- Finish the pivot, automated verification, deployment preparation, and demo rehearsal within two days.

## 4. Non-goals

- In-app file upload, parsing, OCR, or raw document storage.
- Reading local paths, URLs, selectors, arbitrary JavaScript, or raw document text through WebMCP.
- Tax calculations, including deductible amounts, capital gains, liability, or refund estimates.
- Choosing deduction methods, parcel-selection strategies, CGT concessions, or tax treatments.
- Lodging, submitting, amending, or certifying a return.
- Connecting to the ATO, brokers, exchanges, cloud storage, email, or external APIs.
- Supporting production data or real personal and financial information.
- Full myTax or ATO parity.

## 5. Synthetic demo inputs

The user attaches exactly three synthetic files to Codex:

1. `wfh-hours-fy2025-26.csv`
2. `foreign-broker-fy2025-26.csv`
3. `crypto-transactions-fy2025-26.csv`

The application never receives file contents. Codex may pass a display-safe source label matching one of these filenames, but no path and no raw extracted text.

The WFH worksheet contains dated work-from-home hour rows within FY2025–26. Codex may perform ordinary arithmetic to total the hours and records an evidence-backed deduction entry. ReturnReady does not apply a tax rate or convert those hours into a claimed dollar amount.

The broker file contains two foreign-share disposal records. One is complete; one represents transferred units whose historical acquisition date and unit price are absent.

The crypto file contains one disposal record with a missing transaction fee. That missing fee remains a warning rather than a blocker.

All deduction periods and disposal dates must fall from 2025-07-01 through 2026-06-30 inclusive. Historical acquisition dates may precede that period but must be strictly before disposal.

## 6. Opening state

- **Income:** one small prefilled synthetic PAYG summary for context only.
- **Deductions:** empty.
- **Investments:** empty.
- **Activity:** empty.
- **Review pack:** not generated.

The page states:

> Add entries manually, or ask Codex to populate this draft from attached evidence.

The product must not show fabricated holding counts or imply that arbitrary holdings already exist in the draft.

## 7. Demonstration flow

1. The user opens the sparse FY2025–26 draft.
2. The user attaches the three synthetic files to Codex.
3. The user asks Codex to populate deductions and investment disposals.
4. Codex calls `get_return_draft`.
5. Codex calls `record_deductions` with the total WFH hours and source label.
6. Codex calls `record_disposals` with the foreign-share and crypto disposal records.
7. ReturnReady visibly renders the new entries and agent audit activity.
8. Validation identifies the missing historical acquisition facts and the crypto-fee warning.
9. Codex asks the user once for the missing acquisition date and unit price.
10. Codex records the answer through `record_acquisition_details` as a user attestation.
11. Codex validates the draft and generates the review pack.
12. The pack retains the crypto-fee and uncalculated-deduction warnings.

A reset control restores the exact sparse opening state.

## 8. WebMCP surface

ReturnReady exposes exactly six tools:

1. `get_return_draft`
2. `record_deductions`
3. `record_disposals`
4. `record_acquisition_details`
5. `validate_review_pack`
6. `generate_review_pack`

The first tool is read-only. The next three mutate the draft. Validation opens the same visible validation surface used by a human. Generation mutates the draft by storing a deterministic review pack.

All input schemas are closed objects with `additionalProperties: false`. Each batch accepts 1–20 items and rejects duplicate source record IDs. Every handler defensively parses inputs independently of its schema. Source record IDs are limited to 64 characters; source labels and descriptions are limited to 120 characters and rendered only as text.

Tool annotations are fixed:

| Tool | readOnlyHint | openWorldHint |
| --- | --- | --- |
| `get_return_draft` | `true` | `false` |
| `record_deductions` | `false` | `false` |
| `record_disposals` | `false` | `false` |
| `record_acquisition_details` | `false` | `false` |
| `validate_review_pack` | `false` | `false` |
| `generate_review_pack` | `false` | `false` |

No tool accepts file contents, raw text, URLs, paths, DOM selectors, or JavaScript. Tool outputs are bounded; oversized output produces a structured refusal rather than truncation.

### 8.1 `get_return_draft`

Returns section counts, current issues, and compact entry summaries. It does not return raw source content.

### 8.2 `record_deductions`

Accepts a bounded array of evidence-backed deduction entries. The tool name is generic even though the demonstration entry is work-from-home evidence.

Required demonstration fields:

- `sourceRecordId`
- `category`, restricted in P0 to `work-from-home` or `other-work-related`
- `description`
- `periodStart`
- `periodEnd`
- `quantity`
- `unit`, restricted in P0 to `hours` or `AUD`
- `calculationMethod`, restricted in P0 to `fixed-rate`
- `currency`
- `sourceLabel`

For FY2025–26 work-from-home evidence, ReturnReady derives the deduction amount at the fixed rate of 70 cents per recorded hour, following the [ATO working-from-home expense guidance](https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/working-from-home-expenses). Neither the manual form nor `record_deductions` accepts an override amount. The UI displays the method, hours, rate, formula, and derived amount. Actual cost is named as an alternative method but is unavailable in this demonstration because it requires itemised expense evidence.

### 8.3 `record_disposals`

Accepts 1–20 disposal entries. Each item has a discriminated `assetType` of `foreign-share` or `crypto` and common disposal fields plus asset-specific optional fee fields.

Required common fields:

- `sourceRecordId`
- `assetType`
- `symbol`
- `quantity`
- optional acquisition date and unit price
- `disposalDate`
- `proceedsMinor`
- `currency`
- optional brokerage or fee
- `sourceLabel`

### 8.4 `record_acquisition_details`

Resolves missing historical acquisition facts for one known disposal. It cannot overwrite existing documentary acquisition evidence. Values supplied conversationally are recorded as `user-attested`.

## 9. Domain model

`ReturnState` contains:

- a prefilled income context summary;
- `deductions: DeductionEntry[]`;
- `disposals: DisposalEntry[]`;
- validation issues and section summaries;
- append-only activity entries;
- a stored review pack or `null`.

Every mutable entry has a stable `sourceRecordId`. Recording the same semantic entry twice returns `changed: false` and adds no activity. Reusing an existing ID with different facts returns `invalid_input`; it never silently overwrites documentary data.

### 9.1 Deduction provenance

Entries extracted from a supplied worksheet are `documentary`. Facts supplied only in conversation are `user-attested`. Source labels are display metadata, not trusted file references.

The fixed-rate calculation is deterministic domain logic: `round(hours × 70)` in AUD minor units. It is preparation arithmetic for the evidence draft, not an authoritative tax calculation.

### 9.2 Disposal provenance

Documentary fields from broker or exchange records retain documentary provenance. Missing historical facts remain absent until explicitly supplied. A conversational answer fills only the approved missing fields and is visibly labelled `user-attested`.

The disposal UI displays acquisition date and unit price, disposal proceeds, brokerage or transaction fee, currency, and provenance. Missing values remain explicit. It does not derive capital gain or loss.

## 10. Validation

Validation is deterministic and data-driven:

- deduction period outside FY2025–26: reject during recording;
- disposal date outside FY2025–26: reject during recording;
- malformed date, non-positive quantity, invalid money amount, unsupported currency, unknown field, duplicate batch ID, or oversized batch: reject without state mutation;
- acquisition date on or after disposal: reject without mutation;
- missing acquisition date or unit price: blocker;
- missing crypto transaction fee: warning;
- a successfully recorded fixed-rate work-from-home deduction includes a domain-derived claim amount and creates no missing-amount warning;
- unsupported category or asset type: reject without mutation.

Warnings do not block pack generation. Blockers do. ReturnReady never infers missing values.

## 11. Review pack

The deterministic review pack contains:

- income context summary;
- deduction evidence summaries and source labels;
- disposal review rows and provenance;
- blockers, unresolved warnings, assumptions, and limitations;
- activity-derived preparation notes;
- the disclaimer: `ReturnReady does not lodge returns or provide tax advice`.

It contains no authoritative deduction calculation, capital gain, liability, refund, or lodgement claim.

## 12. Presentation

The page uses three principal sections:

1. Income context
2. Deductions
3. Investment disposals

Deductions and disposals each provide accessible manual entry forms and lists of populated entries. An instruction callout explains that Codex can populate the same fields from attached evidence. Agent and human changes appear in one audit trail.

The UI must make these states obvious:

- empty draft;
- entries arriving from Codex;
- blocker requiring one user answer;
- warning that does not prevent review-pack generation;
- generated review pack.

Status is never communicated by colour alone. Focus order, labels, errors, modal focus, and focus restoration remain keyboard accessible.

## 13. Architecture

```text
Synthetic attachments in Codex
            |
            v
Codex extracts structured facts
            |
            v
WebMCP handlers validate arguments
            |
            v
Shared domain actions update immutable state
            |
            v
Controller notifies React UI and audit trail
```

ReturnReady does not process files. Manual forms and WebMCP handlers call the same domain functions. WebMCP handlers never manipulate the DOM. The controller remains the single observable application-state owner.

## 14. Testing and acceptance

Required automated evidence:

- initial sparse state with prefilled income only;
- manual deduction and disposal entry;
- captured production WebMCP handlers producing state equivalent to manual actions;
- batch input validation and no-mutation failures;
- repeated file processing without duplicates or duplicate activity;
- FY2025–26 date boundary tests;
- historical acquisition-date validation;
- provenance preservation and documentary-overwrite refusal;
- hostile source labels and unknown fields cannot leak or alter behavior;
- blocker and warning derivation from facts rather than symbols or IDs;
- review-pack generation blocked until acquisition facts are supplied;
- warning survival in the generated pack;
- tool annotation, schema, length-budget, output-budget, and abort lifecycle tests;
- keyboard flow, modal focus, focus restoration, and responsive layout;
- one Playwright manual flow;
- one real deployed Codex/WebMCP run using only synthetic attachments.

Acceptance demo:

> Starting from the sparse draft, Codex reads the three synthetic attachments, populates deductions and disposals through WebMCP, asks for one missing acquisition fact, records the answer as user-attested, and generates a review pack with visible warnings and audit history in under three minutes.

## 15. Two-day delivery boundary

P0 includes only:

- the sparse draft fixture;
- one generic deduction model demonstrated by WFH hours;
- one generic disposal model demonstrated by foreign shares and crypto;
- the six approved tools;
- equivalent manual forms;
- validation, provenance, audit trail, and review pack;
- three synthetic attachment files;
- automated verification and one deployed demo rehearsal.

Anything beyond this boundary is stretch work after the P0 demo succeeds three times.
