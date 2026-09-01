// The shared, observable ReturnReady application controller.
//
// Owns exactly one private `ReturnState` value and exposes the methods used
// identically by the manual UI (Task 5) and the WebMCP tools (Task 6).
// Every state-changing method here delegates entirely to the pure domain
// functions from Task 3 (`src/domain/*`); this module never reimplements a
// domain rule. Its only job is deciding *when* the private state is replaced
// (immutably, using the domain function's own result) and *when* subscribers
// are notified.

import type {
  Actor,
  Currency,
  DeductionInput,
  DisposalInput,
  Result,
  ReturnState,
  ValidationIssue,
} from '../domain/model';
import { recordAcquisitionDetails as domainRecordAcquisitionDetails } from '../domain/acquisition';
import type { ReviewPack } from '../domain/reviewPack';
import { generateReviewPack as domainGenerateReviewPack } from '../domain/reviewPack';
import { validateDraftReviewPack as domainValidateDraftReviewPack } from '../domain/validation';
import { recordDeductions as domainRecordDeductions } from '../domain/recordDeductions';
import { recordDisposals as domainRecordDisposals } from '../domain/recordDisposals';
import { createDemoReturnState } from '../fixtures/demoReturn';

// --- Summary/return types ---------------------------------------------------
//
// None of these exist yet in `src/domain/model.ts`; they are the minimal,
// serializable shapes the shared controller interface needs, built directly
// from what the wrapped Task 3 functions already return.

/** Read-only whole-return readiness summary, derived fresh from event facts. */
export interface ReturnDraftSummary {
  incomeSummary: ReturnState['incomeSummary'];
  deductionCount: number;
  disposalCount: number;
  blockerCount: number;
  warningCount: number;
  canGenerate: boolean;
  issues: readonly ValidationIssue[];
}

export interface RecordBatchSummary {
  recordedIds: readonly string[];
}

export interface AcquisitionSummary {
  eventId: string;
  fxEvidenceId?: string;
}

export interface ValidationSummary {
  issues: readonly ValidationIssue[];
  canGenerate: boolean;
}

export interface ReviewPackSummary {
  pack: ReviewPack;
}

export interface AcquisitionInput {
  eventId: string;
  acquisitionDate: string;
  unitPrice: number;
  currency: Currency;
}

// --- Controller interface ----------------------------------------------------

export interface ReturnReadyController {
  getState(): ReturnState;
  subscribe(listener: () => void): () => void;
  reset(): void;
  getReturnDraft(): ReturnDraftSummary;
  recordDeductions(inputs: readonly DeductionInput[], actor: Actor): Result<RecordBatchSummary>;
  recordDisposals(inputs: readonly DisposalInput[], actor: Actor): Result<RecordBatchSummary>;
  recordAcquisitionDetails(input: AcquisitionInput, actor: Actor): Result<AcquisitionSummary>;
  validateReviewPack(actor: Actor): Result<ValidationSummary>;
  generateReviewPack(actor: Actor): Result<ReviewPackSummary>;
  /**
   * Whether the validation modal (opened by `validateReviewPack` and by a
   * blocked `generateReviewPack`, cleared by `reset`) is currently open.
   * Not part of `ReturnState` -- this is controller-owned UI state, not a
   * domain fact -- so it is exposed through its own read-only accessor.
   */
  isValidationModalOpen(): boolean;
  /**
   * Closes the validation modal opened by `validateReviewPack` or a blocked
   * `generateReviewPack`. Mirrors the private `openValidationModal`: sets
   * `validationModalOpen = false` and notifies subscribers, but only when
   * the modal is actually open (idempotent: a no-op, no notify, when it is
   * already closed). This is UI state only -- it never touches `state`.
   */
  closeValidationModal(): void;
}

const defaultNow = (): string => new Date().toISOString();

export function createReturnReadyController(options?: { now?: () => string }): ReturnReadyController {
  const now = options?.now ?? defaultNow;

  // The single private state value. R6′: the opening PERSISTED state is the
  // facts-only fixture as-is -- no state-writing reconcile runs here.
  let state: ReturnState = createDemoReturnState();
  let validationModalOpen = false;
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function openValidationModal(): void {
    if (validationModalOpen) return;
    validationModalOpen = true;
    notify();
  }

  function closeValidationModalInternal(): void {
    if (!validationModalOpen) return;
    validationModalOpen = false;
    notify();
  }

  return {
    getState() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    reset() {
      state = createDemoReturnState();
      validationModalOpen = false;
      notify();
    },

    getReturnDraft() {
      const { issues, canGenerate } = domainValidateDraftReviewPack(state);
      return {
        incomeSummary: state.incomeSummary,
        deductionCount: state.deductions.length,
        disposalCount: state.disposals.length,
        blockerCount: issues.filter((issue) => issue.severity === 'blocker').length,
        warningCount: issues.filter((issue) => issue.severity === 'warning').length,
        canGenerate,
        issues,
      };
    },

    recordDeductions(inputs, actor) {
      const result = domainRecordDeductions(state, inputs, actor, now);
      if (!result.ok) return result;
      if (result.changed) {
        state = result.value.state;
        notify();
      }
      return {
        ok: true,
        changed: result.changed,
        value: { recordedIds: result.value.recordedIds },
      };
    },

    recordDisposals(inputs, actor) {
      const result = domainRecordDisposals(state, inputs, actor, now);
      if (!result.ok) return result;
      if (result.changed) {
        state = result.value.state;
        notify();
      }
      return {
        ok: true,
        changed: result.changed,
        value: { recordedIds: result.value.recordedIds },
      };
    },

    recordAcquisitionDetails(input, actor) {
      const result = domainRecordAcquisitionDetails(state, input, actor, now);
      if (!result.ok) return result;

      if (result.changed) {
        state = result.value.state;
        notify();
      }

      return {
        ok: true,
        changed: result.changed,
        value: {
          eventId: result.value.eventId,
          fxEvidenceId: result.value.fxEvidenceId,
        },
      };
    },

    validateReviewPack(_actor) {
      // R5: wrap the domain's read-only validation into a Result, and open
      // the validation modal so the user sees why generation is (or isn't)
      // available. This never touches domain `state`, so `changed` is
      // always false here regardless of the modal's own open/closed change.
      const { issues, canGenerate } = domainValidateDraftReviewPack(state);
      openValidationModal();

      return {
        ok: true,
        changed: false,
        value: { issues, canGenerate },
      };
    },

    generateReviewPack(actor) {
      const result = domainGenerateReviewPack(state, actor, now);
      if (!result.ok) {
        // Blocked: surface the domain error as-is, and open the modal so
        // the user can see the blocking issue(s).
        openValidationModal();
        return result;
      }

      if (result.changed) {
        state = result.value.state;
        notify();
      }

      return {
        ok: true,
        changed: result.changed,
        value: { pack: result.value.pack },
      };
    },

    isValidationModalOpen() {
      return validationModalOpen;
    },

    closeValidationModal() {
      closeValidationModalInternal();
    },
  };
}
