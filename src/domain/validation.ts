// Pure, read-only readiness validation. Deliberately re-derives issues
// directly from `state.events` every call (via the same
// `deriveIssuesForEvents` used by reconciliation) rather than trusting
// `state.issues`, so this is authoritative regardless of whether individual
// events have been reconciled yet.

import type { ReturnState, ValidationIssue } from './model';
import { deriveDraftIssues } from './draftValidation';

export function validateDraftReviewPack(state: ReturnState): {
  issues: readonly ValidationIssue[];
  canGenerate: boolean;
} {
  const issues = deriveDraftIssues(state);
  return { issues, canGenerate: !issues.some((issue) => issue.severity === 'blocker') };
}
