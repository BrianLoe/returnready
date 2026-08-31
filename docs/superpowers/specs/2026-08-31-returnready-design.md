# ReturnReady Design Specification

Date: 2026-08-31
Status: Approved in conversation; pending written-spec review
Target: WebMCP Challenge prototype and public demo under three minutes

## 1. Product Summary

ReturnReady is an evidence-first tax-readiness workspace for Australian employees who also invest. It gives users a whole-return readiness view while concentrating its interactive depth on the painful reconciliation of foreign-share and crypto disposal evidence.

The product does not lodge a tax return or calculate authoritative tax. It converts already-imported, synthetic evidence into a transparent, accountant-ready review pack. A browser agent uses WebMCP tools to invoke the same domain actions available through the human interface, and every action remains visible in the page.

One-line pitch:

> ReturnReady turns scattered tax evidence into an evidence-linked, review-ready Australian tax pack, using WebMCP to reconcile records, expose gaps, and resolve blockers with the user.

## 2. Target User and Core Story

The demonstration user is an Australian hybrid software engineer with PAYG income, ordinary work deductions, Australian managed-fund holdings, foreign shares, and crypto assets.

Their income and work-deduction evidence is already reconciled. Their investment evidence contains foreign-share and crypto disposal records that are difficult to prepare confidently because the source exports do not contain every fact needed for review.

The user asks their browser agent:

> Make my investment section ready for my accountant.

The agent inspects the available evidence, reconciles complete events, exposes one blocker and one warning, asks the user for missing acquisition details, records the answer, reruns validation, and generates the whole-return review pack.

## 3. Goals

- Demonstrate a credible user problem where WebMCP materially improves a complex web workflow.
- Show visible cooperation between a human, a browser agent, and the ReturnReady interface.
- Preserve user control by exposing evidence links, assumptions, warnings, and agent actions.
- Make the complete judged path deterministic, resettable, and recordable in under three minutes.
- Use a broad whole-return shell with one deeply functional investment-readiness vertical.
- Treat tax documents and imported text as untrusted data.
- Remain useful without WebMCP through equivalent human controls.

## 4. Non-Goals

- Lodging, submitting, or amending an Australian tax return.
- Providing financial, legal, or tax advice.
- Producing an authoritative tax liability, refund estimate, or net capital gain.
- Choosing parcel-selection strategies, CGT concessions, discount eligibility, or tax-minimisation methods.
- Implementing full ATO or myTax parity.
- Connecting to the ATO, brokers, exchanges, email, cloud storage, or a local filesystem.
- Uploading or parsing arbitrary binary documents, PDFs, images, or screenshots.
- OCR, live market prices, live foreign-exchange rates, or external API calls.
- Supporting rental properties, sole traders, companies, trusts, or SMSFs.
- Persisting or processing real personal or financial information.

## 5. Scope Strategy

ReturnReady presents three return sections:

1. **Income** — pre-populated and marked ready.
2. **Work deductions** — several evidence-linked items, already validated and marked ready.
3. **Investments** — the only deeply interactive section and the hero workflow.

This creates the shape of a complete preparation product without implementing multiple tax engines. Income and deductions establish context; investments demonstrate the core value.

## 6. Synthetic Evidence Scenario

The fixture represents an evidence inbox that has already been imported into ReturnReady. It is clearly labelled `Synthetic demo data`.

Evidence records:

- PAYG income statement summary, already reconciled.
- Work-deduction summary with three linked items, already reconciled.
- Australian managed-fund annual statement covering ten holdings, already reconciled.
- Foreign broker export containing two disposal events.
- Crypto exchange export containing one disposal event.
- Foreign-exchange evidence containing the rates required by the synthetic scenario.

Investment events:

1. **MSFT disposal — ready.** Acquisition and disposal records are complete and linked.
2. **AAPL transferred parcel — blocker.** The broker export contains the disposal but not the original acquisition date or USD unit cost from before the transfer.
3. **BTC disposal — warning.** The disposal is present, but the exchange export does not include its transaction fee.

