import { describe, expect, it } from 'vitest';
import { createDemoReturnState } from '../fixtures/demoReturn';
import type { Currency } from './model';
import { recordAcquisitionDetails } from './acquisition';
import { validateReviewPack } from './validation';

describe('validateReviewPack', () => {
  it('derives the AAPL blocker and BTC warning directly from facts, even without a prior reconcile call', () => {
    const state = createDemoReturnState();
    const { issues, canGenerate } = validateReviewPack(state);

    expect(canGenerate).toBe(false);
    expect(issues).toHaveLength(2);
    expect(issues.some((i) => i.eventId === 'evt-aapl' && i.code === 'missing-acquisition')).toBe(true);
    expect(issues.some((i) => i.eventId === 'evt-btc' && i.code === 'missing-crypto-fee')).toBe(true);
  });

  it('does not mutate the state it validates', () => {
    const state = createDemoReturnState();
    const snapshot = structuredClone(state);

    validateReviewPack(state);

    expect(state).toEqual(snapshot);
  });

  it('is deterministic: repeated calls on unchanged state return equal issues', () => {
    const state = createDemoReturnState();
    const first = validateReviewPack(state);
    const second = validateReviewPack(state);

    expect(second).toEqual(first);
  });

  it('clears once the acquisition blocker is resolved, leaving only the warning and allowing generation', () => {
    const state = createDemoReturnState();
    const attested = recordAcquisitionDetails(
      state,
      { eventId: 'evt-aapl', acquisitionDate: '2022-09-15', unitPrice: 150, currency: 'USD' as Currency },
      'human',
      () => '2026-08-31T00:00:00.000Z',
    );
    expect(attested.ok).toBe(true);
    if (!attested.ok) return;

    const { issues, canGenerate } = validateReviewPack(attested.value.state);

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('missing-crypto-fee');
    expect(canGenerate).toBe(true);
  });
});
