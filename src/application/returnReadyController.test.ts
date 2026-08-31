import { describe, expect, it, vi } from 'vitest';
import { createDemoReturnState } from '../fixtures/demoReturn';
import type { InvestmentEvent, ReturnState } from '../domain/model';
import { createReturnReadyController } from './returnReadyController';

const fixedNow = () => '2026-08-31T00:00:00.000Z';

function getEvent(state: ReturnState, id: string): InvestmentEvent {
  const event = state.events.find((candidate) => candidate.id === id);
  if (!event) throw new Error(`event ${id} missing`);
  return event;
}

// AAPL's disposal date (2023-05-02) is strictly after the fixture's
// 2022-09-15/USD FX row, so this is a valid, FX-backed attestation that
// resolves AAPL's missing-acquisition blocker.
const AAPL_ACQUISITION_INPUT = {
  eventId: 'evt-aapl',
  acquisitionDate: '2022-09-15',
  unitPrice: 150.25,
  currency: 'USD' as const,
};

describe('createReturnReadyController: opening state (R6′)', () => {
  it('opens with the exact facts-only fixture -- no init-time reconcile', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const state = controller.getState();

    expect(state.events.every((event) => event.status === 'unreviewed')).toBe(true);
    expect(state.issues).toEqual([]);
    expect(state.activity).toEqual([]);
    expect(state.reviewPackId).toBeNull();
    expect(state).toEqual(createDemoReturnState());
  });

  it('getReturnReadiness derives blocker/warning counts from facts without mutating or logging', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const before = controller.getState();

    const readiness = controller.getReturnReadiness();

    expect(readiness.investmentsStatus).toBe('action-required');
    expect(readiness.blockerCount).toBe(1);
    expect(readiness.warningCount).toBe(1);
    expect(readiness.canGenerate).toBe(false);

    // Read-only: no mutation, no persisted issues, no activity logged.
    expect(controller.getState()).toBe(before);
    expect(controller.getState().activity).toEqual([]);
    expect(controller.getState().issues).toEqual([]);
  });

  it('investmentsStatus rolls to "warning" once the blocker is resolved but a warning remains', () => {
    const controller = createReturnReadyController({ now: fixedNow });

    // Resolves AAPL's missing-acquisition blocker; BTC's missing-crypto-fee
    // warning is untouched (no wrapped domain action can set a disposal
    // fee), so the fresh per-event rollup should land on 'warning', not
    // 'evidence-complete-for-review' or 'action-required'.
    const result = controller.recordAcquisitionDetails(AAPL_ACQUISITION_INPUT, 'human');
    expect(result.ok).toBe(true);

    const readiness = controller.getReturnReadiness();
    expect(readiness.blockerCount).toBe(0);
    expect(readiness.warningCount).toBe(1);
    expect(readiness.canGenerate).toBe(true);
    expect(readiness.investmentsStatus).toBe('warning');
  });
});

describe('createReturnReadyController: reads never mutate or notify', () => {
  it('getState, getReturnReadiness, and listInvestmentEvidence never notify subscribers', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.getState();
    controller.getReturnReadiness();
    controller.listInvestmentEvidence();
    controller.listInvestmentEvidence('warning');

    expect(listener).not.toHaveBeenCalled();
  });

  it('listInvestmentEvidence with no filter returns every evidence record, allow-listed', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const all = controller.listInvestmentEvidence();

    const ids = all.map((item) => item.id).sort();
    expect(ids).toEqual([
      'ev-broker',
      'ev-crypto',
      'ev-deductions',
      'ev-fx',
      'ev-managed-fund',
      'ev-payg',
    ]);
    for (const item of all) {
      expect(item).not.toHaveProperty('rawText');
    }
  });

  it('listInvestmentEvidence filters by linked event status', () => {
    const controller = createReturnReadyController({ now: fixedNow });

    expect(controller.listInvestmentEvidence('evidence-complete-for-review')).toEqual([]);

    controller.reconcileInvestmentEvidence(['evt-msft'], 'human');

    const filtered = controller.listInvestmentEvidence('evidence-complete-for-review');
    const filteredIds = filtered.map((item) => item.id).sort();
    expect(filteredIds).toEqual(['ev-broker', 'ev-fx']);
  });
});

