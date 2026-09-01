// Proves that driving ReturnReady through the WebMCP tool surface (the
// browser-agent path) produces the exact same domain outcome as driving the
// same sequence of actions directly through the shared controller (the
// manual/human path). This is the AGENTS.md "Testing and Verification"
// requirement: "Browser verification that the manual and WebMCP paths
// invoke the same behaviour" -- exercised here at the controller/tool-handler
// level (Playwright's `e2e/manual-flow.spec.ts` covers the manual path in a
// real browser separately).
//
// Two independent `ReturnReadyController` instances are created from the
// same immutable fixture and driven with the same fixed `now()` so
// timestamps are directly comparable rather than merely close. Controller A
// is driven by calling its methods directly with actor `'human'` (exactly
// what the manual UI in `App.tsx` does). Controller B is driven exclusively
// by invoking the `execute()` function captured off each WebMCP tool
// definition that `registerReturnReadyTools` would hand to a real host --
// the same function a WebMCP-capable browser would call, not a
// reimplementation of it.

/// <reference types="webmcp-types" />

import { describe, expect, it } from 'vitest';
import type { ActivityEntry, Result, ReturnState, ValidationIssue } from '../domain/model';
import { createReturnReadyController, type ReturnReadyController } from './returnReadyController';
import { registerReturnReadyTools } from '../webmcp/registerTools';
import type { ReviewPack } from '../domain/reviewPack';

const fixedNow = () => '2026-08-31T00:00:00.000Z';

// Same demo attestation used throughout the app's own tests (see
// `returnReadyController.test.ts`, `registerTools.test.ts`,
// `workflow.test.tsx`): AAPL's disposal date (2023-05-02) is strictly after
// the fixture's 2022-09-15/USD FX row, so this is a valid, FX-backed
// acquisition attestation that resolves AAPL's missing-acquisition blocker.
const AAPL_ACQUISITION = {
  eventId: 'evt-aapl',
  acquisitionDate: '2022-09-15',
  unitPrice: 150,
  currency: 'USD' as const,
};

const ALL_EVENT_IDS = ['evt-msft', 'evt-aapl', 'evt-btc'];

// --- Capturing the WebMCP tool handlers without a real host ------------------
//
// `registerReturnReadyTools` reads the global `document.modelContext`
// internally -- it takes no modelContext parameter -- so a fake is installed
// on `document` for exactly the duration of registration, then the previous
// value is restored. Each captured tool's own `execute(args)` is then called
// directly: the exact function a real WebMCP host would invoke to run the
// agent path, never a second implementation of it.

interface CapturedTool {
  execute: (args: unknown) => Promise<string>;
}

function captureTools(controller: ReturnReadyController): Map<string, CapturedTool> {
  const captured = new Map<string, CapturedTool>();
  const fakeModelContext = {
    registerTool: (tool: WebMCP.ModelContextTool) => {
      captured.set(tool.name, {
        execute: (args: unknown) =>
          tool.execute(args as Record<string, unknown>, {
            signal: new AbortController().signal,
          }) as Promise<string>,
      });
      return Promise.resolve();
    },
  };

  const doc = document as unknown as { modelContext?: unknown };
  const previous = doc.modelContext;
  doc.modelContext = fakeModelContext;
  try {
    const registration = registerReturnReadyTools(controller);
    if (!registration.available) {
      throw new Error('WebMCP tool registration did not run against the fake modelContext.');
    }
  } finally {
    doc.modelContext = previous;
  }

  return captured;
}

