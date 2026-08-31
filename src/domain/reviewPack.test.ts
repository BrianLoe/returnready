import { describe, expect, it } from 'vitest';
import { createDemoReturnState } from '../fixtures/demoReturn';
import type { Currency } from './model';
import { recordAcquisitionDetails } from './acquisition';
import { generateReviewPack } from './reviewPack';

const actor = 'human' as const;
const fixedNow = () => '2026-08-31T00:00:00.000Z';

function attestAapl(state: ReturnType<typeof createDemoReturnState>) {
  const result = recordAcquisitionDetails(
    state,
    { eventId: 'evt-aapl', acquisitionDate: '2022-09-15', unitPrice: 150, currency: 'USD' as Currency },
    actor,
    fixedNow,
  );
  if (!result.ok) throw new Error('attestation setup failed');
  return result.value.state;
}

describe('generateReviewPack', () => {
  it('is blocked while the AAPL acquisition blocker remains, and leaves state unchanged', () => {
    const state = createDemoReturnState();
    const snapshot = structuredClone(state);

    const result = generateReviewPack(state, actor, fixedNow);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('blocked');
    expect(result.changed).toBe(false);
    expect(state).toEqual(snapshot);
  });

  it('generates a pack once the blocker clears, carrying the surviving BTC warning and required disclosures', () => {
    const state = attestAapl(createDemoReturnState());

    const result = generateReviewPack(state, actor, fixedNow);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(true);
    expect(result.value.pack.id).toBe('review-pack-2025');
    expect(result.value.state.reviewPackId).toBe('review-pack-2025');

    const { pack } = result.value;
    expect(pack.unresolvedWarnings).toHaveLength(1);
    expect(pack.unresolvedWarnings[0].code).toBe('missing-crypto-fee');
    expect(pack.unresolvedWarnings[0].eventId).toBe('evt-btc');

    expect(pack.evidenceIndex.length).toBe(state.evidence.length);
    expect(pack.evidenceIndex.some((e) => e.evidenceId === 'ev-fx')).toBe(true);

    const aaplRow = pack.eventReviewTable.find((row) => row.eventId === 'evt-aapl');
    expect(aaplRow?.acquisitionProvenance).toBe('user-attested');

    expect(pack.assumptionsAndLimitations.length).toBeGreaterThan(0);
    expect(pack.disclaimer).toBe('ReturnReady does not lodge returns or provide tax advice');

    expect(result.value.state.activity.at(-1)?.action).toBe('generate-review-pack');
  });

  it('never computes gain, loss, liability, discount, or refund figures', () => {
    // Checks object KEYS only, not prose: `assumptionsAndLimitations` and
    // `disclaimer` legitimately *mention* these concepts (to disclaim them),
    // but no field on the pack may hold a computed value for one.
    const state = attestAapl(createDemoReturnState());
    const result = generateReviewPack(state, actor, fixedNow);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const forbiddenKeyFragments = ['gain', 'loss', 'liability', 'discount', 'refund'];
    const collectKeys = (value: unknown, keys: string[]): void => {
      if (Array.isArray(value)) {
        for (const item of value) collectKeys(item, keys);
      } else if (value !== null && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value)) {
          keys.push(key.toLowerCase());
          collectKeys(nested, keys);
        }
      }
    };
    const keys: string[] = [];
    collectKeys(result.value.pack, keys);

    for (const fragment of forbiddenKeyFragments) {
      expect(keys.some((key) => key.includes(fragment))).toBe(false);
    }
  });

  it('repeat generation returns the same pack id and adds no duplicate activity', () => {
    const state = attestAapl(createDemoReturnState());
    const first = generateReviewPack(state, actor, fixedNow);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const activityCountAfterFirst = first.value.state.activity.length;

    const second = generateReviewPack(first.value.state, actor, fixedNow);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.changed).toBe(false);
    expect(second.value.pack.id).toBe('review-pack-2025');
    expect(second.value.state.activity).toHaveLength(activityCountAfterFirst);
  });
});
