import { describe, expect, it } from 'vitest';
import { createDemoReturnState } from '../fixtures/demoReturn';
import type { DeductionInput } from './model';
import { recordDeductions } from './recordDeductions';

const now = () => '2026-06-30T00:00:00.000Z';
const wfh: DeductionInput = {
  sourceRecordId: 'wfh-summary-01',
  category: 'work-from-home',
  description: 'Work-from-home hours from worksheet',
  periodStart: '2025-07-08',
  periodEnd: '2026-05-19',
  quantity: 40,
  unit: 'hours',
  currency: 'AUD',
  sourceLabel: 'wfh-hours-fy2025-26.csv',
};

describe('recordDeductions', () => {
  it('records a documentary batch immutably with one activity entry and a missing-amount warning', () => {
    const state = createDemoReturnState();
    const snapshot = structuredClone(state);
    const result = recordDeductions(state, [wfh], 'agent', now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(state).toEqual(snapshot);
    expect(result.changed).toBe(true);
    expect(result.value.recordedIds).toEqual(['deduction-wfh-summary-01']);
    expect(result.value.state.deductions[0]).toMatchObject({
      ...wfh,
      id: 'deduction-wfh-summary-01',
      provenance: 'documentary',
    });
    expect(result.value.state.activity).toHaveLength(1);
    expect(result.value.state.activity[0]).toMatchObject({ actor: 'agent', action: 'record-deductions' });
    expect(result.value.state.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'deduction-amount-not-calculated', severity: 'warning' }),
      ]),
    );
  });

  it('is idempotent for an exact repeat and rejects conflicting reuse without mutation', () => {
    const first = recordDeductions(createDemoReturnState(), [wfh], 'agent', now);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const repeat = recordDeductions(first.value.state, [wfh], 'agent', now);
    expect(repeat.ok).toBe(true);
    if (!repeat.ok) return;
    expect(repeat.changed).toBe(false);
    expect(repeat.value.state).toBe(first.value.state);
    expect(repeat.value.state.activity).toHaveLength(1);

    const before = repeat.value.state;
    const conflict = recordDeductions(before, [{ ...wfh, quantity: 41 }], 'agent', now);
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    expect(conflict.error.code).toBe('invalid_input');
    expect(before.deductions[0].quantity).toBe(40);
  });

  it.each([
    [{ ...wfh, periodStart: '2025-06-30' }, 'periodStart'],
    [{ ...wfh, periodEnd: '2026-07-01' }, 'periodEnd'],
    [{ ...wfh, quantity: 0 }, 'quantity'],
    [{ ...wfh, sourceLabel: 'x'.repeat(121) }, 'sourceLabel'],
  ])('rejects invalid input without mutation: %s', (input, messagePart) => {
    const state = createDemoReturnState();
    const result = recordDeductions(state, [input], 'human', now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain(messagePart);
    expect(state.deductions).toEqual([]);
    expect(state.activity).toEqual([]);
  });

  it('rejects empty and oversized batches', () => {
    const state = createDemoReturnState();
    expect(recordDeductions(state, [], 'agent', now).ok).toBe(false);
    expect(
      recordDeductions(
        state,
        Array.from({ length: 21 }, (_, index) => ({ ...wfh, sourceRecordId: `wfh-${index}` })),
        'agent',
        now,
      ).ok,
    ).toBe(false);
  });
});
