# ReturnReady Codex-Populated Draft Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot ReturnReady into a sparse FY2025–26 draft that Codex populates from synthetic attached evidence through six safe WebMCP tools, with equivalent manual entry, provenance, validation, and review-pack generation.

**Architecture:** Codex reads synthetic attachments outside the application and sends only structured facts through WebMCP. Manual forms and WebMCP handlers call the same pure domain record functions through one observable controller; immutable application state drives the UI, audit trail, validation modal, and stored review pack.

**Tech Stack:** React 19, strict TypeScript, Vite 8, Vitest 4, Testing Library, Playwright, imperative WebMCP `document.modelContext.registerTool`.

**Spec:** `docs/superpowers/specs/2026-09-01-returnready-codex-population-pivot-design.md`

## Global Constraints

- Synthetic data only; never add real names, identifiers, TFNs, accounts, or financial records.
- ReturnReady never uploads, reads, parses, or retains attachment contents; Codex performs file interpretation.
- No tool accepts raw document text, URLs, paths, selectors, JavaScript, or unknown properties.
- Exactly six tools: `get_return_draft`, `record_deductions`, `record_disposals`, `record_acquisition_details`, `validate_review_pack`, `generate_review_pack`.
- Tool/parameter names are at most 30 characters, parameter descriptions at most 150, tool descriptions at most 500, and serialized tool results at most 1500 characters.
- Tool handlers make no network requests and never manipulate the DOM.
- Deduction periods and disposal dates are within 2025-07-01 through 2026-06-30 inclusive; acquisition dates may be earlier but must precede disposal.
- No deduction, capital-gain, liability, refund, or lodgement calculation.
- Never claim `tax complete`, `correct`, or `ready to lodge`; use evidence/review language.
- State-changing operations are immutable, idempotent by stable source record ID, and add at most one activity entry per successful call.
- Documentary facts cannot be overwritten; conversationally supplied acquisition facts are `user-attested`.
- Keep `.devpost-hackathon-state.json` untracked and untouched.
- Do not weaken or delete tests to make the pivot pass.

---

### Task 1: Sparse draft model, fixture, and synthetic attachments

**Files:**
- Modify: `src/domain/model.ts`
- Replace: `src/fixtures/demoReturn.ts`
- Modify: `src/fixtures/demoReturn.test.ts`
- Create: `demo-evidence/wfh-hours-fy2025-26.csv`
- Create: `demo-evidence/foreign-broker-fy2025-26.csv`
- Create: `demo-evidence/crypto-transactions-fy2025-26.csv`
- Modify: `.gitignore` only if the existing rules do not already preserve generated test output

**Interfaces:**
- Produces:
  - `DeductionEntry`
  - `DisposalEntry`
  - `DeductionInput`
  - `DisposalInput`
  - `ReturnState` with `deductions`, `disposals`, `issues`, `activity`, and `reviewPack`
  - `createDemoReturnState(): ReturnState`
- Consumes: existing `Actor`, `Currency`, `Result<T>`, provenance and activity conventions.

Migration rule: add the new fields and sparse arrays without deleting legacy event/evidence fields yet. Keep those legacy fields as empty compatibility values until Task 5 replaces the WebMCP adapter and proves there are no remaining callers. Every task must leave the branch compiling.

- [ ] **Step 1: Replace fixture tests with sparse-opening and FY-boundary assertions**

Add tests that prove the opening state has one synthetic PAYG context summary, zero deductions, zero disposals, zero issues/activity, and no pack. Parse each CSV with simple line assertions and prove all reporting dates are within FY2025–26 while the broker file contains one missing acquisition pair.

```ts
const state = createDemoReturnState();
expect(state.income.summary).toBe('PAYG income statement available');
expect(state.deductions).toEqual([]);
expect(state.disposals).toEqual([]);
expect(state.activity).toEqual([]);
expect(state.reviewPack).toBeNull();
```

- [ ] **Step 2: Run the fixture test and verify RED**

Run: `npm test -- src/fixtures/demoReturn.test.ts`

Expected: FAIL because the old fixture still contains preloaded investment evidence/events and the new entry types do not exist.

- [ ] **Step 3: Define the new entry contracts**

Use discriminated, cast-free types:

