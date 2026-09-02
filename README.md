# ReturnReady

ReturnReady demonstrates how WebMCP can turn a normal web application into a structured collaboration surface for a person and an AI agent.

The user has scattered synthetic evidence—a work-from-home worksheet, a foreign-broker export, and a crypto transaction export. Instead of scraping the page or repeatedly typing each record into a form, Codex interprets the attached files outside the application and sends allow-listed structured facts through six narrow WebMCP tools. Every change remains visible and reviewable in the same interface a person uses manually.

ReturnReady is an evidence-organization prototype. It does not lodge tax returns, provide tax or financial advice, calculate authoritative tax, or certify that a return is complete.

## Demo workflow

1. Start with a sparse FY2025–26 draft and small prefilled PAYG context.
2. Attach the three synthetic files from [`demo-evidence/`](demo-evidence/) to Codex.
3. Ask Codex to record the deduction and every foreign-share and crypto disposal.
4. Review the visible entries and audit trail in ReturnReady.
5. Resolve the missing AAPL acquisition facts as a user attestation rather than documentary evidence.
6. Validate and generate a review pack while preserving the unresolved BTC fee warning.

For work-from-home evidence, the domain applies the FY2025–26 fixed rate used by this prototype: 40 recorded hours × $0.70 = $28.00. ReturnReady displays recorded investment monetary facts but deliberately does not calculate capital gains or losses.

## Why WebMCP

Traditional browser automation must infer meaning from page structure and manipulate controls indirectly. ReturnReady instead exposes a small semantic interface with explicit schemas and predictable results. The agent and the visible UI call the same domain actions, so automation does not bypass validation or create a second version of the workflow.

The manual interface remains fully usable when WebMCP is unavailable.

## WebMCP tools

| Tool | Purpose |
| --- | --- |
| `get_return_draft` | Read the current synthetic draft and its review readiness. |
| `record_deductions` | Record one or more structured deduction entries. |
| `record_disposals` | Record one or more structured foreign-share or crypto disposals. |
| `record_acquisition_details` | Add missing acquisition facts supplied by the user. |
| `validate_review_pack` | Return current blockers and warnings without bypassing domain rules. |
| `generate_review_pack` | Generate the review pack only when blockers are resolved. |

The tools use the imperative `document.modelContext.registerTool()` API. Inputs are validated against narrow JSON Schemas and again inside each handler. State-changing tools write to the visible activity trail and use stable source-record identifiers so exact repeats are idempotent.

## Architecture

```text
Synthetic files attached to Codex
              |
              v
   allow-listed structured facts
              |
              v
        WebMCP adapter  <---->  Manual React controls
              |                         |
              +------------+------------+
                           v
                  Shared controller
                           |
                           v
          Deterministic domain actions
                           |
                           v
          Visible draft, issues and audit trail
```

- **React presentation:** draft sections, forms, validation modal, activity trail, and review pack.
- **Application controller:** owns the active synthetic return and observable state.
- **Domain actions:** record evidence, validate issues, enforce idempotency, and generate the pack.
- **WebMCP adapter:** validates tool arguments and delegates to the same controller as the human UI.
- **Fixtures:** provide immutable synthetic opening data and reset behavior.

The project is a static React and TypeScript application built with Vite. It has no backend and makes no tool-triggered network requests.

## Security and privacy boundary

- All bundled evidence and financial values are synthetic.
- ReturnReady never uploads, reads, parses, or stores attached file contents.
- Tools accept only allow-listed structured facts and display-safe source labels.
- No tool accepts raw document text, file paths, URLs, selectors, executable content, or arbitrary JavaScript.
- Documentary facts cannot be overwritten by conversational attestations.
- Invalid or conflicting calls return structured errors without changing state.
- Tool outputs are bounded and unresolved warnings remain visible.
- No tool can lodge, submit, purchase, transfer, or delete anything.

## Run locally

Requirements: a current Node.js installation and npm.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

A browser surface that supports the imperative WebMCP API is required to discover the six tools. In unsupported browsers, ReturnReady reports that WebMCP is unavailable while preserving the complete manual workflow.

## Verify

```bash
npm test
npm run typecheck
npm run build
npm run test:browser
```

The test suite covers domain rules, tool schemas and annotations, hostile-input boundaries, output limits, idempotency, manual/agent parity, keyboard operation, and the complete review-pack flow.

## Synthetic evidence

The public demonstration files are intentionally small and inspectable:

- [`wfh-hours-fy2025-26.csv`](demo-evidence/wfh-hours-fy2025-26.csv)
- [`foreign-broker-fy2025-26.csv`](demo-evidence/foreign-broker-fy2025-26.csv)
- [`crypto-transactions-fy2025-26.csv`](demo-evidence/crypto-transactions-fy2025-26.csv)

They contain no real identity, account, or financial information.

## Known limitations

- The application is a synthetic prototype, not tax software.
- Attached files are interpreted by Codex outside the page; ReturnReady receives structured facts only.
- The prototype does not calculate capital gains or losses.
- Actual-cost work-from-home deductions are shown as an available method but require itemized evidence and are not calculated by this prototype.
- A missing crypto transaction fee remains an explicit warning in the generated review pack.
- WebMCP availability depends on the browser and hosting surface.

## License

Licensed under the [MIT License](LICENSE).
