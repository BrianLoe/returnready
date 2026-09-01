import { describe, expect, it } from 'vitest';
import { createDemoReturnState } from '../fixtures/demoReturn';
import type { Currency } from './model';
import { recordAcquisitionDetails } from './acquisition';
import { deriveInvestmentsStatusFromIssues, deriveStatusFromIssues } from './reconcile';
import { generateReviewPack } from './reviewPack';
import { validateReviewPack } from './validation';
import { recordDeductions } from './recordDeductions';
import { recordDisposals } from './recordDisposals';

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
  it('generates a populated-draft pack from current deductions and disposals after blockers clear', () => {
    const deduction = recordDeductions(createDemoReturnState(), [{
      sourceRecordId: 'wfh-summary-01', category: 'work-from-home', description: 'WFH hours',
      periodStart: '2025-07-08', periodEnd: '2026-05-19', quantity: 40, unit: 'hours',
      currency: 'AUD', sourceLabel: 'wfh-hours-fy2025-26.csv',
    }], 'agent', fixedNow);
    expect(deduction.ok).toBe(true);
    if (!deduction.ok) return;
    const disposal = recordDisposals(deduction.value.state, [{
      sourceRecordId: 'broker-aapl-01', assetType: 'foreign-share', symbol: 'AAPL', quantity: 30,
      disposalDate: '2026-05-02', proceedsMinor: 525_000, currency: 'USD',
      sourceLabel: 'foreign-broker-fy2025-26.csv',
    }], 'agent', fixedNow);
    expect(disposal.ok).toBe(true);
    if (!disposal.ok) return;
    const acquisition = recordAcquisitionDetails(disposal.value.state, {
      eventId: 'disposal-broker-aapl-01', acquisitionDate: '2022-09-15', unitPrice: 150,
      currency: 'USD',
    }, 'human', fixedNow);
    expect(acquisition.ok).toBe(true);
    if (!acquisition.ok) return;

    const result = generateReviewPack(acquisition.value.state, 'agent', fixedNow);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pack.deductionEvidence).toEqual([
      expect.objectContaining({ sourceRecordId: 'wfh-summary-01', quantity: 40 }),
    ]);
    expect(result.value.pack.disposalReviewTable).toEqual([
      expect.objectContaining({ sourceRecordId: 'broker-aapl-01', acquisitionProvenance: 'user-attested' }),
    ]);
    expect(result.value.pack.unresolvedWarnings.map((issue) => issue.code)).toContain(
      'deduction-amount-not-calculated',
    );
  });

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
    expect(result.value.pack.id).toBe('review-pack-2026');
    expect(result.value.state.reviewPackId).toBe('review-pack-2026');

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

  it('derives pack statuses fresh from validation issues, not from persisted event/section status', () => {
    // Attest AAPL WITHOUT reconciling msft/btc first: only AAPL's persisted
    // status is refreshed, so evt-msft and evt-btc keep the fixture's stale
    // 'unreviewed', and the persisted section rollup stays 'unreviewed'. The
    // pack must nonetheless reflect fresh derivation (msft=evidence-complete,
    // btc=warning, section=warning) so it never self-contradicts.
    const state = attestAapl(createDemoReturnState());

    // Guard: this scenario only proves anything while persisted status is stale.
    expect(state.investmentsStatus).toBe('unreviewed');
    expect(state.events.find((e) => e.id === 'evt-btc')?.status).toBe('unreviewed');

    const result = generateReviewPack(state, actor, fixedNow);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { pack } = result.value;

    const { issues } = validateReviewPack(state);

    // Section rollup matches the shared fresh derivation, not persisted state.
    expect(pack.sectionReadiness.investments).toBe(
      deriveInvestmentsStatusFromIssues(state.events, issues),
    );
    expect(pack.sectionReadiness.investments).toBe('warning');

    // Every event row matches fresh per-event derivation from the same issues.
    for (const row of pack.eventReviewTable) {
      const expected = deriveStatusFromIssues(issues.filter((i) => i.eventId === row.eventId));
      expect(row.status).toBe(expected);
    }
    // Concretely: msft (persisted 'unreviewed') reads fresh as evidence-complete,
    // btc as a warning.
    expect(pack.eventReviewTable.find((r) => r.eventId === 'evt-msft')?.status).toBe(
      'evidence-complete-for-review',
    );
    expect(pack.eventReviewTable.find((r) => r.eventId === 'evt-btc')?.status).toBe('warning');
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
    expect(second.value.pack.id).toBe('review-pack-2026');
    expect(second.value.state.activity).toHaveLength(activityCountAfterFirst);
  });
});