```ts
export type Provenance = 'documentary' | 'user-attested';
export type DeductionCategory = 'work-from-home' | 'other-work-related';

export interface DeductionEntry {
  id: string;
  sourceRecordId: string;
  category: DeductionCategory;
  description: string;
  periodStart: string;
  periodEnd: string;
  quantity: number;
  unit: 'hours' | 'AUD';
  claimAmountMinor?: number;
  currency: 'AUD';
  sourceLabel: string;
  provenance: Provenance;
}

export interface DisposalEntry {
  id: string;
  sourceRecordId: string;
  assetType: 'foreign-share' | 'crypto';
  symbol: string;
  quantity: number;
  acquisition: {
    date?: string;
    unitPriceMinor?: number;
    currency?: Currency;
    provenance: Provenance | 'missing';
  };
  disposalDate: string;
  proceedsMinor: number;
  currency: Currency;
  brokerageMinor?: number;
  feeMinor?: number;
  sourceLabel: string;
  provenance: Provenance;
}
```

Define `DeductionInput` and `DisposalInput` by explicitly listing accepted fields; do not derive them with unchecked casts or accept raw evidence text.

- [ ] **Step 4: Replace the opening fixture and create three synthetic CSVs**

Use stable record IDs such as `wfh-summary-01`, `broker-msft-01`, `broker-aapl-01`, and `crypto-btc-01`. Put disposal dates in FY2025–26. Keep AAPL acquisition fields blank in the broker CSV. Include no real person, employer, broker account, wallet, or tax identifier.

- [ ] **Step 5: Run fixture tests and type-check**

Run: `npm test -- src/fixtures/demoReturn.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/model.ts src/fixtures/demoReturn.ts src/fixtures/demoReturn.test.ts demo-evidence
git commit -m "feat: define sparse evidence-backed return draft"
```

---

### Task 2: Pure record actions, validation, and review pack

**Files:**
- Create: `src/domain/recordDeductions.ts`
- Create: `src/domain/recordDeductions.test.ts`
- Create: `src/domain/recordDisposals.ts`
- Create: `src/domain/recordDisposals.test.ts`
- Modify: `src/domain/acquisition.ts`
- Modify: `src/domain/acquisition.test.ts`
- Replace: `src/domain/validation.ts`
- Modify: `src/domain/validation.test.ts`
- Replace: `src/domain/reviewPack.ts`
- Modify: `src/domain/reviewPack.test.ts`

**Interfaces:**
- Consumes: Task 1 `ReturnState`, `DeductionInput`, `DisposalInput`, `Result<T>`, `Actor`.
- Produces:
  - `recordDeductions(state, inputs, actor, now): Result<{state: ReturnState; recordedIds: string[]}>`
  - `recordDisposals(state, inputs, actor, now): Result<{state: ReturnState; recordedIds: string[]}>`
  - `recordAcquisitionDetails(state, input, actor, now): Result<{state: ReturnState; disposalId: string}>`
  - `deriveValidationIssues(state): ValidationIssue[]`
  - `validateReviewPack(state): ValidationSummary`
  - `generateReviewPack(state, actor, now): Result<{state: ReturnState; pack: ReviewPack}>`

- [ ] **Step 1: Write RED tests for deduction recording**

Cover a successful WFH batch, immutable input, one activity entry, repeat-as-no-op, conflicting reuse of a source ID, 1–20 batch limit, FY period boundaries, invalid quantity, unsupported category/unit, hostile/oversized source labels, and no claim amount producing a warning rather than a blocker.

- [ ] **Step 2: Run deduction tests and verify RED**

Run: `npm test -- src/domain/recordDeductions.test.ts`

Expected: FAIL because `recordDeductions` does not exist.

- [ ] **Step 3: Implement minimal deduction recording**

Validate every item before cloning. Compare an existing entry with the proposed normalized entry: exact match is a no-op; same ID with different facts is `invalid_input`. Clone once, append all new entries, derive issues once, and append one activity entry for the batch.

- [ ] **Step 4: Write RED tests for disposal recording**

Cover mixed foreign-share/crypto batches, missing AAPL acquisition facts, missing BTC fee warning, FY disposal boundaries, historical acquisitions, acquisition-on/after-disposal rejection, invalid money/quantity/currency, duplicate IDs, conflicting repeat, and immutable failures.

