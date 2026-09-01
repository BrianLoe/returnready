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
  EventStatus,
  FixtureSectionStatus,
  InvestmentsStatus,
  NormalizedEvidenceSummary,
  Result,
  ReturnState,
  ValidationIssue,
} from '../domain/model';
import { recordAcquisitionDetails as domainRecordAcquisitionDetails } from '../domain/acquisition';
import { normalizeEvidence } from '../domain/normalizeEvidence';
import { deriveInvestmentsStatusFromIssues, reconcileEvents } from '../domain/reconcile';
import type { ReviewPack } from '../domain/reviewPack';
import { generateReviewPack as domainGenerateReviewPack } from '../domain/reviewPack';
import { validateReviewPack as domainValidateReviewPack } from '../domain/validation';
import { createDemoReturnState } from '../fixtures/demoReturn';

// --- Summary/return types ---------------------------------------------------
//
// None of these exist yet in `src/domain/model.ts`; they are the minimal,
// serializable shapes the shared controller interface needs, built directly
// from what the wrapped Task 3 functions already return.

/** Read-only whole-return readiness summary, derived fresh from event facts. */
export interface ReturnReadiness {
  incomeStatus: FixtureSectionStatus;
  deductionsStatus: FixtureSectionStatus;
  investmentsStatus: InvestmentsStatus;
  blockerCount: number;
  warningCount: number;
  canGenerate: boolean;
}

export interface ReconcileSummary {
  reconciledEventIds: readonly string[];
  issues: readonly ValidationIssue[];
}

export interface AcquisitionSummary {
  eventId: string;
  fxEvidenceId: string;
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
  getReturnReadiness(): ReturnReadiness;
  listInvestmentEvidence(filter?: EventStatus): readonly NormalizedEvidenceSummary[];
  reconcileInvestmentEvidence(eventIds: readonly string[], actor: Actor): Result<ReconcileSummary>;
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

    getReturnReadiness() {
      // Read-only: re-derives issues straight from the current event facts
      // via the domain's own `validateReviewPack`, without touching `state`
      // or logging activity. This is what lets the opening screen already
      // show "Action required" with 1 blocker + 1 warning before anything
      // has been reconciled.
      const { issues, canGenerate } = domainValidateReviewPack(state);
      const blockerCount = issues.filter((issue) => issue.severity === 'blocker').length;
      const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

      // Roll the fresh issues up to one section-level label via the shared
      // domain rule (`deriveInvestmentsStatusFromIssues`), which derives each
      // per-event status from these same fresh issues and then applies the
      // rollup. `buildPack` uses the identical helper, so the readiness
      // summary and the generated pack never diverge.
      const investmentsStatus = deriveInvestmentsStatusFromIssues(state.events, issues);

      return {
        incomeStatus: state.incomeStatus,
        deductionsStatus: state.deductionsStatus,
        investmentsStatus,
        blockerCount,
        warningCount,
        canGenerate,
      };
    },

    listInvestmentEvidence(filter) {
      // Every evidence record is returned through the same allow-listed
      // `normalizeEvidence` boundary (matching `reviewPack.ts`'s own
      // unfiltered `evidenceIndex`); `filter` narrows to records linked to
      // at least one investment event currently at that status. Records
      // that back the previously-reviewed Income/Deductions sections are
      // never linked to an investment event, so a status filter excludes
      // them naturally without a separate source-type allow-list here.
      return state.evidence
        .filter((item) => {
          if (filter === undefined) return true;
          return item.linkedEventIds.some((eventId) => {
            const event = state.events.find((candidate) => candidate.id === eventId);
            return event?.status === filter;
          });
        })
        .map(normalizeEvidence);
    },

    reconcileInvestmentEvidence(eventIds, actor) {
      const result = reconcileEvents(state, eventIds, actor, now);
      if (!result.ok) return result;

      if (result.changed) {
        state = result.value.state;
        notify();
      }

      return {
        ok: true,
        changed: result.changed,
        value: {
          reconciledEventIds: result.value.reconciledEventIds,
          issues: result.value.issues,
        },
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
      const { issues, canGenerate } = domainValidateReviewPack(state);
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
