import { describe, expect, it } from 'vitest';
import { createDemoReturnState } from '../fixtures/demoReturn';
import { recordDisposals } from './recordDisposals';
import { recordAcquisitionDetails } from './acquisition';

const now = () => '2026-06-30T00:00:00.000Z';

function missingDisposal() {
  const result = recordDisposals(createDemoReturnState(), [{ sourceRecordId: 'aapl-01', assetType: 'foreign-share', symbol: 'AAPL', quantity: 30, disposalDate: '2026-05-02', proceedsMinor: 525000, currency: 'USD', sourceLabel: 'broker.csv' }], 'agent', now);
  if (!result.ok) throw new Error('setup failed');
  return result.value.state;
}

describe('recordAcquisitionDetails for draft disposals', () => {
  it('records historical details as a user attestation and clears the blocker', () => {
    const result = recordAcquisitionDetails(missingDisposal(), { eventId: 'disposal-aapl-01', acquisitionDate: '2022-09-15', unitPrice: 150, currency: 'USD' }, 'human', now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.disposals[0].acquisition).toEqual({ date: '2022-09-15', unitPriceMinor: 15000, currency: 'USD', provenance: 'user-attested' });
    expect(result.value.state.issues.some((issue) => issue.code === 'missing-acquisition')).toBe(false);
  });

  it('rejects invalid dates, prices, unknown IDs, and documentary overwrite without mutation', () => {
    const state = missingDisposal();
    for (const input of [
      { eventId: 'missing', acquisitionDate: '2022-09-15', unitPrice: 150, currency: 'USD' as const },
      { eventId: 'disposal-aapl-01', acquisitionDate: '2026-05-02', unitPrice: 150, currency: 'USD' as const },
      { eventId: 'disposal-aapl-01', acquisitionDate: '2022-09-15', unitPrice: 0, currency: 'USD' as const },
    ]) {
      const before = structuredClone(state);
      expect(recordAcquisitionDetails(state, input, 'human', now).ok).toBe(false);
      expect(state).toEqual(before);
    }

    const complete = recordDisposals(createDemoReturnState(), [{ sourceRecordId: 'msft-01', assetType: 'foreign-share', symbol: 'MSFT', quantity: 1, acquisitionDate: '2024-01-01', acquisitionUnitPriceMinor: 10000, acquisitionCurrency: 'USD', disposalDate: '2026-04-18', proceedsMinor: 20000, currency: 'USD', sourceLabel: 'broker.csv' }], 'agent', now);
    if (!complete.ok) throw new Error('setup failed');
    expect(recordAcquisitionDetails(complete.value.state, { eventId: 'disposal-msft-01', acquisitionDate: '2023-01-01', unitPrice: 50, currency: 'USD' }, 'human', now)).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
  });
});
