// Pure, read-only readiness validation. Deliberately re-derives issues
// directly from `state.events` every call (via the same
// `deriveIssuesForEvents` used by reconciliation) rather than trusting
// `state.issues`, so this is authoritative regardless of whether individual
// events have been reconciled yet.

import type { ReturnState, ValidationIssue } from './model';
import { deriveIssuesForEvents } from './reconcile';
import { deriveDraftIssues } from './draftValidation';

export function validateDraftReviewPack(state: ReturnState): {
  issues: readonly ValidationIssue[];
  canGenerate: boolean;
} {
  const issues = deriveDraftIssues(state);
  return { issues, canGenerate: !issues.some((issue) => issue.severity === 'blocker') };
}

export function validateReviewPack(state: ReturnState): {
  issues: readonly ValidationIssue[];
  canGenerate: boolean;
} {
  const issues = deriveIssuesForEvents(state.events);
  const canGenerate = !issues.some((issue) => issue.severity === 'blocker');
  return { issues, canGenerate };
}
