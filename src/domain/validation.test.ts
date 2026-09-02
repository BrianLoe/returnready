import { describe, expect, it } from 'vitest';
import { createDemoReturnState } from '../fixtures/demoReturn';
import { recordDeductions } from './recordDeductions';
import { recordDisposals } from './recordDisposals';
import { validateDraftReviewPack } from './validation';

const now = () => '2026-06-30T00:00:00.000Z';

describe('validateDraftReviewPack', () => {
  it('accepts a calculated fixed-rate deduction while deriving disposal issues from current facts', () => {
    const deductions = recordDeductions(createDemoReturnState(), [{ sourceRecordId: 'wfh-01', category: 'work-from-home', description: 'WFH', periodStart: '2025-07-01', periodEnd: '2026-06-30', quantity: 40, unit: 'hours', calculationMethod: 'fixed-rate', currency: 'AUD', sourceLabel: 'wfh.csv' }], 'agent', now);
    if (!deductions.ok) throw new Error('setup failed');
    const disposals = recordDisposals(deductions.value.state, [{ sourceRecordId: 'aapl-01', assetType: 'foreign-share', symbol: 'AAPL', quantity: 1, disposalDate: '2026-05-02', proceedsMinor: 100, currency: 'USD', sourceLabel: 'broker.csv' }, { sourceRecordId: 'btc-01', assetType: 'crypto', symbol: 'BTC', quantity: 1, acquisitionDate: '2024-01-01', acquisitionUnitPriceMinor: 100, acquisitionCurrency: 'AUD', disposalDate: '2026-06-20', proceedsMinor: 200, currency: 'AUD', sourceLabel: 'crypto.csv' }], 'agent', now);
    if (!disposals.ok) throw new Error('setup failed');
    const result = validateDraftReviewPack(disposals.value.state);
    expect(result.canGenerate).toBe(false);
    expect(result.issues.map((issue) => issue.code).sort()).toEqual(['missing-acquisition', 'missing-crypto-fee']);
  });
});