- [ ] **Step 5: Implement minimal disposal recording**

Do not branch on symbols or fixture IDs. Branch only on `assetType` and field presence. Preserve documentary provenance for supplied file facts and `missing` for absent acquisition facts.

- [ ] **Step 6: Adapt acquisition-detail recording**

Target a `DisposalEntry` by stable ID. Accept only a disposal whose acquisition provenance is `missing`. Record date/unit price/currency as `user-attested`; reject documentary overwrite and date-on/after-disposal before cloning.

- [ ] **Step 7: Replace validation and pack derivation tests**

Assert:

```ts
expect(issues).toEqual(expect.arrayContaining([
  expect.objectContaining({ code: 'missing-acquisition', severity: 'blocker' }),
  expect.objectContaining({ code: 'missing-crypto-fee', severity: 'warning' }),
  expect.objectContaining({ code: 'deduction-amount-not-calculated', severity: 'warning' }),
]));
```

Generation must fail while blockers exist, then succeed after acquisition details are recorded. Repeat generation returns the stored pack without changing `generatedAt` or activity.

- [ ] **Step 8: Implement shared issue derivation and review-pack generation**

Build deduction/disposal summaries from current facts, not persisted statuses. Include source labels and provenance. Never include calculated deduction amounts or gains unless an amount was supplied directly in an input.

- [ ] **Step 9: Run all domain tests and type-check**

Run: `npm test -- src/domain && npm run typecheck`

Expected: PASS with no obsolete reconciliation imports.

- [ ] **Step 10: Commit**

```bash
git add src/domain
git commit -m "feat: record and validate deductions and disposals"
```

---

### Task 3: Observable controller and manual-agent parity boundary

**Files:**
- Replace: `src/application/returnReadyController.ts`
- Modify: `src/application/returnReadyController.test.ts`
- Modify: `src/application/ReturnReadyContext.tsx`

**Interfaces:**
- Consumes: Task 2 domain functions.
- Produces one `ReturnReadyController` with:

```ts
interface ReturnReadyController {
  getState(): ReturnState;
  subscribe(listener: () => void): () => void;
  reset(): void;
  getReturnDraft(): ReturnDraftSummary;
  recordDeductions(inputs: DeductionInput[], actor: Actor): Result<RecordBatchResult>;
  recordDisposals(inputs: DisposalInput[], actor: Actor): Result<RecordBatchResult>;
  recordAcquisitionDetails(input: AcquisitionInput, actor: Actor): Result<AcquisitionResult>;
  validateReviewPack(actor: Actor): Result<ValidationSummary>;
  generateReviewPack(actor: Actor): Result<ReviewPackResult>;
  isValidationModalOpen(): boolean;
  closeValidationModal(): void;
}
```

Migration rule: add this interface alongside the legacy controller methods still used by the Task 4 UI and Task 5 WebMCP adapter. Do not remove a legacy method until its final caller is migrated.

- [ ] **Step 1: Rewrite controller tests RED-first**

Prove sparse reads are pure; each write delegates with actor and injected clock; one notification occurs only for `changed: true`; repeats do not notify; reset restores sparse fixture and closes the modal; validation/generation modal behavior remains visible; invalid input preserves state reference.

- [ ] **Step 2: Run controller tests and verify RED**

Run: `npm test -- src/application/returnReadyController.test.ts`

Expected: FAIL on the obsolete reconcile/list-evidence interface.

- [ ] **Step 3: Implement the new controller interface**

Keep one private `state` variable and one listener set. Controller methods must be thin wrappers around Task 2 domain functions. No deduction or disposal business rule belongs in the controller.

- [ ] **Step 4: Preserve stable React subscriptions and demo clock injection**

`ReturnReadyProvider` accepts an optional `now: () => string`, creates one controller via `useRef`, and exposes state/modal snapshots with `useSyncExternalStore`.

- [ ] **Step 5: Run controller, context-dependent tests, and type-check**

Run: `npm test -- src/application src/App.test.tsx && npm run typecheck`

Expected: PASS because temporary legacy controller methods remain available until their callers migrate.

- [ ] **Step 6: Commit**

```bash
git add src/application
git commit -m "feat: expose sparse draft controller actions"
```

