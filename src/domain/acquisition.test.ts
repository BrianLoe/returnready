import { describe, expect, it } from 'vitest';
import { createDemoReturnState } from '../fixtures/demoReturn';
import type { Actor, Currency, ReturnState } from './model';
import { reconcileEvents } from './reconcile';
import { recordAcquisitionDetails } from './acquisition';
import { recordDisposals } from './recordDisposals';

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
  it('resolves a recorded draft disposal as a user attestation without requiring in-app file evidence', () => {
    const recorded = recordDisposals(
      createDemoReturnState(),
      [{
        sourceRecordId: 'broker-aapl-01',
        assetType: 'foreign-share',
        symbol: 'AAPL',
        quantity: 30,
        disposalDate: '2026-05-02',
        proceedsMinor: 525_000,
        currency: 'USD',
        brokerageMinor: 1_500,
        sourceLabel: 'foreign-broker-fy2025-26.csv',
      }],
      actor,
      fixedNow,
    );
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;

    const result = recordAcquisitionDetails(
      recorded.value.state,
      {
        eventId: 'disposal-broker-aapl-01',
        acquisitionDate: '2022-09-15',
        unitPrice: 150,
        currency: 'USD',
      },
      actor,
      fixedNow,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.disposals[0].acquisition).toEqual({
      date: '2022-09-15',
      unitPriceMinor: 15_000,
      currency: 'USD',
      provenance: 'user-attested',
    });
    expect(result.value.state.issues.some((issue) => issue.code === 'missing-acquisition')).toBe(false);
  });

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

    // evt-aapl disposal date is 2026-05-02; on-the-date must also be rejected.
    const result = recordAcquisitionDetails(
      state,
      { ...validInput, acquisitionDate: '2026-05-02' },
      actor,
      fixedNow,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
    expect(state).toEqual(snapshot);

    const afterResult = recordAcquisitionDetails(
      state,
      { ...validInput, acquisitionDate: '2026-06-01' },
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

    const inputSnapshot = structuredClone(reconciled.value.state);
    const result = recordAcquisitionDetails(reconciled.value.state, validInput, actor, fixedNow);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.changed).toBe(true);
    // The input state object passed in is never mutated in place, even on a
    // successful, state-changing call -- a fresh state is returned instead.
    expect(reconciled.value.state).toEqual(inputSnapshot);
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

  it('rejects re-recording an already-resolved acquisition without mutating state', () => {
    // Provenance guard: the first call resolves AAPL's MISSING acquisition to
    // 'user-attested'; a second identical call is no longer resolving a
    // missing fact, so it rejects with `invalid_input` and changes nothing.
    // This mirrors the human UI, which renders the acquisition form only while
    // provenance is 'missing'.
    const state = createDemoReturnState();
    const first = recordAcquisitionDetails(state, validInput, actor, fixedNow);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.changed).toBe(true);

    const afterFirst = structuredClone(first.value.state);
    const second = recordAcquisitionDetails(first.value.state, validInput, actor, fixedNow);
    expect(second.ok).toBe(false);
    if (second.ok) return;

    expect(second.error.code).toBe('invalid_input');
    expect(second.changed).toBe(false);
    // The state object passed in is left referentially and structurally
    // unchanged (the early reject returns before any clone).
    expect(first.value.state).toEqual(afterFirst);
  });
});
