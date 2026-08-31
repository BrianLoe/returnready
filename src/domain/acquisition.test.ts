import { describe, expect, it } from 'vitest';
import { createDemoReturnState } from '../fixtures/demoReturn';
import type { Actor, Currency, ReturnState } from './model';
import { reconcileEvents } from './reconcile';
import { recordAcquisitionDetails } from './acquisition';

const actor: Actor = 'human';
const fixedNow = () => '2026-08-31T00:00:00.000Z';

const validInput = {
  eventId: 'evt-aapl',
  acquisitionDate: '2022-09-15',
  unitPrice: 150,
  currency: 'USD' as Currency,
};

function getEvent(state: ReturnState, id: string) {
  const event = state.events.find((candidate) => candidate.id === id);
  if (!event) throw new Error(`event ${id} missing`);
  return event;
}

describe('recordAcquisitionDetails', () => {
  it('rejects an unknown event id without mutating state', () => {
    const state = createDemoReturnState();
    const snapshot = structuredClone(state);

    const result = recordAcquisitionDetails(
      state,
      { ...validInput, eventId: 'evt-does-not-exist' },
      actor,
      fixedNow,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('not_found');
    expect(result.changed).toBe(false);
    expect(state).toEqual(snapshot);
  });

  it('rejects an unsupported currency without mutating state', () => {
    const state = createDemoReturnState();
    const snapshot = structuredClone(state);

    // `as Currency` simulates an unvalidated WebMCP caller supplying a
    // runtime value the type system would otherwise forbid.
    const result = recordAcquisitionDetails(
      state,
      { ...validInput, currency: 'EUR' as Currency },
      actor,
      fixedNow,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
    expect(result.changed).toBe(false);
    expect(state).toEqual(snapshot);
  });

  it('rejects a zero unit price without mutating state', () => {
    const state = createDemoReturnState();
    const snapshot = structuredClone(state);

    const result = recordAcquisitionDetails(state, { ...validInput, unitPrice: 0 }, actor, fixedNow);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
    expect(state).toEqual(snapshot);
  });

  it('rejects a negative unit price without mutating state', () => {
    const state = createDemoReturnState();
    const snapshot = structuredClone(state);

    const result = recordAcquisitionDetails(state, { ...validInput, unitPrice: -5 }, actor, fixedNow);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
    expect(state).toEqual(snapshot);
  });

  it('rejects a non-finite unit price without mutating state', () => {
    const state = createDemoReturnState();
    const snapshot = structuredClone(state);

    const result = recordAcquisitionDetails(
      state,
      { ...validInput, unitPrice: Number.NaN },
      actor,
      fixedNow,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
    expect(state).toEqual(snapshot);
  });

  it('rejects a malformed acquisition date without mutating state', () => {
    const state = createDemoReturnState();
    const snapshot = structuredClone(state);

    const result = recordAcquisitionDetails(
      state,
      { ...validInput, acquisitionDate: '2022-13-40' },
      actor,
      fixedNow,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
    expect(state).toEqual(snapshot);
  });

  it('rejects an acquisition date on or after the disposal date without mutating state', () => {
    const state = createDemoReturnState();
    const snapshot = structuredClone(state);

    // evt-aapl disposal date is 2023-05-02; on-the-date must also be rejected.
    const result = recordAcquisitionDetails(
      state,
      { ...validInput, acquisitionDate: '2023-05-02' },
      actor,
      fixedNow,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
    expect(state).toEqual(snapshot);

    const afterResult = recordAcquisitionDetails(
      state,
      { ...validInput, acquisitionDate: '2023-06-01' },
      actor,
      fixedNow,
    );
    expect(afterResult.ok).toBe(false);
    if (afterResult.ok) return;
    expect(afterResult.error.code).toBe('invalid_input');
    expect(state).toEqual(snapshot);
  });

  it('records a valid attestation, converts major to minor units, links FX evidence, and clears the blocker', () => {
    const state = createDemoReturnState();
    const reconciled = reconcileEvents(state, ['evt-aapl'], actor, fixedNow);
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) return;
    expect(reconciled.value.state.blockerCount).toBe(1);

    const result = recordAcquisitionDetails(reconciled.value.state, validInput, actor, fixedNow);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.changed).toBe(true);
    expect(result.value.eventId).toBe('evt-aapl');
    expect(result.value.fxEvidenceId).toBe('ev-fx');

    const aapl = getEvent(result.value.state, 'evt-aapl');
    expect(aapl.acquisition).toEqual({
      date: '2022-09-15',
      unitPriceMinor: 15_000,
      currency: 'USD',
      provenance: 'user-attested',
    });
    expect(aapl.linkedEvidenceIds).toContain('ev-fx');

    const fxEvidence = result.value.state.evidence.find((item) => item.id === 'ev-fx');
    expect(fxEvidence?.linkedEventIds).toContain('evt-aapl');

    // The blocker clears: state.issues and blockerCount are updated for the
    // named event, and independently, a fresh validation pass agrees.
    expect(result.value.state.issues.some((issue) => issue.eventId === 'evt-aapl')).toBe(false);
    expect(result.value.state.blockerCount).toBe(0);

    // One activity entry for reconcile, one for the attestation.
    expect(result.value.state.activity).toHaveLength(2);
    expect(result.value.state.activity[1].actor).toBe(actor);
  });

  it('an exact repeat attestation is idempotent: changed is false and no new activity is added', () => {
    const state = createDemoReturnState();
    const first = recordAcquisitionDetails(state, validInput, actor, fixedNow);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.changed).toBe(true);
    const activityCountAfterFirst = first.value.state.activity.length;

    const second = recordAcquisitionDetails(first.value.state, validInput, actor, fixedNow);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.changed).toBe(false);
    expect(second.value.state.activity).toHaveLength(activityCountAfterFirst);
    expect(second.value.state).toEqual(first.value.state);
  });
});
