import { describe, expect, it } from 'vitest';
import { createDemoReturnState } from '../fixtures/demoReturn';
import type { DisposalInput } from './model';
import { recordDisposals } from './recordDisposals';

const now = () => '2026-06-30T00:00:00.000Z';
const msft: DisposalInput = {
  sourceRecordId: 'broker-msft-01',
  assetType: 'foreign-share',
  symbol: 'MSFT',
  quantity: 50,
  acquisitionDate: '2021-03-10',
  acquisitionUnitPriceMinor: 21_500,
  acquisitionCurrency: 'USD',
  disposalDate: '2026-04-18',
  proceedsMinor: 1_400_000,
  currency: 'USD',
  brokerageMinor: 2_500,
  sourceLabel: 'foreign-broker-fy2025-26.csv',
};
const aapl: DisposalInput = {
  sourceRecordId: 'broker-aapl-01',
  assetType: 'foreign-share',
  symbol: 'AAPL',
  quantity: 30,
  disposalDate: '2026-05-02',
  proceedsMinor: 525_000,
  currency: 'USD',
  brokerageMinor: 1_500,
  sourceLabel: 'foreign-broker-fy2025-26.csv',
};
const btc: DisposalInput = {
  sourceRecordId: 'crypto-btc-01',
  assetType: 'crypto',
  symbol: 'BTC',
  quantity: 0.5,
  acquisitionDate: '2021-11-01',
  acquisitionUnitPriceMinor: 6_000_000,
  acquisitionCurrency: 'USD',
  disposalDate: '2026-06-20',
  proceedsMinor: 1_500_000,
  currency: 'USD',
  sourceLabel: 'crypto-transactions-fy2025-26.csv',
};

describe('recordDisposals', () => {
  it('records mixed documentary disposals and derives facts-based blocker and warning', () => {
    const state = createDemoReturnState();
    const result = recordDisposals(state, [msft, aapl, btc], 'agent', now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.state.disposals).toHaveLength(3);
    expect(result.value.state.disposals.find((entry) => entry.symbol === 'AAPL')?.acquisition).toEqual({
      provenance: 'missing',
    });
    expect(result.value.state.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing-acquisition', severity: 'blocker' }),
        expect.objectContaining({ code: 'missing-crypto-fee', severity: 'warning' }),
      ]),
    );
    expect(result.value.state.activity).toHaveLength(1);
  });

  it('is idempotent for exact repeats and rejects conflicting source IDs', () => {
    const first = recordDisposals(createDemoReturnState(), [msft], 'human', now);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const repeat = recordDisposals(first.value.state, [msft], 'human', now);
    expect(repeat.ok).toBe(true);
    if (!repeat.ok) return;
    expect(repeat.changed).toBe(false);
    expect(repeat.value.state).toBe(first.value.state);

    const conflict = recordDisposals(first.value.state, [{ ...msft, quantity: 51 }], 'agent', now);
    expect(conflict.ok).toBe(false);
    expect(first.value.state.disposals[0].quantity).toBe(50);
  });

  it.each([
    [{ ...msft, disposalDate: '2025-06-30' }, 'disposalDate'],
    [{ ...msft, disposalDate: '2026-07-01' }, 'disposalDate'],
    [{ ...msft, acquisitionDate: '2026-04-18' }, 'acquisitionDate'],
    [{ ...msft, quantity: -1 }, 'quantity'],
    [{ ...msft, proceedsMinor: 0 }, 'proceedsMinor'],
  ])('rejects invalid input without mutation: %s', (input, messagePart) => {
    const state = createDemoReturnState();
    const result = recordDisposals(state, [input], 'agent', now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain(messagePart);
    expect(state.disposals).toEqual([]);
  });
});
