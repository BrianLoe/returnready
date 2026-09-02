// Review-pack generation. Assembles a deterministic, human-reviewable
// summary of investment readiness. This module NEVER computes gain, loss,
// tax liability, CGT discount eligibility, or refund amounts -- it only
// surfaces facts, linked evidence, and outstanding warnings that already
// exist elsewhere in state.

import type {
  ActivityEntry,
  Actor,
  AssetClass,
  EventStatus,
  EvidenceSourceType,
  FixtureSectionStatus,
  InvestmentsStatus,
  Result,
  ReturnState,
  ValidationIssue,
} from './model';
import { deriveStatusFromIssues } from './reconcile';
import { validateDraftReviewPack } from './validation';
import { deriveDraftInvestmentsStatus } from './draftValidation';

const REVIEW_PACK_ID = 'review-pack-2026';

const ASSUMPTIONS_AND_LIMITATIONS: readonly string[] = [
  'Example evidence is provided for prototype evaluation only.',
  'This pack does not calculate capital gain, capital loss, tax liability, CGT discount eligibility, or refund amounts.',
  'User-attested acquisition facts are conversationally supplied and are not documentary evidence; verify against source records before lodgement.',
  'Unresolved warnings listed below remain outstanding and must be reviewed by the accountant before lodgement.',
];

const DISCLAIMER = 'ReturnReady does not lodge returns or provide tax advice';

export interface ReviewPackEvidenceIndexEntry {
  evidenceId: string;
  sourceType: EvidenceSourceType;
  displayName: string;
  linkedEventIds: readonly string[];
}

export interface ReviewPackEventEntry {
  eventId: string;
  assetClass: AssetClass;
  symbol: string;
  status: EventStatus;
  acquisitionProvenance: 'documentary' | 'user-attested' | 'missing';
}

export interface ReviewPackDeductionEntry {
  sourceRecordId: string;
  category: string;
  description: string;
  periodStart: string;
  periodEnd: string;
  quantity: number;
  unit: string;
  calculationMethod: 'fixed-rate' | 'actual-cost';
  rateMinorPerHour?: number;
  claimAmountMinor?: number;
  sourceLabel: string;
  provenance: 'documentary' | 'user-attested';
}

export interface ReviewPackDisposalEntry {
  sourceRecordId: string;
  assetType: AssetClass;
  symbol: string;
  disposalDate: string;
  status: EventStatus;
  acquisitionProvenance: 'documentary' | 'user-attested' | 'missing';
  sourceLabel: string;
}

export interface ReviewPack {
  id: string;
  generatedAt: string;
  sectionReadiness: {
    income: FixtureSectionStatus;
    deductions: FixtureSectionStatus;
    investments: InvestmentsStatus;
  };
  evidenceIndex: readonly ReviewPackEvidenceIndexEntry[];
  eventReviewTable: readonly ReviewPackEventEntry[];
  deductionEvidence: readonly ReviewPackDeductionEntry[];
  disposalReviewTable: readonly ReviewPackDisposalEntry[];
  unresolvedWarnings: readonly ValidationIssue[];
  assumptionsAndLimitations: readonly string[];
  disclaimer: string;
}

function buildPack(
  state: ReturnState,
  issues: readonly ValidationIssue[],
  now: () => string,
): ReviewPack {
  return {
    id: REVIEW_PACK_ID,
    generatedAt: now(),
    sectionReadiness: {
      income: state.incomeStatus,
      deductions: state.deductionsStatus,
      // Derived FRESH from the same `issues` (not `state.investmentsStatus`),
      // exactly as the controller's `getReturnReadiness` does, so the pack can
      // never contradict the live readiness -- e.g. an attest-without-reconcile
      // flow leaves persisted statuses stale but the pack stays accurate.
      investments: deriveDraftInvestmentsStatus(state, issues),
    },
    evidenceIndex: state.evidence.map((item) => ({
      evidenceId: item.id,
      sourceType: item.sourceType,
      displayName: item.displayName,
      linkedEventIds: [...item.linkedEventIds],
    })),
    eventReviewTable: state.events.map((event) => ({
      eventId: event.id,
      assetClass: event.assetClass,
      symbol: event.symbol,
      // Fresh per-event status from the same issues (not `event.status`), for
      // the same non-divergence reason as the section rollup above.
      status: deriveStatusFromIssues(issues.filter((issue) => issue.eventId === event.id)),
      acquisitionProvenance: event.acquisition.provenance,
    })),
    deductionEvidence: state.deductions.map((deduction) => ({
      sourceRecordId: deduction.sourceRecordId,
      category: deduction.category,
      description: deduction.description,
      periodStart: deduction.periodStart,
      periodEnd: deduction.periodEnd,
      quantity: deduction.quantity,
      unit: deduction.unit,
      calculationMethod: deduction.calculationMethod,
      ...(deduction.rateMinorPerHour === undefined ? {} : { rateMinorPerHour: deduction.rateMinorPerHour }),
      ...(deduction.claimAmountMinor === undefined ? {} : { claimAmountMinor: deduction.claimAmountMinor }),
      sourceLabel: deduction.sourceLabel,
      provenance: deduction.provenance,
    })),
    disposalReviewTable: state.disposals.map((disposal) => ({
      sourceRecordId: disposal.sourceRecordId,
      assetType: disposal.assetType,
      symbol: disposal.symbol,
      disposalDate: disposal.disposalDate,
      status: deriveStatusFromIssues(
        issues.filter((issue) => issue.eventId === disposal.id),
      ),
      acquisitionProvenance: disposal.acquisition.provenance,
      sourceLabel: disposal.sourceLabel,
    })),
    unresolvedWarnings: issues.filter((issue) => issue.severity === 'warning'),
    assumptionsAndLimitations: ASSUMPTIONS_AND_LIMITATIONS,
    disclaimer: DISCLAIMER,
  };
}

export function generateReviewPack(
  state: ReturnState,
  actor: Actor,
  now: () => string,
): Result<{ state: ReturnState; pack: ReviewPack }> {
  const validation = validateDraftReviewPack(state);
  if (!validation.canGenerate) {
    return {
      ok: false,
      error: {
        code: 'blocked',
        message: 'Review pack cannot be generated while blocking issues remain.',
      },
      changed: false,
    };
  }

  if (state.reviewPackId === REVIEW_PACK_ID) {
    // Idempotent repeat: return the STORED pack rather than rebuilding it.
    // Rebuilding would call `now()` again and drift `generatedAt`, so the
    // pack must be read back from state, not regenerated.
    const storedPack = state.reviewPack;
    if (storedPack === null) {
      // Unreachable: `reviewPackId` is only ever set together with
      // `reviewPack` (below). Guarding narrows the type without `!` and makes
      // the invariant explicit.
      throw new Error('Invariant: reviewPackId is set but no review pack is stored.');
    }
    return {
      ok: true,
      changed: false,
      value: { state, pack: storedPack },
    };
  }

  const clone = structuredClone(state);
  clone.reviewPackId = REVIEW_PACK_ID;

  // Build the pack ONCE (a single `now()` call) and store it on state, so
  // every later read returns this exact snapshot.
  const pack = buildPack(clone, validation.issues, now);
  clone.reviewPack = pack;

  const activityEntry: ActivityEntry = {
    id: `activity-${clone.activity.length + 1}`,
    timestamp: now(),
    actor,
    action: 'generate-review-pack',
    description: 'Generated the review pack for accountant review.',
    recordId: REVIEW_PACK_ID,
  };
  clone.activity.push(activityEntry);

  return {
    ok: true,
    changed: true,
    value: { state: clone, pack },
  };
}
