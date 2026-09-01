import type { Actor, DeductionEntry, DeductionInput, Result, ReturnState } from './model';
import { buildActivityEntry, deepEqual } from './reconcile';
import { isFy2025_26Date, refreshDraftIssues } from './draftValidation';

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
  if (input.currency !== 'AUD') return 'currency must be AUD.';
  if (
    input.claimAmountMinor !== undefined &&
    (!Number.isSafeInteger(input.claimAmountMinor) || input.claimAmountMinor <= 0)
  ) return 'claimAmountMinor must be a positive safe integer when supplied.';
  if (!input.sourceLabel || input.sourceLabel.length > 120) return 'sourceLabel must be 1-120 characters.';
  return null;
}

function toEntry(input: DeductionInput, actor: Actor): DeductionEntry {
  return {
    id: `deduction-${input.sourceRecordId}`,
    ...structuredClone(input),
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