The AAPL event already contains the disposed quantity. The user supplies only the missing acquisition date and USD unit cost in conversation. Once recorded, ReturnReady matches the corresponding supplied FX evidence and clears the blocker.

The missing crypto fee remains a visible, non-blocking warning in the generated pack.

## 7. User Experience

### 7.1 Layout

The selected layout is an ATO-inspired linear stepper without copying ATO branding or interface details:

`Income -> Deductions -> Investments -> Review pack`

The Investments step contains three calm, form-like cards:

- Managed funds
- Foreign shares
- Crypto assets

Each card displays its readiness state, linked evidence count, detected events, and issues. A compact agent activity strip remains visible within the step so judges can see tool-driven changes as they happen.

### 7.2 Status language

- **Ready:** required evidence and details are present.
- **Action required:** at least one blocking issue prevents pack generation.
- **Warning:** review may proceed, but the unresolved issue must remain disclosed.
- **Excluded:** a record was deliberately omitted with a visible reason.

### 7.3 Final action

The final action is labelled **Generate review pack**. The application never uses `Submit return` or similar lodgement language.

Invoking the action runs deterministic validation. If blockers exist, ReturnReady opens a modal that identifies the missing information and provides a direct resolution path. Warnings do not prevent generation, but they remain prominent in both the modal and final pack.

## 8. Demonstration Flow

Opening state:

- Overall readiness is incomplete.
- Income and Deductions are ready.
- Investments show one blocker and one warning.
- No review pack exists.

Agent flow:

1. Read the whole-return status.
2. Inspect the imported investment evidence and detected events.
3. Reconcile complete evidence and visibly update the Investments cards.
4. Report the AAPL acquisition blocker and BTC fee warning.
5. Ask the user for the AAPL acquisition date and USD unit cost.
6. Record the user's structured answer and link the applicable FX evidence.
7. Rerun validation; the blocker clears while the warning remains.
8. Generate the review pack.

The flow has one user interruption and no hidden setup during recording. A **Reset demo** control restores the exact opening state.

## 9. Technical Architecture

ReturnReady is a static React and TypeScript single-page application built with Vite. It has no backend. Synthetic fixtures, domain logic, validation, state, and review-pack rendering run in the browser.

The architecture has five boundaries:

1. **Presentation layer** — stepper, cards, modal, activity strip, and review-pack view.
2. **Application state** — the current return, evidence links, issues, tool activity, and generated pack.
3. **Domain actions** — pure or deterministic functions for reconciliation, recording details, validation, and pack generation.
4. **WebMCP adapter** — imperative tool registrations that validate arguments and call domain actions.
5. **Fixture repository** — immutable synthetic opening data and reset behavior.

Both the human UI and WebMCP adapter invoke the same domain actions:

```text
Human controls ----\
                    -> domain actions -> application state -> visible UI
WebMCP tools ------/
```

No tool directly manipulates DOM nodes. State changes drive rendering through the normal React data flow.

## 10. Core Domain Model

### ReturnState

- income status
- deductions status
- investments status
- overall blocker and warning counts
- current step
- generated review-pack identifier, if any

### EvidenceItem

- stable identifier
- source type
- display name
- synthetic-data marker
- normalized facts
- trust classification
- linked event identifiers
- reconciliation status

### InvestmentEvent

- stable identifier
- asset class
- asset symbol
- event type
- quantity
- acquisition facts
- disposal facts
- currency
- linked evidence identifiers
- validation status
- issue identifiers

### ValidationIssue

- stable code
- severity: blocker or warning
- affected section and event
- user-facing explanation
- resolution fields required
- resolved state

### ActivityEntry

- timestamp
- actor: human or agent
- action type
- concise, non-sensitive description
- affected record identifier

### ReviewPack

- generated timestamp
- section readiness summary
- linked evidence index
- investment-event review table
- unresolved warnings
- assumptions and limitations
- explicit non-lodgement disclaimer

## 11. WebMCP Tool Contract

