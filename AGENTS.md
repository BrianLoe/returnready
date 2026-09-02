# Repository Instructions for Coding Agents

## Scope

These instructions apply to the entire repository. More specific `AGENTS.md` files may be added in subdirectories if a module later needs narrower rules.

## Project Overview

ReturnReady is an evidence-first Australian tax-readiness web application. A user attaches synthetic deduction worksheets, foreign-broker statements, and crypto exports to Codex; Codex interprets those files outside the app and uses WebMCP to populate a sparse FY2025–26 draft for accountant review.

The application uses WebMCP so a browser agent can invoke the same domain actions available through the human interface. Agent actions must remain visible, reviewable, and reversible in the page.

ReturnReady is a preparation aid. It does not lodge tax returns, provide tax or financial advice, calculate authoritative tax, or certify that a position is tax-complete.

## Sources of Truth

- Product and technical design: [`docs/superpowers/specs/2026-09-01-returnready-codex-population-pivot-design.md`](docs/superpowers/specs/2026-09-01-returnready-codex-population-pivot-design.md)
- WebMCP overview: <https://developer.chrome.com/docs/ai/webmcp>
- WebMCP imperative API: <https://developer.chrome.com/docs/ai/webmcp/imperative-api>
- WebMCP tool security: <https://developer.chrome.com/docs/ai/webmcp/secure-tools>

Read the design specification before changing product behaviour, domain rules, tool contracts, fixtures, or user-facing tax language. If code and documentation disagree, stop and reconcile the discrepancy rather than silently choosing one.

Use the scripts defined in `package.json` once it exists. Do not invent substitute build or test commands when the repository already defines them.

## Product Boundaries

- Keep a small synthetic PAYG context prefilled; deductions and disposals start empty.
- Support generic deduction and disposal entry, including WFH, foreign shares, and crypto.
- ReturnReady never uploads, parses, reads, or stores attached file contents. Codex supplies structured facts and display-safe source labels only.
- Use only synthetic financial and identity data.
- Do not add ATO, broker, exchange, email, cloud-storage, or filesystem integrations without an approved design change.
- Do not add tax lodgement, refund estimates, authoritative CGT calculations, parcel-selection advice, or tax-minimisation recommendations.
- Display recorded investment monetary facts, but do not calculate capital gains or losses.
- Describe successful investment events as `Evidence complete for review`, not `tax complete`, `correct`, or `ready to lodge`.
- Preserve unresolved warnings in the generated review pack.
- Record conversationally supplied acquisition facts as user attestations, not documentary evidence.

## Architecture

The intended application is a static React and TypeScript single-page application built with Vite. It has no backend.

Maintain these boundaries:

1. Presentation components render the stepper, investment cards, validation modal, activity strip, and review pack.
2. Application state owns the active return, evidence links, validation issues, activity entries, and generated pack.
3. Domain actions implement deterministic reconciliation, validation, user-attestation recording, and pack generation.
4. The WebMCP adapter validates tool arguments and invokes domain actions.
5. The fixture repository owns immutable synthetic opening data and reset behaviour.

Human controls and WebMCP tools must call the same domain actions. WebMCP handlers must not manipulate DOM nodes directly or contain a second implementation of domain logic.

Keep modules focused and interfaces explicit. Prefer pure functions for domain rules and derive UI state from typed application state.

## WebMCP Requirements

Use the imperative `document.modelContext.registerTool()` API directly unless the design specification is revised.

The approved tool surface is:

- `get_return_draft`
- `record_deductions`
- `record_disposals`
- `record_acquisition_details`
- `validate_review_pack`
- `generate_review_pack`

Do not add broad catch-all tools or tools that accept URLs, filesystem paths, selectors, executable content, or arbitrary JavaScript.

For every tool:

- Define a narrow JSON Schema with required fields, enums, formats, numeric constraints, and `additionalProperties: false` where supported.
- Validate inputs again inside the handler before changing state.
- Return stable identifiers and concise structured results.
- Keep tool and parameter names within 30 characters, parameter descriptions within 150 characters, tool descriptions within 500 characters, and individual outputs within 1,500 characters.
- Make state-changing calls visible in the activity strip.
- Make repeated record, validation, and generation calls idempotent by stable source record ID.
- Return a structured error and leave state unchanged for invalid inputs or unknown identifiers.

