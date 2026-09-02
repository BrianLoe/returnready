import type { Actor, DeductionEntry, DeductionInput, Result, ReturnState } from './model';
import { buildActivityEntry, deepEqual } from './reconcile';
import { isFy2025_26Date, refreshDraftIssues } from './draftValidation';

/** ATO fixed rate for FY2025-26: 70 cents per work hour. */
export const FY2025_26_FIXED_RATE_MINOR_PER_HOUR = 70;

function invalid(message: string): Result<never> {
  return { ok: false, error: { code: 'invalid_input', message }, changed: false };
}

function validateInput(input: DeductionInput): string | null {
  if (!input.sourceRecordId || input.sourceRecordId.length > 64) return 'sourceRecordId must be 1-64 characters.';
  if (!['work-from-home', 'other-work-related'].includes(input.category)) return 'category is unsupported.';
  if (!input.description || input.description.length > 120) return 'description must be 1-120 characters.';
  if (!isFy2025_26Date(input.periodStart)) return 'periodStart must be within FY2025-26.';
  if (!isFy2025_26Date(input.periodEnd)) return 'periodEnd must be within FY2025-26.';
  if (input.periodStart > input.periodEnd) return 'periodStart must not be after periodEnd.';
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return 'quantity must be a positive finite number.';
  if (!['hours', 'AUD'].includes(input.unit)) return 'unit is unsupported.';
  if (!['fixed-rate', 'actual-cost'].includes(input.calculationMethod)) return 'calculationMethod is unsupported.';
  if (input.calculationMethod === 'fixed-rate' && input.category !== 'work-from-home') {
    return 'fixed-rate calculation is limited to work-from-home deductions.';
  }
  if (input.calculationMethod === 'fixed-rate' && input.unit !== 'hours') {
    return 'fixed-rate deductions must use hours.';
  }
  if (input.calculationMethod === 'actual-cost') {
    return 'actual-cost deductions require itemised expense evidence.';
  }
  if (input.currency !== 'AUD') return 'currency must be AUD.';
  if (!input.sourceLabel || input.sourceLabel.length > 120) return 'sourceLabel must be 1-120 characters.';
  return null;
}

function toEntry(input: DeductionInput, actor: Actor): DeductionEntry {
  const claimAmountMinor = Math.round(input.quantity * FY2025_26_FIXED_RATE_MINOR_PER_HOUR);
  return {
    id: `deduction-${input.sourceRecordId}`,
    ...structuredClone(input),
    rateMinorPerHour: FY2025_26_FIXED_RATE_MINOR_PER_HOUR,
    claimAmountMinor,
    provenance: actor === 'agent' ? 'documentary' : 'user-attested',
  };
}

export function recordDeductions(
  state: ReturnState,
  inputs: readonly DeductionInput[],
  actor: Actor,
  now: () => string,
): Result<{ state: ReturnState; recordedIds: string[] }> {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 20) {
    return invalid('recordDeductions requires 1-20 entries.');
  }
  const ids = inputs.map((input) => input.sourceRecordId);
  if (new Set(ids).size !== ids.length) return invalid('sourceRecordId values must be unique within a batch.');

  const entries = inputs.map((input) => toEntry(input, actor));
  for (let index = 0; index < inputs.length; index += 1) {
    const message = validateInput(inputs[index]);
    if (message) return invalid(message);
    const existing = state.deductions.find((entry) => entry.sourceRecordId === inputs[index].sourceRecordId);
    if (existing && !deepEqual(existing, entries[index])) {
      return invalid(`sourceRecordId ${inputs[index].sourceRecordId} already exists with different facts.`);
    }
  }

  const additions = entries.filter(
    (entry) => !state.deductions.some((existing) => existing.sourceRecordId === entry.sourceRecordId),
  );
  if (additions.length === 0) {
    return { ok: true, changed: false, value: { state, recordedIds: entries.map((entry) => entry.id) } };
  }

  const clone = structuredClone(state);
  clone.deductions.push(...additions);
  refreshDraftIssues(clone);
  clone.activity.push(
    buildActivityEntry(
      clone,
      actor,
      'record-deductions',
      `Recorded ${additions.length} deduction entr${additions.length === 1 ? 'y' : 'ies'} from structured evidence.`,
      additions.map((entry) => entry.id).join(','),
      now,
    ),
  );
  return { ok: true, changed: true, value: { state: clone, recordedIds: entries.map((entry) => entry.id) } };
}