Tools use the imperative `document.modelContext.registerTool()` API and register only when the API is available. Registration is cleaned up through an `AbortController` during application unmount or hot reload.

### `get_return_readiness`

- Purpose: Read the current whole-return status.
- Inputs: none.
- Output: section statuses, blocker count, warning count, and whether a pack can be generated.
- Mutation: none.
- Annotation: read-only.

### `list_investment_evidence`

- Purpose: Return normalized evidence summaries and detected investment events.
- Inputs: optional status filter from an enum.
- Output: stable IDs and normalized fields only; no raw document instructions.
- Mutation: none.
- Annotations: read-only and untrusted-content-aware.

### `reconcile_investment_evidence`

- Purpose: Apply deterministic matching rules to imported evidence and investment events.
- Inputs: none for the fixed demo dataset.
- Output: linked events, unresolved blocker, unresolved warning, and concise next action.
- Mutation: evidence links, event statuses, issues, and activity entry.
- Repeat behavior: idempotent.

### `record_acquisition_details`

- Purpose: Resolve missing acquisition facts for a known event.
- Inputs: event ID, acquisition date, positive unit price, and currency from an enum.
- Output: updated event readiness and matched FX-evidence identifier.
- Mutation: only the named event and activity log.
- Validation: rejects unknown IDs, invalid dates, unsupported currencies, and non-positive values without changing state.

### `validate_review_pack`

- Purpose: Run all deterministic readiness rules and surface the result in the UI.
- Inputs: none.
- Output: blocker and warning objects plus `canGenerate`.
- Mutation: validation result and modal visibility only.
- Repeat behavior: idempotent.

### `generate_review_pack`

- Purpose: Create the final in-app review pack.
- Inputs: none.
- Output: generated pack ID, remaining warnings, and completion message.
- Mutation: generated pack and activity entry.
- Guard: refuses when any blocker exists.
- Consequence boundary: creates no external file, network request, tax calculation, or lodgement.

## 12. Deterministic Rules

The browser agent orchestrates tools and converses with the user, but tax-readiness state is never based on free-form model judgment.

Rules required for the prototype:

- A disposal event is not ready when its required acquisition date or acquisition unit cost is absent.
- A user-supplied acquisition date must precede the disposal date.
- Monetary values must be positive and use a supported currency.
- Each ready event must link to acquisition and disposal evidence or explicitly identify user-supplied acquisition facts.
- Required FX evidence must exist for the event's supplied dates before the blocker clears.
- A missing transaction fee is a warning, not a blocker, for this preparatory pack.
- Pack generation is forbidden while any blocker remains.
- Warnings remain visible and are copied into the generated pack.
- Reconciliation and validation calls are idempotent.

These rules establish evidence completeness for review; they do not determine deductibility, CGT methods, discount eligibility, or final tax amounts.

## 13. Error Handling

- Unsupported browsers show a visible `WebMCP unavailable` notice while preserving the complete manual workflow.
- Tool registration failure does not break page rendering.
- Invalid tool arguments return a specific error and make no state change.
- Unknown evidence or event identifiers return `not_found` and make no state change.
- Duplicate reconciliation, validation, or generation calls return the current result without duplicating links or activities.
- Review-pack generation with blockers returns `blocked`, opens the validation modal, and lists resolution fields.
- Reset restores immutable fixture state and clears the activity log and generated pack.

## 14. Security and Trust Boundaries

- All displayed financial data is synthetic and visibly labelled.
- Evidence content is untrusted. Tools return allow-listed normalized fields rather than raw embedded prose or instructions.
- Tool descriptions are narrow and accurately describe their effects.
- Input schemas use enums, formats, minimums, required fields, and `additionalProperties: false` where supported.
- Tool handlers validate inputs again before invoking domain actions.
- Tools operate only on the active synthetic return and stable fixture identifiers.
- No tool accepts a URL, filesystem path, executable content, arbitrary selector, or arbitrary JavaScript.
- No cross-origin exposure is configured; tools remain same-origin.
- No secrets, authentication tokens, or personal information are present.
- No tool can lodge, submit, purchase, transfer, delete evidence, or make network requests.
- The activity strip provides a visible audit trail of agent mutations.
- The human can inspect every result, correct it manually, or reset the demo.