async function callTool<T>(tools: Map<string, CapturedTool>, name: string, args: unknown): Promise<T> {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Tool "${name}" was not registered.`);
  const raw = await tool.execute(args);
  return JSON.parse(raw) as T;
}

// --- Normalization: strip fields expected to legitimately differ ------------
//
// `actor` differs by design between the two paths ('human' vs 'agent'). Every
// other activity field -- id, timestamp, action, description, recordId -- is
// deterministic given the same fixed `now()` and the same call sequence, but
// timestamp and description are stripped anyway per the parity contract so
// this test never silently starts depending on incidental determinism in
// message wording or clock plumbing.

function normalizeActivity(entry: ActivityEntry): Pick<ActivityEntry, 'id' | 'action' | 'recordId'> {
  return { id: entry.id, action: entry.action, recordId: entry.recordId };
}

function normalizeState(state: ReturnState): unknown {
  return {
    ...state,
    activity: state.activity.map(normalizeActivity),
    // Strip the stored pack's `generatedAt` for the same reason the top-level
    // pack comparison does (see `normalizePack`): the parity contract must not
    // silently depend on incidental clock determinism. Both controllers share
    // `fixedNow` so it matches today, but strip it regardless.
    reviewPack: state.reviewPack ? normalizePack(state.reviewPack) : null,
  };
}

function normalizePack(pack: ReviewPack): unknown {
  const { generatedAt: _generatedAt, ...rest } = pack;
  return rest;
}

describe('manual/agent parity: same sequence, same domain outcome', () => {
  it('reconcile -> record acquisition -> validate -> generate: direct human calls and captured WebMCP tool calls converge on equal state, issues, and pack contents', async () => {
    const controllerA = createReturnReadyController({ now: fixedNow }); // manual/human path
    const controllerB = createReturnReadyController({ now: fixedNow }); // WebMCP/agent path
    const tools = captureTools(controllerB);

    // --- Step 1: reconcile all three investment events ------------------------
    const reconcileA = controllerA.reconcileInvestmentEvidence(ALL_EVENT_IDS, 'human');
    const reconcileB = await callTool<Result<{ reconciledEventIds: readonly string[] }>>(
      tools,
      'reconcile_investment_evidence',
      { eventIds: ALL_EVENT_IDS },
    );
    expect(reconcileA.ok).toBe(true);
    expect(reconcileB.ok).toBe(true);
    expect(reconcileB.changed).toBe(reconcileA.changed);

    // --- Step 2: record the AAPL acquisition attestation -----------------------
    const acquisitionA = controllerA.recordAcquisitionDetails(AAPL_ACQUISITION, 'human');
    const acquisitionB = await callTool<Result<{ eventId: string; fxEvidenceId: string }>>(
      tools,
      'record_acquisition_details',
      AAPL_ACQUISITION,
    );
    expect(acquisitionA.ok).toBe(true);
    expect(acquisitionB.ok).toBe(true);
    expect(acquisitionB.changed).toBe(acquisitionA.changed);

    // --- Step 3: validate --------------------------------------------------------
    const validateA = controllerA.validateReviewPack('human');
    const validateB = await callTool<Result<{ issues: readonly ValidationIssue[]; canGenerate: boolean }>>(
      tools,
      'validate_review_pack',
      {},
    );
    expect(validateA.ok).toBe(true);
    expect(validateB.ok).toBe(true);
    if (validateA.ok && validateB.ok) {
      expect(validateB.value.issues).toEqual(validateA.value.issues);
      expect(validateB.value.canGenerate).toBe(validateA.value.canGenerate);
    }

    // --- Step 4: generate the review pack -----------------------------------------
    const generateB = await callTool<Result<{ packId: string }>>(tools, 'generate_review_pack', {});
    expect(generateB.ok).toBe(true);
    if (generateB.ok) expect(generateB.value.packId).toBe('review-pack-2025');

    const generateA = controllerA.generateReviewPack('human');
    expect(generateA.ok).toBe(true);

    // --- Assert: whole-state parity (modulo actor/timestamp/description) ---------
    expect(normalizeState(controllerB.getState())).toEqual(normalizeState(controllerA.getState()));

    // --- Assert: review-pack contents parity --------------------------------------
    // Re-derive each controller's own full pack directly (an idempotent
    // repeat -- both already have `reviewPackId` set, so this makes no
    // further state change) to compare the actual domain `ReviewPack` each
    // path produced, not the WebMCP tool's deliberately size-projected
    // output shape (see `registerTools.ts`'s `GenerateReviewPackValue`).
    const packA = controllerA.generateReviewPack('human');
    const packB = controllerB.generateReviewPack('agent');
    expect(packA.ok).toBe(true);
    expect(packB.ok).toBe(true);
    if (packA.ok && packB.ok) {
      expect(packA.changed).toBe(false);
      expect(packB.changed).toBe(false);
      expect(normalizePack(packB.value.pack)).toEqual(normalizePack(packA.value.pack));
    }
  });

  it('an invalid tool call and its equivalent invalid direct call both reject and leave state unchanged', async () => {
    const controllerA = createReturnReadyController({ now: fixedNow });
    const controllerB = createReturnReadyController({ now: fixedNow });
    const tools = captureTools(controllerB);

    const beforeA = controllerA.getState();
    const beforeB = controllerB.getState();

    // A negative acquisition value is rejected by both the direct domain
    // call and the WebMCP tool's own defensive re-validation, before either
    // ever reaches the controller.
    const invalidInput = { ...AAPL_ACQUISITION, unitPrice: -5 };
    const directResult = controllerA.recordAcquisitionDetails(invalidInput, 'human');
    const toolResult = await callTool<Result<{ eventId: string }>>(
      tools,
      'record_acquisition_details',
      invalidInput,
    );

    expect(directResult.ok).toBe(false);
    expect(toolResult.ok).toBe(false);
    if (!directResult.ok && !toolResult.ok) {
      expect(toolResult.error.code).toBe(directResult.error.code);
    }
    expect(controllerA.getState()).toBe(beforeA);
    expect(controllerB.getState()).toBe(beforeB);
  });
});