---

### Task 4: Sparse draft UI and equivalent manual entry

**Files:**
- Replace: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Create: `src/components/DeductionForm.tsx`
- Create: `src/components/DisposalForm.tsx`
- Create: `src/components/DeductionList.tsx`
- Replace: `src/components/InvestmentCard.tsx` with a disposal-row component or rename it to `DisposalList.tsx`
- Modify: `src/components/AcquisitionForm.tsx`
- Modify: `src/components/ReturnStepper.tsx`
- Modify: `src/components/ValidationModal.tsx`
- Modify: `src/components/ReviewPackView.tsx`
- Modify: `src/components/ActivityStrip.tsx`
- Replace: `src/components/workflow.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: Task 3 controller only; components never call domain functions directly.
- Produces accessible manual forms that submit the same `DeductionInput[]`, `DisposalInput[]`, and `AcquisitionInput` contracts used by WebMCP.

Migration rule: after the UI migrates, keep only the legacy controller methods still required by the old WebMCP adapter. Task 5 removes that adapter and performs the final legacy cleanup.

- [ ] **Step 1: Write the new judged-flow test and verify RED**

The test starts with empty Deductions/Investments, manually adds one WFH deduction and three disposals, sees the blocker/warnings, supplies missing acquisition details, validates, generates the pack, and resets. Assert the instruction copy:

```ts
expect(screen.getByText(/add entries manually, or ask Codex to populate/i)).toBeVisible();
```

Run: `npm test -- src/App.test.tsx src/components/workflow.test.tsx`

Expected: FAIL because the old UI assumes preloaded events.

- [ ] **Step 2: Implement the sparse section layout**

Keep the differentiated ReturnReady visual language. Render:

- prefilled Income context;
- empty/populated Deductions section;
- empty/populated Investment disposals section;
- visible Codex/manual instruction callout;
- one combined audit trail;
- validation and review-pack sections.

Do not render `Synthetic demo data`, `Holdings 10`, or “not processed by this prototype.” A concise footer/callout may state that the example files are synthetic.

- [ ] **Step 3: Implement deduction and disposal forms**

Every field has a label, field-scoped error association, and accessible required state. Manual submissions pass actor `human`. Forms clear only after successful changed results.

- [ ] **Step 4: Adapt missing-acquisition, validation, and pack views**

Render source label and provenance for every entry. Historical acquisition copy must explain that dates may precede FY2025–26. Modal focus enters the heading and returns to the Generate button on close.

- [ ] **Step 5: Complete responsive and keyboard styling**

Use the existing green ReturnReady system, not myTax branding. Preserve 44px targets, visible focus, text-plus-icon statuses, reduced-motion behavior, row hierarchy, and single-column behavior below 760px.

- [ ] **Step 6: Run UI tests, accessibility-focused assertions, type-check, and build**

Run: `npm test -- src/App.test.tsx src/components/workflow.test.tsx && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/components src/styles.css
git commit -m "feat: add sparse manual and Codex-populated draft UI"
```

---

### Task 5: Replace the WebMCP contract with six population tools

**Files:**
- Replace: `src/webmcp/schemas.ts`
- Replace: `src/webmcp/registerTools.ts`
- Replace: `src/webmcp/registerTools.test.ts`
- Modify: `src/App.tsx` only for registration-name integration if needed

**Interfaces:**
- Consumes: Task 3 controller.
- Produces: `registerReturnReadyTools(controller)` registering exactly the six names in Global Constraints and returning the existing guarded `{available, controller: AbortController}` lifecycle result.

- [ ] **Step 1: Rewrite captured-registration tests RED-first**

Capture production `execute` closures through a fake model context. Assert exact names, closed schemas, fixed annotations, budgets, actor `agent`, no `exposedTo`, no raw/path/URL parameters, and absence handling.

- [ ] **Step 2: Add handler behavior tests before implementation**

Call real handlers for WFH deductions, mixed disposals, acquisition resolution, validation, and pack generation. Add malformed/unknown/oversized/duplicate tests that assert referentially unchanged controller state. Assert all serialized outputs are at most 1500 characters.

- [ ] **Step 3: Run WebMCP tests and verify RED**

Run: `npm test -- src/webmcp/registerTools.test.ts`

Expected: FAIL because the old reconciliation/list-evidence tools are still registered.

- [ ] **Step 4: Implement closed schemas and independent defensive parsers**

Schema validation is advisory, not the trust boundary. Parse every object, array, enum, number, date, length, and unknown key in handler code before calling the controller. Never pass unvalidated input to a domain function.

- [ ] **Step 5: Register all tools defensively**

Use one `AbortController`, pass its signal to every registration, catch each synchronous registration failure independently, and swallow individual asynchronous registration rejections so one host failure does not prevent other tools from registering.

- [ ] **Step 6: Run WebMCP tests, type-check, and build**

Before running verification, use `rg` to identify and remove now-unreferenced reconciliation-only controller methods, domain modules, legacy fixture fields, and tests. Delete only code whose production and test callers have migrated; preserve reusable acquisition, validation, provenance, audit, and pack logic.

Run: `npm test -- src/webmcp/registerTools.test.ts src/App.test.tsx && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/webmcp src/App.tsx src/App.test.tsx
git commit -m "feat: expose Codex draft population tools"
```

---

### Task 6: Production-handler parity, browser flow, security audit, and demo evidence

**Files:**
- Replace: `src/application/parity.test.ts`
- Replace: `e2e/manual-flow.spec.ts`
- Modify: `docs/testing/webmcp-evals.md`
- Create: `docs/testing/codex-population-demo.md`
- Modify: `AGENTS.md` to replace obsolete six-tool names and opening-state constraints with the approved pivot contract
- Modify: `README.md` only if it already exists and contains obsolete product/tool copy

**Interfaces:**
- Consumes the completed application and production tool handlers.
- Produces verification evidence and a repeatable under-three-minute demo script.

- [ ] **Step 1: Write the production-handler parity test**

Drive controller A through manual controller calls and controller B only through captured production WebMCP `execute` handlers. Use the same synthetic structured facts and fixed clock. Normalize only actor/timestamp/generated-at fields, then assert equal entries, issues, pack, and idempotent repeat behavior.

- [ ] **Step 2: Replace the Playwright flow**

Prove the app works when WebMCP is unavailable: manually add a deduction and disposal records, resolve acquisition details, generate a pack with warnings, verify keyboard order/focus restoration, reset, and repeat.

- [ ] **Step 3: Update eval and demo documentation without fabricating live results**

Document six deployed prompts: standard population, partial file, repeated request, invalid date, hostile source label, and overreach/lodgement refusal. Mark live WebMCP results `PENDING` until run on the deployed origin-trial surface.

- [ ] **Step 4: Run the complete automated verification matrix**

Run each command separately and record exact totals:

```bash
npm test
npm run typecheck
npm run build
npm run test:browser
```

Expected: all pass; `dist/index.html` exists; Playwright exercises Chromium at `http://127.0.0.1:5173`.