## 15. Accessibility and Interaction Quality

- The complete workflow is keyboard accessible.
- Status is conveyed with text and icons, not colour alone.
- Validation focus moves to the modal heading and returns to the triggering control when closed.
- Errors are associated with their relevant event and resolution fields.
- The activity strip uses an accessible live-region mode that avoids repeated noisy announcements.
- Reduced-motion preferences disable transition animations.
- Buttons and links have visible focus states and adequate target size.

## 16. Verification Strategy

### Unit tests

- Reconciliation links only the intended evidence.
- Missing acquisition facts produce the expected blocker.
- Valid acquisition details clear the blocker.
- Invalid dates, prices, currencies, and identifiers leave state unchanged.
- Missing crypto fees produce a warning.
- Warnings do not prevent pack generation.
- Blockers do prevent pack generation.
- Reset reproduces the exact fixture state.

### Tool contract tests

- Each registered schema matches its handler inputs.
- Read-only tools do not mutate state.
- Mutating tools create exactly one activity entry.
- Repeated calls remain idempotent.
- Tool errors are structured, concise, and actionable.
- Tool output excludes raw untrusted instructions.

### Browser verification

- Tools appear in Chrome's WebMCP tooling and execute successfully.
- Every tool-driven state change is visibly reflected in the page.
- The manual fallback completes the same workflow.
- The deployed origin satisfies WebMCP origin-isolation and permissions requirements.
- The complete scenario can be reset and replayed reliably.

### Prompt evals

- Standard goal: prepare the investment section.
- Ambiguous request: ask for clarification without mutating records incorrectly.
- Invalid acquisition value: reject and recover.
- Repeat request: do not duplicate links or pack entries.
- Prompt injection embedded in evidence: ignore it and operate only on normalized fields.
- Overreach request: refuse or explain that ReturnReady cannot lodge or calculate authoritative tax.

## 17. Demo Success Criteria

The prototype is ready to record when:

- A browser agent discovers and invokes the intended WebMCP tools from one natural-language goal.
- The Investments UI visibly moves from blocked to review-ready after one user interruption.
- The AAPL blocker and BTC warning behave exactly as specified.
- The final review pack includes evidence links, the unresolved warning, and limitations.
- No hidden manual correction is required during the recorded path.
- Reset and replay succeed repeatedly.
- The complete narrated workflow fits comfortably under three minutes.
- The video accurately distinguishes existing evidence ingestion, WebMCP tool use, and human confirmation.

## 18. Deployment Assumptions

- Development uses a compatible Chrome build with local WebMCP testing enabled.
- Public deployment uses a secure origin and the WebMCP origin-trial configuration required at deployment time.
- The document remains origin-isolated and does not relax its origin with `document.domain`.
- The `tools` permissions policy remains restricted to the application's own origin.
- The app is deployable as static assets with any required response headers configured by the hosting platform.

## 19. Source References

- Chrome WebMCP overview: https://developer.chrome.com/docs/ai/webmcp
- Chrome WebMCP imperative API: https://developer.chrome.com/docs/ai/webmcp/imperative-api
- WebMCP explainer: https://github.com/webmachinelearning/webmcp
- WebMCP security guide: https://developer.chrome.com/docs/ai/webmcp/secure-tools
- ATO managed-fund instructions: https://www.ato.gov.au/api/public/content/0-3c0244a7-f1cc-42d3-b7cf-8c80cab1973b
- ATO crypto record requirements: https://www.ato.gov.au/individuals-and-families/investments-and-assets/crypto-asset-investments/keeping-crypto-records
- ATO foreign-currency guidance: https://www.ato.gov.au/businesses-and-organisations/corporate-tax-measures-and-assurance/foreign-exchange-gains-and-losses/in-detail/guide-to-functional-currency-rules