describe('createReturnReadyController: reconcileInvestmentEvidence', () => {
  it('first effective reconcile persists status and logs exactly one activity entry, and notifies', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const listener = vi.fn();
    controller.subscribe(listener);

    const result = controller.reconcileInvestmentEvidence(['evt-msft'], 'human');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(true);
    expect(result.value.reconciledEventIds).toEqual(['evt-msft']);
    expect(listener).toHaveBeenCalledTimes(1);

    const state = controller.getState();
    expect(getEvent(state, 'evt-msft').status).toBe('evidence-complete-for-review');
    expect(state.activity).toHaveLength(1);
    expect(state.activity[0].action).toBe('reconcile-investment-evidence');
  });

  it('exact repeat is idempotent: changed:false, no new activity, no notify', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    controller.reconcileInvestmentEvidence(['evt-msft'], 'human');

    const listener = vi.fn();
    controller.subscribe(listener);
    const result = controller.reconcileInvestmentEvidence(['evt-msft'], 'human');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(controller.getState().activity).toHaveLength(1);
  });

  it('rejects unknown event ids without mutating state', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const before = controller.getState();

    const result = controller.reconcileInvestmentEvidence(['evt-does-not-exist'], 'human');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('not_found');
    expect(controller.getState()).toBe(before);
  });
});