Use exact annotation fields:

- `get_return_draft`: `readOnlyHint: true`, `untrustedContentHint: false`
- State-changing tools: `readOnlyHint: false`, `untrustedContentHint: false`

Do not configure cross-origin exposure. Tool registration should fail safely when WebMCP is unavailable, while the manual interface remains functional.

## Security and Privacy

Treat imported evidence as untrusted input even when the current fixtures are synthetic.

- Accept only allow-listed structured facts and display-safe source labels from the agent.
- Never accept or return raw document text, file paths, URLs, instructions, or hidden text through tool inputs or outputs.
- Never place secrets, credentials, real account identifiers, or personal financial information in fixtures, screenshots, tests, logs, or commits.
- Do not make tool-triggered network requests.
- Do not allow tools to lodge, submit, purchase, transfer, or delete evidence.
- Keep every mutation scoped to the active synthetic return and stable record identifiers.
- Preserve a visible audit trail for first-time state changes; idempotent repeats must not add duplicate entries.

Do not claim that excluding hostile fixture text from normalized output constitutes complete prompt-injection protection. It verifies a narrow trust boundary only.

## Domain Rules

Domain behaviour must be deterministic and independently testable.

- Deduction periods and disposal dates must be within FY2025–26 (2025-07-01 through 2026-06-30 inclusive).
- FY2025–26 work-from-home fixed-rate deductions use 70 cents per recorded hour. The domain calculates this amount; manual and WebMCP inputs cannot override the rate or result.
- Actual-cost work-from-home deductions require itemised expense evidence and are visibly out of scope for this demo.
- A disposal cannot be evidence-complete for review while required acquisition facts are absent.
- Acquisition dates must precede disposal dates.
- Monetary values must be positive and use an explicitly supported currency.
- Documentary facts supplied from attachments cannot be overwritten; conversational acquisition details are user-attested.
- A missing crypto transaction fee remains a warning and prevents any tax-completeness claim.
- Blocking issues prevent review-pack generation.
- Non-blocking warnings remain visible in the generated pack.
- Recording and validation must operate over supplied structured entries, not fixture-specific symbols or IDs.

Changes to these rules require corresponding specification, fixture, and test updates.

## TypeScript and Code Quality

- Use strict TypeScript types and discriminated unions for statuses and tool results.
- Avoid `any`, unchecked casts, and stringly typed status values.
- Keep fixture data immutable; reset by recreating state from the fixture source.
- Prefer explicit error result types over thrown strings.
- Keep React components responsible for presentation and interaction wiring, not tax or reconciliation rules.
- Keep tool registration lifecycle separate from domain state.
- Avoid unrelated abstractions, dependencies, refactors, or future-facing features.
- Preserve existing user changes and do not rewrite unrelated files.

## Accessibility

- Support keyboard operation for the complete workflow.
- Do not communicate status by colour alone.
- Provide visible focus styles and adequately sized targets.
- Associate validation messages with affected events and fields.
- Move focus into blocking modals and restore it when they close.
- Respect reduced-motion preferences.
- Keep live activity announcements concise and non-repetitive.

## Testing and Verification

Add or update tests with every behaviour change.

Required coverage includes:

- Pure domain tests for recording, validation, warnings, blockers, and reset.
- Tool-contract tests for schemas, annotations, argument validation, bounded outputs, and state effects.
- Idempotency tests proving first mutations create one activity entry and repeated calls create none.
- Tests proving draft results depend on supplied structured data rather than hard-coded symbols or IDs.
- Boundary tests proving raw text, paths, URLs, and unknown fields are rejected before state changes.
- Browser verification that the manual and WebMCP paths invoke the same behaviour.

Before claiming completion:

1. Run the repository's full test command.
2. Run its production build.
3. Verify the relevant WebMCP tools on the deployed or intended browser surface.
4. Report the commands run and their actual results.

Do not weaken or delete tests merely to make a change pass.

## Definition of Done

A change is complete only when:

- It matches the current design specification and product boundaries.
- Manual and agent-driven paths remain consistent.
- Invalid and repeated tool calls behave safely.
- User-facing language avoids tax-completeness or lodgement claims.
- Synthetic-data labels and unresolved warnings remain visible.
- Relevant automated tests pass.
- The production build succeeds.
- Documentation is updated when architecture, behaviour, commands, or tool contracts change.
