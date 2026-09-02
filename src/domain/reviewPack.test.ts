import { describe, expect, it } from 'vitest';
import { createDemoReturnState } from '../fixtures/demoReturn';
import { recordAcquisitionDetails } from './acquisition';
import { recordDeductions } from './recordDeductions';
import { recordDisposals } from './recordDisposals';
import { generateReviewPack } from './reviewPack';

const now = () => '2026-06-30T00:00:00.000Z';

function populated() {
  const deductions = recordDeductions(createDemoReturnState(), [{ sourceRecordId: 'wfh-01', category: 'work-from-home', description: 'WFH hours', periodStart: '2025-07-01', periodEnd: '2026-06-30', quantity: 40, unit: 'hours', currency: 'AUD', sourceLabel: 'wfh.csv' }], 'agent', now);
  if (!deductions.ok) throw new Error('setup failed');
  const disposals = recordDisposals(deductions.value.state, [{ sourceRecordId: 'aapl-01', assetType: 'foreign-share', symbol: 'AAPL', quantity: 30, disposalDate: '2026-05-02', proceedsMinor: 525000, currency: 'USD', sourceLabel: 'broker.csv' }, { sourceRecordId: 'btc-01', assetType: 'crypto', symbol: 'BTC', quantity: 0.5, acquisitionDate: '2024-01-01', acquisitionUnitPriceMinor: 6000000, acquisitionCurrency: 'AUD', disposalDate: '2026-06-20', proceedsMinor: 8000000, currency: 'AUD', sourceLabel: 'crypto.csv' }], 'agent', now);
  if (!disposals.ok) throw new Error('setup failed');
  return disposals.value.state;
}

describe('generateReviewPack for sparse drafts', () => {
  it('blocks on missing acquisition, then stores a warning-preserving evidence pack', () => {
    const state = populated();
    expect(generateReviewPack(state, 'agent', now)).toMatchObject({ ok: false, error: { code: 'blocked' } });
    const acquisition = recordAcquisitionDetails(state, { eventId: 'disposal-aapl-01', acquisitionDate: '2025-09-15', unitPrice: 150, currency: 'USD' }, 'human', now);
    if (!acquisition.ok) throw new Error('setup failed');
    const result = generateReviewPack(acquisition.value.state, 'agent', now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pack.deductionEvidence[0]).toMatchObject({ sourceRecordId: 'wfh-01', quantity: 40, provenance: 'documentary' });
    expect(result.value.pack.disposalReviewTable.find((entry) => entry.symbol === 'AAPL')).toMatchObject({ acquisitionProvenance: 'user-attested' });
    expect(result.value.pack.unresolvedWarnings.map((issue) => issue.code).sort()).toEqual(['deduction-amount-not-calculated', 'missing-crypto-fee']);
    expect(JSON.stringify(result.value.pack)).not.toMatch(/gainMinor|taxLiability|refundMinor/);
  });

  it('returns the stored pack without timestamp or activity drift on repeat', () => {
    const state = populated();
    const acquisition = recordAcquisitionDetails(state, { eventId: 'disposal-aapl-01', acquisitionDate: '2025-09-15', unitPrice: 150, currency: 'USD' }, 'human', now);
    if (!acquisition.ok) throw new Error('setup failed');
    const first = generateReviewPack(acquisition.value.state, 'agent', now);
    if (!first.ok) throw new Error('generation failed');
    const second = generateReviewPack(first.value.state, 'agent', () => '2099-01-01T00:00:00.000Z');
    expect(second).toMatchObject({ ok: true, changed: false });
    if (!second.ok) return;
    expect(second.value.pack).toEqual(first.value.pack);
  });
});
