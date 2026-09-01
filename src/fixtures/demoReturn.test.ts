import { describe, expect, it } from 'vitest';
import { createDemoReturnState } from './demoReturn';

const EVIDENCE_IDS = ['ev-payg', 'ev-deductions', 'ev-managed-fund', 'ev-broker', 'ev-crypto', 'ev-fx'];
const EVENT_IDS = ['evt-msft', 'evt-aapl', 'evt-btc'];

describe('createDemoReturnState', () => {
  it('produces deeply equal but not referentially equal state on each call', () => {
    const a = createDemoReturnState();
    const b = createDemoReturnState();

    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.evidence).not.toBe(b.evidence);
    expect(a.events).not.toBe(b.events);
  });

  it('does not let mutating one copy affect the next factory call', () => {
    const a = createDemoReturnState();
    a.events[0].status = 'warning';
    a.evidence[0].displayName = 'mutated-by-test';
    a.blockerCount = 999;
    a.activity.push({
      id: 'injected',
      timestamp: '2020-01-01T00:00:00.000Z',
      actor: 'human',
      action: 'test-injected',
      description: 'should not leak',
      recordId: 'evt-msft',
    });

    const b = createDemoReturnState();

    expect(b.events[0].status).not.toBe('warning');
    expect(b.evidence[0].displayName).not.toBe('mutated-by-test');
    expect(b.blockerCount).not.toBe(999);
    expect(b.activity).toHaveLength(0);
  });

  it('exposes exactly the six stable evidence record ids', () => {
    const state = createDemoReturnState();
    expect(state.evidence.map((item) => item.id).sort()).toEqual([...EVIDENCE_IDS].sort());
  });

  it('exposes exactly the three stable investment event ids', () => {
    const state = createDemoReturnState();
    expect(state.events.map((event) => event.id).sort()).toEqual([...EVENT_IDS].sort());
  });

  it('marks every evidence and event record synthetic', () => {
    const state = createDemoReturnState();
    for (const item of state.evidence) {
      expect(item.synthetic).toBe(true);
    }
    for (const event of state.events) {
      expect(event.synthetic).toBe(true);
    }
  });

  it('opens with zero derived blockers/warnings and unreviewed events (facts imply the outcome, not the fixture)', () => {
    const state = createDemoReturnState();
    expect(state.blockerCount).toBe(0);
    expect(state.warningCount).toBe(0);
    expect(state.issues).toHaveLength(0);
    expect(state.activity).toHaveLength(0);
    for (const event of state.events) {
      expect(event.status).toBe('unreviewed');
      expect(event.issueIds).toHaveLength(0);
    }
  });

  it('contains an FX rate row matching the demo attestation date and currency (2022-09-15, USD)', () => {
    const state = createDemoReturnState();
    const fx = state.evidence.find((item) => item.id === 'ev-fx');
    expect(fx).toBeDefined();
    if (!fx || fx.facts.kind !== 'fx-rates') {
      throw new Error('ev-fx fixture missing fx-rates facts');
    }
    const match = fx.facts.rates.find((rate) => rate.date === '2022-09-15' && rate.currency === 'USD');
    expect(match).toBeDefined();
  });

  it('has a matching FX row for every event date currently in use, plus exactly one orphan row (the future AAPL attestation date)', () => {
    const state = createDemoReturnState();
    const fx = state.evidence.find((item) => item.id === 'ev-fx');
    if (!fx || fx.facts.kind !== 'fx-rates') {
      throw new Error('ev-fx fixture missing fx-rates facts');
    }
    const rates = fx.facts.rates;

    const datesInUse = new Set<string>();
    for (const event of state.events) {
      if (event.acquisition.date !== undefined) {
        datesInUse.add(`${event.acquisition.date}|${event.acquisition.currency}`);
      }
      datesInUse.add(`${event.disposal.date}|${event.disposal.currency}`);
    }

    for (const key of datesInUse) {
      const [date, currency] = key.split('|');
      expect(rates.some((rate) => rate.date === date && rate.currency === currency)).toBe(true);
    }

    const orphanRows = rates.filter((rate) => !datesInUse.has(`${rate.date}|${rate.currency}`));
    expect(orphanRows).toEqual([{ date: '2022-09-15', currency: 'USD', rateToAud: 1.4834 }]);
  });

  it('MSFT event is complete: acquisition and disposal facts, currency, and no-corporate-action assertion are all present', () => {
    const state = createDemoReturnState();
    const msft = state.events.find((event) => event.id === 'evt-msft');
    expect(msft).toBeDefined();
    if (!msft) throw new Error('evt-msft missing');

    expect(msft.acquisition.date).toBeDefined();
    expect(msft.acquisition.unitPriceMinor).toBeDefined();
    expect(msft.acquisition.provenance).toBe('documentary');
    expect(msft.disposal.date).toBe('2026-04-18');
    expect(msft.disposal.proceedsMinor).toBeGreaterThan(0);
    expect(msft.disposal.brokerageMinor).toBeGreaterThan(0);
    expect(msft.disposal.corporateAction).toBe('none-asserted');
  });

  it('AAPL event is missing only acquisition date and USD unit cost; every other review input is present', () => {
    const state = createDemoReturnState();
    const aapl = state.events.find((event) => event.id === 'evt-aapl');
    expect(aapl).toBeDefined();
    if (!aapl) throw new Error('evt-aapl missing');

    expect(aapl.acquisition.date).toBeUndefined();
    expect(aapl.acquisition.unitPriceMinor).toBeUndefined();
    expect(aapl.acquisition.provenance).toBe('missing');
    expect(aapl.acquisition.currency).toBe('USD');

    expect(aapl.quantity).toBeGreaterThan(0);
    expect(aapl.disposal.date).toBe('2026-05-02');
    expect(aapl.disposal.proceedsMinor).toBeGreaterThan(0);
    expect(aapl.disposal.brokerageMinor).toBeGreaterThan(0);
    expect(aapl.disposal.corporateAction).toBe('none-asserted');

    // disposal date must be strictly after the acquisition date the user will later attest
    expect(new Date(aapl.disposal.date) > new Date('2022-09-15')).toBe(true);
  });

  it('BTC event has complete acquisition/disposal/FX facts but is missing only the fee (a warning, never a blocker)', () => {
    const state = createDemoReturnState();
    const btc = state.events.find((event) => event.id === 'evt-btc');
    expect(btc).toBeDefined();
    if (!btc) throw new Error('evt-btc missing');

    expect(btc.acquisition.date).toBeDefined();
    expect(btc.acquisition.unitPriceMinor).toBeDefined();
    expect(btc.acquisition.provenance).toBe('documentary');
    expect(btc.disposal.date).toBe('2026-06-20');
    expect(btc.disposal.proceedsMinor).toBeGreaterThan(0);
    expect(btc.disposal.feeMinor).toBeUndefined();
  });

  it('every monetary amount is positive and every currency is AUD or USD', () => {
    const state = createDemoReturnState();
    const currencies = new Set(['AUD', 'USD']);

    for (const event of state.events) {
      expect(currencies.has(event.currency)).toBe(true);
      expect(currencies.has(event.acquisition.currency)).toBe(true);
      expect(currencies.has(event.disposal.currency)).toBe(true);
      if (event.acquisition.unitPriceMinor !== undefined) {
        expect(event.acquisition.unitPriceMinor).toBeGreaterThan(0);
      }
      expect(event.disposal.proceedsMinor).toBeGreaterThan(0);
    }
  });
});
