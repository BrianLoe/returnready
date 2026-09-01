import type { Actor, DisposalEntry, DisposalInput, Result, ReturnState } from './model';
import { buildActivityEntry, deepEqual } from './reconcile';
import { isFy2025_26Date, isValidIsoDate, refreshDraftIssues } from './draftValidation';

function invalid(message: string): Result<never> {
  return { ok: false, error: { code: 'invalid_input', message }, changed: false };
}

function optionalPositiveMinor(value: number | undefined, field: string): string | null {
  if (value === undefined) return null;
  return Number.isSafeInteger(value) && value > 0 ? null : `${field} must be a positive safe integer.`;
}

function validateInput(input: DisposalInput): string | null {
  if (!input.sourceRecordId || input.sourceRecordId.length > 64) return 'sourceRecordId must be 1-64 characters.';
  if (!['foreign-share', 'crypto'].includes(input.assetType)) return 'assetType is unsupported.';
  if (!/^[A-Z0-9.-]{1,12}$/.test(input.symbol)) return 'symbol must be 1-12 uppercase characters.';
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return 'quantity must be a positive finite number.';
  if (!isFy2025_26Date(input.disposalDate)) return 'disposalDate must be within FY2025-26.';
  if (!Number.isSafeInteger(input.proceedsMinor) || input.proceedsMinor <= 0) return 'proceedsMinor must be a positive safe integer.';
  if (!['AUD', 'USD'].includes(input.currency)) return 'currency is unsupported.';
  const brokerageError = optionalPositiveMinor(input.brokerageMinor, 'brokerageMinor');
  if (brokerageError) return brokerageError;
  const feeError = optionalPositiveMinor(input.feeMinor, 'feeMinor');
  if (feeError) return feeError;
  if (!input.sourceLabel || input.sourceLabel.length > 120) return 'sourceLabel must be 1-120 characters.';

  const acquisitionCount = [input.acquisitionDate, input.acquisitionUnitPriceMinor, input.acquisitionCurrency]
    .filter((value) => value !== undefined).length;
  if (acquisitionCount !== 0 && acquisitionCount !== 3) return 'acquisition fields must be supplied together or omitted together.';
  if (input.acquisitionDate !== undefined) {
    if (!isValidIsoDate(input.acquisitionDate)) return 'acquisitionDate must be a valid YYYY-MM-DD date.';
    if (input.acquisitionDate >= input.disposalDate) return 'acquisitionDate must be strictly before disposalDate.';
    if (
      input.acquisitionUnitPriceMinor === undefined ||
      !Number.isSafeInteger(input.acquisitionUnitPriceMinor) ||
      input.acquisitionUnitPriceMinor <= 0
    ) {
      return 'acquisitionUnitPriceMinor must be a positive safe integer.';
    }
    if (input.acquisitionCurrency !== 'AUD' && input.acquisitionCurrency !== 'USD') {
      return 'acquisitionCurrency is unsupported.';
    }
  }
  return null;
}

function toEntry(input: DisposalInput): DisposalEntry {
  const acquisition = input.acquisitionDate === undefined
    ? { provenance: 'missing' as const }
    : {
        date: input.acquisitionDate,
        unitPriceMinor: input.acquisitionUnitPriceMinor,
        currency: input.acquisitionCurrency,
        provenance: 'documentary' as const,
      };
  return {
    id: `disposal-${input.sourceRecordId}`,
    sourceRecordId: input.sourceRecordId,
    assetType: input.assetType,
    symbol: input.symbol,
    quantity: input.quantity,
    acquisition,
    disposalDate: input.disposalDate,
    proceedsMinor: input.proceedsMinor,
    currency: input.currency,
    ...(input.brokerageMinor === undefined ? {} : { brokerageMinor: input.brokerageMinor }),
    ...(input.feeMinor === undefined ? {} : { feeMinor: input.feeMinor }),
    sourceLabel: input.sourceLabel,
    provenance: 'documentary',
  };
}

export function recordDisposals(
  state: ReturnState,
  inputs: readonly DisposalInput[],
  actor: Actor,
  now: () => string,
): Result<{ state: ReturnState; recordedIds: string[] }> {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 20) {
    return invalid('recordDisposals requires 1-20 entries.');
  }
  const ids = inputs.map((input) => input.sourceRecordId);
  if (new Set(ids).size !== ids.length) return invalid('sourceRecordId values must be unique within a batch.');

  const entries = inputs.map(toEntry);
  for (let index = 0; index < inputs.length; index += 1) {
    const message = validateInput(inputs[index]);
    if (message) return invalid(message);
    const existing = state.disposals.find((entry) => entry.sourceRecordId === inputs[index].sourceRecordId);
    if (existing && !deepEqual(existing, entries[index])) {
      return invalid(`sourceRecordId ${inputs[index].sourceRecordId} already exists with different facts.`);
    }
  }

  const additions = entries.filter(
    (entry) => !state.disposals.some((existing) => existing.sourceRecordId === entry.sourceRecordId),
  );
  if (additions.length === 0) {
    return { ok: true, changed: false, value: { state, recordedIds: entries.map((entry) => entry.id) } };
  }

  const clone = structuredClone(state);
  clone.disposals.push(...additions);
  refreshDraftIssues(clone);
  clone.activity.push(
    buildActivityEntry(
      clone,
      actor,
      'record-disposals',
      `Recorded ${additions.length} disposal entr${additions.length === 1 ? 'y' : 'ies'} from structured evidence.`,
      additions.map((entry) => entry.id).join(','),
      now,
    ),
  );
  return { ok: true, changed: true, value: { state: clone, recordedIds: entries.map((entry) => entry.id) } };
}
