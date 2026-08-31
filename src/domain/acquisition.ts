// Recording a user-attested acquisition date and unit price for an
// investment event, and linking the FX evidence that corroborates it.

import type { Actor, Currency, Result, ReturnState } from './model';
import { buildActivityEntry, deepEqual, upsertIssuesForEvents } from './reconcile';

const SUPPORTED_CURRENCIES: readonly string[] = ['AUD', 'USD'];

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

export function recordAcquisitionDetails(
  state: ReturnState,
  input: { eventId: string; acquisitionDate: string; unitPrice: number; currency: Currency },
  actor: Actor,
  now: () => string,
): Result<{ state: ReturnState; eventId: string; fxEvidenceId: string }> {
  const event = state.events.find((candidate) => candidate.id === input.eventId);
  if (!event) {
    return {
      ok: false,
      error: { code: 'not_found', message: `Unknown event id: ${input.eventId}` },
      changed: false,
    };
  }

  if (!SUPPORTED_CURRENCIES.includes(input.currency)) {
    return {
      ok: false,
      error: { code: 'invalid_input', message: `Unsupported currency: ${input.currency}` },
      changed: false,
    };
  }

  if (typeof input.unitPrice !== 'number' || !Number.isFinite(input.unitPrice) || input.unitPrice <= 0) {
    return {
      ok: false,
      error: { code: 'invalid_input', message: 'unitPrice must be a positive finite number.' },
      changed: false,
    };
  }

  if (typeof input.acquisitionDate !== 'string' || !isValidIsoDate(input.acquisitionDate)) {
    return {
      ok: false,
      error: { code: 'invalid_input', message: 'acquisitionDate must be a valid YYYY-MM-DD date.' },
      changed: false,
    };
  }

  if (input.acquisitionDate >= event.disposal.date) {
    return {
      ok: false,
      error: {
        code: 'invalid_input',
        message: 'acquisitionDate must be strictly before the disposal date.',
      },
      changed: false,
    };
  }

  const fxEvidence = state.evidence.find(
    (candidate) =>
      candidate.facts.kind === 'fx-rates' &&
      candidate.facts.rates.some(
        (rate) => rate.date === input.acquisitionDate && rate.currency === input.currency,
      ),
  );
  if (!fxEvidence) {
    return {
      ok: false,
      error: {
        code: 'not_found',
        message: 'No FX evidence found for the supplied acquisition date and currency.',
      },
      changed: false,
    };
  }

  const clone = structuredClone(state);
  const clonedEvent = clone.events.find((candidate) => candidate.id === input.eventId);
  const clonedFxEvidence = clone.evidence.find((candidate) => candidate.id === fxEvidence.id);
  if (!clonedEvent || !clonedFxEvidence) {
    return {
      ok: false,
      error: { code: 'not_found', message: `Unknown event id: ${input.eventId}` },
      changed: false,
    };
  }

  const unitPriceMinor = Math.round(input.unitPrice * 100);

  clonedEvent.acquisition = {
    date: input.acquisitionDate,
    unitPriceMinor,
    currency: input.currency,
    provenance: 'user-attested',
  };

  if (!clonedEvent.linkedEvidenceIds.includes(clonedFxEvidence.id)) {
    clonedEvent.linkedEvidenceIds = [...clonedEvent.linkedEvidenceIds, clonedFxEvidence.id];
  }
  if (!clonedFxEvidence.linkedEventIds.includes(clonedEvent.id)) {
    clonedFxEvidence.linkedEventIds.push(clonedEvent.id);
  }

  // Only the named event's issues/status are recomputed here -- scoped
  // exactly to `input.eventId`, matching the "mutation: only the named
  // event and activity log" surface for this action. Other events are
  // untouched.
  upsertIssuesForEvents(clone, [input.eventId]);

  const changed = !deepEqual(clone, state);

  if (changed) {
    clone.activity.push(
      buildActivityEntry(
        clone,
        actor,
        'record-acquisition-details',
        `Recorded user-attested acquisition details for ${input.eventId}.`,
        input.eventId,
        now,
      ),
    );
  }

  return {
    ok: true,
    changed,
    value: { state: clone, eventId: input.eventId, fxEvidenceId: fxEvidence.id },
  };
}
