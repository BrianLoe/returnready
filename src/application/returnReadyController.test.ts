import { describe, expect, it, vi } from 'vitest';
import { createDemoReturnState } from '../fixtures/demoReturn';
import { createReturnReadyController } from './returnReadyController';

const now = () => '2026-06-30T00:00:00.000Z';
const deduction = { sourceRecordId: 'wfh-01', category: 'work-from-home' as const, description: 'WFH hours', periodStart: '2025-07-01', periodEnd: '2026-06-30', quantity: 40, unit: 'hours' as const, currency: 'AUD' as const, sourceLabel: 'wfh.csv' };
const disposal = { sourceRecordId: 'aapl-01', assetType: 'foreign-share' as const, symbol: 'AAPL', quantity: 30, disposalDate: '2026-05-02', proceedsMinor: 525000, currency: 'USD' as const, sourceLabel: 'broker.csv' };

describe('ReturnReadyController sparse draft', () => {
  it('opens empty and reads without mutation or notification', () => {
    const controller = createReturnReadyController({ now });
    const before = controller.getState();
    const listener = vi.fn(); controller.subscribe(listener);
    expect(controller.getReturnDraft()).toMatchObject({ deductionCount: 0, disposalCount: 0, blockerCount: 0, warningCount: 0, canGenerate: true });
    expect(controller.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('records batches, notifies only on changes, and preserves actor provenance', () => {
    const controller = createReturnReadyController({ now });
    const listener = vi.fn(); controller.subscribe(listener);
    expect(controller.recordDeductions([deduction], 'agent').ok).toBe(true);
    expect(controller.recordDisposals([disposal], 'human').ok).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(controller.getState().deductions[0].provenance).toBe('documentary');
    expect(controller.getState().disposals[0].provenance).toBe('user-attested');
    listener.mockClear();
    expect(controller.recordDeductions([deduction], 'agent')).toMatchObject({ ok: true, changed: false });
    expect(listener).not.toHaveBeenCalled();
  });

  it('validates draft blockers, resolves acquisition, generates once, and resets', () => {
    const controller = createReturnReadyController({ now });
    controller.recordDeductions([deduction], 'agent');
    controller.recordDisposals([disposal], 'agent');
    expect(controller.generateReviewPack('agent')).toMatchObject({ ok: false, error: { code: 'blocked' } });
    expect(controller.isValidationModalOpen()).toBe(true);
    controller.closeValidationModal();
    expect(controller.recordAcquisitionDetails({ eventId: 'disposal-aapl-01', acquisitionDate: '2022-09-15', unitPrice: 150, currency: 'USD' }, 'human').ok).toBe(true);
    expect(controller.generateReviewPack('agent')).toMatchObject({ ok: true, changed: true });
    expect(controller.generateReviewPack('agent')).toMatchObject({ ok: true, changed: false });
    controller.reset();
    expect(controller.getState()).toEqual(createDemoReturnState());
    expect(controller.isValidationModalOpen()).toBe(false);
  });

  it('leaves state reference unchanged for invalid input and supports unsubscribe', () => {
    const controller = createReturnReadyController({ now });
    const before = controller.getState();
    expect(controller.recordDisposals([{ ...disposal, quantity: 0 }], 'agent').ok).toBe(false);
    expect(controller.getState()).toBe(before);
    const listener = vi.fn(); const unsubscribe = controller.subscribe(listener); unsubscribe();
    controller.recordDeductions([deduction], 'agent');
    expect(listener).not.toHaveBeenCalled();
  });
});
