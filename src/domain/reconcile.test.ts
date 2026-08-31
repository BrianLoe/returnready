import { describe, expect, it } from 'vitest';
import { createDemoReturnState } from '../fixtures/demoReturn';
import type { Actor, InvestmentEvent, ReturnState } from './model';
import { reconcileEvents } from './reconcile';
import { validateReviewPack } from './validation';

const actor: Actor = 'human';
const fixedNow = () => '2026-08-31T00:00:00.000Z';

function getEvent(state: ReturnState, id: string): InvestmentEvent {
  const event = state.events.find((candidate) => candidate.id === id);
  if (!event) throw new Error(`event ${id} missing`);
  return event;
}

describe('reconcileEvents', () => {
  it('MSFT becomes evidence-complete-for-review with no issues once reconciled', () => {
    const state = createDemoReturnState();
    const inputSnapshot = structuredClone(state);
    const result = reconcileEvents(state, ['evt-msft'], actor, fixedNow);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(true);
    expect(result.value.issues).toEqual([]);
    // The input state object is never mutated in place -- reconcileEvents
    // returns a fresh state and leaves the caller's object untouched, even
    // on a successful, state-changing call.
    expect(state).toEqual(inputSnapshot);

    const msft = getEvent(result.value.state, 'evt-msft');
    expect(msft.status).toBe('evidence-complete-for-review');
    expect(msft.issueIds).toEqual([]);
    expect(msft.linkedEvidenceIds).toEqual(expect.arrayContaining(['ev-broker', 'ev-fx']));
    expect(result.value.state.blockerCount).toBe(0);
    expect(result.value.state.warningCount).toBe(0);
  });

  it('AAPL produces a single missing-acquisition blocker', () => {
    const state = createDemoReturnState();
    const result = reconcileEvents(state, ['evt-aapl'], actor, fixedNow);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.issues).toHaveLength(1);
    expect(result.value.issues[0].code).toBe('missing-acquisition');
    expect(result.value.issues[0].severity).toBe('blocker');
    expect(result.value.issues[0].eventId).toBe('evt-aapl');

    const aapl = getEvent(result.value.state, 'evt-aapl');
    expect(aapl.status).toBe('action-required');
    expect(aapl.issueIds).toEqual([result.value.issues[0].id]);
    expect(result.value.state.blockerCount).toBe(1);
    expect(result.value.state.warningCount).toBe(0);
  });

  it('BTC produces a single missing-crypto-fee warning, never a blocker', () => {
    const state = createDemoReturnState();
    const result = reconcileEvents(state, ['evt-btc'], actor, fixedNow);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.issues).toHaveLength(1);
    expect(result.value.issues[0].code).toBe('missing-crypto-fee');
    expect(result.value.issues[0].severity).toBe('warning');
    expect(result.value.issues[0].eventId).toBe('evt-btc');

    const btc = getEvent(result.value.state, 'evt-btc');
    expect(btc.status).toBe('warning');
    expect(result.value.state.blockerCount).toBe(0);
    expect(result.value.state.warningCount).toBe(1);
  });

  it('first successful reconciliation adds exactly one activity entry', () => {
    const state = createDemoReturnState();
    const result = reconcileEvents(state, ['evt-msft', 'evt-aapl', 'evt-btc'], actor, fixedNow);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(true);
    expect(result.value.state.activity).toHaveLength(1);
    expect(result.value.state.activity[0].actor).toBe(actor);
    expect(result.value.state.activity[0].timestamp).toBe(fixedNow());
  });

  it('an exact repeat call is idempotent: changed is false and no new activity is added', () => {
    const state = createDemoReturnState();
    const first = reconcileEvents(state, ['evt-msft', 'evt-aapl', 'evt-btc'], actor, fixedNow);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = reconcileEvents(first.value.state, ['evt-msft', 'evt-aapl', 'evt-btc'], actor, fixedNow);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.changed).toBe(false);
    expect(second.value.state.activity).toHaveLength(1);
    expect(second.value.issues).toEqual(first.value.issues);
    expect(second.value.state).toEqual(first.value.state);
  });

  it('rejects an empty event id list without mutating state', () => {
    const state = createDemoReturnState();
    const snapshot = structuredClone(state);

    const result = reconcileEvents(state, [], actor, fixedNow);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
    expect(result.changed).toBe(false);
    expect(state).toEqual(snapshot);
  });

  it('rejects an unknown event id without mutating state', () => {
    const state = createDemoReturnState();
    const snapshot = structuredClone(state);

    const result = reconcileEvents(state, ['evt-does-not-exist'], actor, fixedNow);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('not_found');
    expect(result.changed).toBe(false);
    expect(state).toEqual(snapshot);
  });

  it('follows supplied facts, not fixture symbols or ids, when ids are renamed and completeness is inverted', () => {
    // Clone the fixture and rewire it so that the event still *labelled*
    // MSFT is now the one missing acquisition facts, and the event still
    // *labelled* AAPL now has complete acquisition facts. If reconciliation
    // ever special-cased a symbol or an id literal ('evt-msft', 'MSFT',
    // 'evt-aapl', 'AAPL') instead of reading the facts, this test would
    // observe the fixture's original outcome instead of the inverted one.
    const state = createDemoReturnState();
    const msft = getEvent(state, 'evt-msft');
    const aapl = getEvent(state, 'evt-aapl');
    const broker = state.evidence.find((item) => item.id === 'ev-broker');
    if (!broker || broker.facts.kind !== 'broker-export') throw new Error('ev-broker missing');

    // Rename the ids (the id is the only thing that ties an event to its
    // broker-disposal row) while keeping the display symbols unchanged.
    msft.id = 'evt-renamed-a';
    aapl.id = 'evt-renamed-b';
    for (const disposal of broker.facts.disposals) {
      if (disposal.eventId === 'evt-msft') disposal.eventId = 'evt-renamed-a';
      if (disposal.eventId === 'evt-aapl') disposal.eventId = 'evt-renamed-b';
    }

    // Strip acquisition provenance from the record still labelled MSFT.
    const { date: _date, unitPriceMinor: _unitPriceMinor, ...restAcquisition } = msft.acquisition;
    msft.acquisition = { ...restAcquisition, provenance: 'missing' };

    // Give the record still labelled AAPL complete, well-formed acquisition
    // facts (using a date/currency pair that is not present in ev-fx --
    // FX-row absence must not, by itself, create a missing-acquisition
    // blocker under this module's rules).
    aapl.acquisition = {
      date: '2020-01-01',
      unitPriceMinor: 1_000,
      currency: 'USD',
      provenance: 'documentary',
    };

    const result = reconcileEvents(state, ['evt-renamed-a', 'evt-renamed-b'], actor, fixedNow);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const renamedMsft = getEvent(result.value.state, 'evt-renamed-a');
    const renamedAapl = getEvent(result.value.state, 'evt-renamed-b');

    expect(renamedMsft.symbol).toBe('MSFT');
    expect(renamedMsft.status).toBe('action-required');
    expect(result.value.issues.some((i) => i.eventId === 'evt-renamed-a' && i.code === 'missing-acquisition')).toBe(
      true,
    );

    expect(renamedAapl.symbol).toBe('AAPL');
    expect(renamedAapl.status).toBe('evidence-complete-for-review');
    expect(result.value.issues.some((i) => i.eventId === 'evt-renamed-b')).toBe(false);

    // Evidence linking also follows the rewired eventId references, not the
    // original fixture ids.
    expect(renamedMsft.linkedEvidenceIds).toContain('ev-broker');
    expect(renamedAapl.linkedEvidenceIds).toContain('ev-broker');

    // validateReviewPack must reach the same fact-driven conclusion
    // independently -- the original-fixture assertions in validation.test.ts
    // cannot distinguish a symbol/id-keyed implementation from a
    // facts-keyed one, because on the original fixture both produce
    // identical output. Only this inverted fixture separates the two.
    const validated = validateReviewPack(result.value.state);
    expect(
      validated.issues.some((i) => i.eventId === 'evt-renamed-a' && i.code === 'missing-acquisition'),
    ).toBe(true);
    expect(validated.issues.some((i) => i.eventId === 'evt-renamed-b')).toBe(false);
  });
});
