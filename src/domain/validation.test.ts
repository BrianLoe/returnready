import { describe, expect, it } from 'vitest';
import { createDemoReturnState } from '../fixtures/demoReturn';
import type { Currency } from './model';
import { recordAcquisitionDetails } from './acquisition';
import { validateReviewPack } from './validation';
import { validateDraftReviewPack } from './validation';
import { recordDeductions } from './recordDeductions';
import { recordDisposals } from './recordDisposals';

describe('validateReviewPack', () => {
  it('validates the populated draft from deduction and disposal facts', () => {
    const deduction = recordDeductions(createDemoReturnState(), [{
      sourceRecordId: 'wfh-summary-01', category: 'work-from-home',
      description: 'WFH hours', periodStart: '2025-07-08', periodEnd: '2026-05-19',
      quantity: 40, unit: 'hours', currency: 'AUD', sourceLabel: 'wfh-hours-fy2025-26.csv',
    }], 'agent', () => '2026-06-30T00:00:00.000Z');
    expect(deduction.ok).toBe(true);
    if (!deduction.ok) return;
    const disposals = recordDisposals(deduction.value.state, [{
      sourceRecordId: 'broker-aapl-01', assetType: 'foreign-share', symbol: 'AAPL', quantity: 30,
      disposalDate: '2026-05-02', proceedsMinor: 525_000, currency: 'USD',
      sourceLabel: 'foreign-broker-fy2025-26.csv',
    }], 'agent', () => '2026-06-30T00:00:00.000Z');
    expect(disposals.ok).toBe(true);
    if (!disposals.ok) return;

    const validation = validateDraftReviewPack(disposals.value.state);
    expect(validation.canGenerate).toBe(false);
    expect(validation.issues.map((issue) => issue.code).sort()).toEqual([
      'deduction-amount-not-calculated',
      'missing-acquisition',
    ]);
  });

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