describe('createReturnReadyController: subscribe/unsubscribe', () => {
  it('stops notifying once the returned unsubscribe function is called', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.reconcileInvestmentEvidence(['evt-msft'], 'human');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    controller.reconcileInvestmentEvidence(['evt-btc'], 'human');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('createReturnReadyController: recordAcquisitionDetails', () => {
  it('resolves the AAPL blocker and logs one activity entry', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const listener = vi.fn();
    controller.subscribe(listener);

    const result = controller.recordAcquisitionDetails(AAPL_ACQUISITION_INPUT, 'human');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(true);
    expect(result.value.eventId).toBe('evt-aapl');
    expect(listener).toHaveBeenCalledTimes(1);

    expect(controller.getState().activity).toHaveLength(1);
    expect(controller.getReturnReadiness().blockerCount).toBe(0);
  });

  it('exact repeat is idempotent: changed:false, no new activity, no notify', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    controller.recordAcquisitionDetails(AAPL_ACQUISITION_INPUT, 'human');

    const listener = vi.fn();
    controller.subscribe(listener);
    const result = controller.recordAcquisitionDetails(AAPL_ACQUISITION_INPUT, 'human');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(controller.getState().activity).toHaveLength(1);
  });

  it('rejects an acquisition date on or after the disposal date without mutating state', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const before = controller.getState();
    const listener = vi.fn();
    controller.subscribe(listener);

    const result = controller.recordAcquisitionDetails(
      { ...AAPL_ACQUISITION_INPUT, acquisitionDate: '2023-05-02' },
      'human',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
    expect(controller.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('createReturnReadyController: validateReviewPack (R5)', () => {
  it('wraps the domain validation and opens the validation modal', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    expect(controller.isValidationModalOpen()).toBe(false);

    const listener = vi.fn();
    controller.subscribe(listener);
    const result = controller.validateReviewPack('human');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.canGenerate).toBe(false);
    expect(result.value.issues).toHaveLength(2);
    expect(controller.isValidationModalOpen()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not notify again when the modal is already open', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    controller.validateReviewPack('human');

    const listener = vi.fn();
    controller.subscribe(listener);
    controller.validateReviewPack('human');

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('createReturnReadyController: generateReviewPack', () => {
  it('blocked generation returns the domain error and opens the validation modal', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const listener = vi.fn();
    controller.subscribe(listener);

    const result = controller.generateReviewPack('human');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('blocked');
    expect(controller.isValidationModalOpen()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(controller.getState().activity).toEqual([]);
  });

  it('generates the pack once blockers are resolved, persists it, and logs one activity entry', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    controller.recordAcquisitionDetails(AAPL_ACQUISITION_INPUT, 'human');

    const listener = vi.fn();
    controller.subscribe(listener);
    const result = controller.generateReviewPack('human');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(true);
    expect(result.value.pack.id).toBeTruthy();
    expect(listener).toHaveBeenCalledTimes(1);

    const state = controller.getState();
    expect(state.reviewPackId).toBe(result.value.pack.id);
    expect(state.activity.filter((entry) => entry.action === 'generate-review-pack')).toHaveLength(1);
  });

  it('exact repeat is idempotent: changed:false, no new activity, no notify', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    controller.recordAcquisitionDetails(AAPL_ACQUISITION_INPUT, 'human');
    controller.generateReviewPack('human');

    const listener = vi.fn();
    controller.subscribe(listener);
    const result = controller.generateReviewPack('human');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(
      controller.getState().activity.filter((entry) => entry.action === 'generate-review-pack'),
    ).toHaveLength(1);
  });
});

describe('createReturnReadyController: closeValidationModal (R7)', () => {
  it('closes an open modal and notifies exactly once', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    controller.validateReviewPack('human');
    expect(controller.isValidationModalOpen()).toBe(true);

    const listener = vi.fn();
    controller.subscribe(listener);
    controller.closeValidationModal();

    expect(controller.isValidationModalOpen()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('is a no-op, with no notify, when the modal is already closed', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    expect(controller.isValidationModalOpen()).toBe(false);

    const listener = vi.fn();
    controller.subscribe(listener);
    controller.closeValidationModal();

    expect(controller.isValidationModalOpen()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('reset still clears an open modal', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    controller.validateReviewPack('human');
    expect(controller.isValidationModalOpen()).toBe(true);

    controller.reset();

    expect(controller.isValidationModalOpen()).toBe(false);
  });
});

describe('createReturnReadyController: reset', () => {
  it('recreates the exact opening fixture and clears pack, activity, and modal state', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    controller.recordAcquisitionDetails(AAPL_ACQUISITION_INPUT, 'human');
    controller.reconcileInvestmentEvidence(['evt-msft', 'evt-aapl', 'evt-btc'], 'agent');
    controller.generateReviewPack('human');
    expect(controller.isValidationModalOpen()).toBe(false);
    controller.validateReviewPack('human');
    expect(controller.isValidationModalOpen()).toBe(true);

    const listener = vi.fn();
    controller.subscribe(listener);
    controller.reset();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(controller.isValidationModalOpen()).toBe(false);
    expect(controller.getState()).toEqual(createDemoReturnState());
  });
});

describe('createReturnReadyController: actor parity', () => {
  it('manual (human) and agent callers use the same methods and are recorded on the activity entry', () => {
    const controller = createReturnReadyController({ now: fixedNow });

    const humanResult = controller.reconcileInvestmentEvidence(['evt-msft'], 'human');
    const agentResult = controller.reconcileInvestmentEvidence(['evt-btc'], 'agent');

    expect(humanResult.ok).toBe(true);
    expect(agentResult.ok).toBe(true);

    const activity = controller.getState().activity;
    expect(activity).toHaveLength(2);
    expect(activity[0].actor).toBe('human');
    expect(activity[1].actor).toBe('agent');
  });
});

describe('createReturnReadyController: now injection', () => {
  it('threads options.now into activity timestamps', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    controller.reconcileInvestmentEvidence(['evt-msft'], 'human');

    expect(controller.getState().activity[0].timestamp).toBe(fixedNow());
  });

  it('defaults to a real clock when now is not supplied', () => {
    const before = Date.now();
    const controller = createReturnReadyController();
    controller.reconcileInvestmentEvidence(['evt-msft'], 'human');
    const after = Date.now();

    const timestamp = new Date(controller.getState().activity[0].timestamp).getTime();
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });
});
