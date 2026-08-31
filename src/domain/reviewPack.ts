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
import { validateReviewPack } from './validation';

const REVIEW_PACK_ID = 'review-pack-2025';

const ASSUMPTIONS_AND_LIMITATIONS: readonly string[] = [
  'All figures shown are synthetic demo data for prototype evaluation only.',
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
      investments: state.investmentsStatus,
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
      status: event.status,
      acquisitionProvenance: event.acquisition.provenance,
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
  const validation = validateReviewPack(state);
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
    // Idempotent repeat: same pack id, no new activity, state unchanged.
    return {
      ok: true,
      changed: false,
      value: { state, pack: buildPack(state, validation.issues, now) },
    };
  }

  const clone = structuredClone(state);
  clone.reviewPackId = REVIEW_PACK_ID;

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
    value: { state: clone, pack: buildPack(clone, validation.issues, now) },
  };
}
