# Repository Instructions for Coding Agents

## Scope

These instructions apply to the entire repository. More specific `AGENTS.md` files may be added in subdirectories if a module later needs narrower rules.

## Project Overview

ReturnReady is an evidence-first Australian tax-readiness web application. It presents a whole-return overview while concentrating its interactive depth on preparing foreign-share and crypto disposal evidence for accountant review.

The application uses WebMCP so a browser agent can invoke the same domain actions available through the human interface. Agent actions must remain visible, reviewable, and reversible in the page.

ReturnReady is a preparation aid. It does not lodge tax returns, provide tax or financial advice, calculate authoritative tax, or certify that a position is tax-complete.

## Sources of Truth

- Product and technical design: [`docs/superpowers/specs/2026-08-31-returnready-design.md`](docs/superpowers/specs/2026-08-31-returnready-design.md)
- WebMCP overview: <https://developer.chrome.com/docs/ai/webmcp>
- WebMCP imperative API: <https://developer.chrome.com/docs/ai/webmcp/imperative-api>
- WebMCP tool security: <https://developer.chrome.com/docs/ai/webmcp/secure-tools>

Read the design specification before changing product behaviour, domain rules, tool contracts, fixtures, or user-facing tax language. If code and documentation disagree, stop and reconcile the discrepancy rather than silently choosing one.

Use the scripts defined in `package.json` once it exists. Do not invent substitute build or test commands when the repository already defines them.

## Product Boundaries

- Keep the interactive product focused on investment evidence readiness.
- Treat Income and Deductions as clearly labelled, previously reviewed demo fixtures unless the specification is deliberately revised.
- Use only synthetic financial and identity data.
- Do not add ATO, broker, exchange, email, cloud-storage, or filesystem integrations without an approved design change.
- Do not add tax lodgement, refund estimates, authoritative CGT calculations, parcel-selection advice, or tax-minimisation recommendations.
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

- `get_return_readiness`
- `list_investment_evidence`
- `reconcile_investment_evidence`
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
- Make repeated reconciliation, validation, and generation calls idempotent.
- Return a structured error and leave state unchanged for invalid inputs or unknown identifiers.

Use exact annotation fields:

- `get_return_readiness`: `readOnlyHint: true`, `untrustedContentHint: false`
- `list_investment_evidence`: `readOnlyHint: true`, `untrustedContentHint: true`
- State-changing tools: `readOnlyHint: false`, `untrustedContentHint: false`

Do not configure cross-origin exposure. Tool registration should fail safely when WebMCP is unavailable, while the manual interface remains functional.

## Security and Privacy

Treat imported evidence as untrusted input even when the current fixtures are synthetic.

- Expose only allow-listed normalized fields to the agent.
- Do not return raw document instructions or hidden text through tool outputs.
- Never place secrets, credentials, real account identifiers, or personal financial information in fixtures, screenshots, tests, logs, or commits.
- Do not make tool-triggered network requests.
- Do not allow tools to lodge, submit, purchase, transfer, or delete evidence.
- Keep every mutation scoped to the active synthetic return and stable record identifiers.
- Preserve a visible audit trail for first-time state changes; idempotent repeats must not add duplicate entries.

Do not claim that excluding hostile fixture text from normalized output constitutes complete prompt-injection protection. It verifies a narrow trust boundary only.

## Domain Rules

Domain behaviour must be deterministic and independently testable.

- An event cannot be evidence-complete for review while required acquisition facts are absent.
- Acquisition dates must precede disposal dates.
- Monetary values must be positive and use an explicitly supported currency.
- Required acquisition, disposal, fee, quantity, proceeds, corporate-action, and FX provenance must follow the design fixture contract.
- A missing crypto transaction fee remains a warning and prevents any tax-completeness claim.
- Blocking issues prevent review-pack generation.
- Non-blocking warnings remain visible in the generated pack.
- Reconciliation and validation must operate over supplied evidence and event arrays, not fixture-specific conditionals.

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

- Pure domain tests for reconciliation, validation, warnings, blockers, and reset.
- Tool-contract tests for schemas, annotations, argument validation, bounded outputs, and state effects.
- Idempotency tests proving first mutations create one activity entry and repeated calls create none.
- An altered fixture proving reconciliation results depend on supplied data rather than hard-coded event names.
- A normalization-boundary test proving hostile source text is excluded from agent-visible output.
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