- [ ] **Step 5: Run security and language scans**

```bash
rg -n "rawText|exposedTo|fetch\(|XMLHttpRequest|tax complete|ready to lodge|Submit return" src demo-evidence
git status --short
git ls-files .devpost-hackathon-state.json
```

Expected: no unsafe implementation hits, no forbidden claims, and `.devpost-hackathon-state.json` absent from tracked files. Test strings that assert absence are acceptable and must be reviewed in context.

- [ ] **Step 6: Rehearse the local manual flow three times**

Reset between runs. Record duration and any divergence in `docs/testing/codex-population-demo.md`. Do not mark the real Codex/WebMCP path complete until it runs on the intended browser surface with the synthetic attachments.

- [ ] **Step 7: Commit**

```bash
git add src/application/parity.test.ts e2e/manual-flow.spec.ts docs/testing AGENTS.md
git commit -m "test: verify Codex population parity and demo flow"
```

---

## Final delivery checkpoint

- Run a whole-branch review against the approved pivot specification.
- Fix Critical and Important findings in one consolidated pass, then re-review the fix diff.
- Re-run all four verification commands after the final fix.
- Deploy only after the user confirms the intended ChatGPT Sites path and required WebMCP response headers.
- Run the six live prompts using only the three synthetic attachments.
- Stop before Devpost submission or any external publication without explicit user authorization.
