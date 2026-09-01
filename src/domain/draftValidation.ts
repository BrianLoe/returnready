import type { ReturnState, ValidationIssue } from './model';
import type { InvestmentsStatus } from './model';

export const FY_START = '2025-07-01';
export const FY_END = '2026-06-30';

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isFy2025_26Date(value: string): boolean {
  return isValidIsoDate(value) && value >= FY_START && value <= FY_END;
}

export function deriveDraftIssues(state: ReturnState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const deduction of state.deductions) {
    if (deduction.claimAmountMinor === undefined) {
      issues.push({
        id: `issue-${deduction.id}-amount-not-calculated`,
        code: 'deduction-amount-not-calculated',
        severity: 'warning',
        eventId: deduction.id,
        message:
          'Deduction evidence is recorded, but ReturnReady has not calculated a claim amount.',
        resolutionFields: ['claimAmountMinor'],
        resolved: false,
      });
    }
  }

  for (const disposal of state.disposals) {
    if (
      disposal.acquisition.date === undefined ||
      disposal.acquisition.unitPriceMinor === undefined
    ) {
      issues.push({
        id: `issue-${disposal.id}-missing-acquisition`,
        code: 'missing-acquisition',
        severity: 'blocker',
        eventId: disposal.id,
        message:
          'Acquisition date and unit cost are required before this disposal can be evidence-complete for review.',
        resolutionFields: ['acquisitionDate', 'unitPrice', 'currency'],
        resolved: false,
      });
    }

    if (disposal.assetType === 'crypto' && disposal.feeMinor === undefined) {
      issues.push({
        id: `issue-${disposal.id}-missing-crypto-fee`,
        code: 'missing-crypto-fee',
        severity: 'warning',
        eventId: disposal.id,
        message:
          'Transaction fee evidence is missing for this crypto disposal; it remains a visible warning and does not block review.',
        resolutionFields: ['feeMinor'],
        resolved: false,
      });
    }
  }

  return issues;
}

export function refreshDraftIssues(state: ReturnState): ValidationIssue[] {
  const issues = deriveDraftIssues(state);
  state.issues = issues;
  state.blockerCount = issues.filter((issue) => issue.severity === 'blocker').length;
  state.warningCount = issues.filter((issue) => issue.severity === 'warning').length;

  state.investmentsStatus = deriveDraftInvestmentsStatus(state, issues);

  return issues;
}

export function deriveDraftInvestmentsStatus(
  state: ReturnState,
  issues: readonly ValidationIssue[],
): InvestmentsStatus {
  const disposalIssues = issues.filter((issue) => issue.eventId.startsWith('disposal-'));
  if (state.disposals.length === 0) return 'unreviewed';
  if (disposalIssues.some((issue) => issue.severity === 'blocker')) return 'action-required';
  if (disposalIssues.some((issue) => issue.severity === 'warning')) return 'warning';
  return 'evidence-complete-for-review';
}
