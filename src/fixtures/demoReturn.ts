import type { ReturnState } from '../domain/model';

/**
 * Recursively freezes an object graph so the module-level fixture constant
 * below can never be mutated in place. `createDemoReturnState()` is the only
 * supported way to obtain a working copy: it returns a fresh
 * `structuredClone` of this frozen source on every call.
 */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * Synthetic opening state for the ReturnReady demo.
 *
 * All financial data here is synthetic. Investment events open `unreviewed`
 * with no linked evidence, no issues, and zero blocker/warning counts:
 * reconciliation and validation (Task 3) derive those outcomes from the
 * facts below rather than the fixture asserting its own answer. The facts
 * themselves already encode the intended scenario:
 *
 * - evt-msft: acquisition + disposal facts, brokerage, fee, dated FX
 *   evidence for both dates, and an explicit no-corporate-action assertion
 *   are all present -> nothing should block this event once reconciled.
 * - evt-aapl: everything is present (quantity, disposal date, proceeds,
 *   disposal brokerage, dated disposal FX, no-corporate-action) except the
 *   acquisition date and USD unit cost, which are absent -> the single
 *   blocker. Its disposal date (2023-05-02) is strictly after the FX row at
 *   2022-09-15/USD, which is the exact date+currency the demo attestation
 *   will later supply.
 * - evt-btc: acquisition, disposal, and FX facts are complete; only the
 *   transaction fee is absent -> a warning, never a blocker.
 */
const rawFixture: ReturnState = {
  incomeStatus: 'previously-reviewed',
  deductionsStatus: 'previously-reviewed',
  investmentsStatus: 'unreviewed',
  blockerCount: 0,
  warningCount: 0,
  currentStep: 'investments',
  reviewPackId: null,
  reviewPack: null,
  evidence: [
    {
      id: 'ev-payg',
      sourceType: 'payg-summary',
      displayName: 'PAYG income statement summary',
      synthetic: true,
      facts: {
        kind: 'payg-summary',
        grossIncomeMinor: 9_500_000,
        taxWithheldMinor: 1_800_000,
        currency: 'AUD',
      },
      rawText:
        'Synthetic PAYG payment summary for demo user. Gross income $95,000.00 AUD, tax withheld $18,000.00 AUD. Previously reviewed, not processed by this prototype.',
      linkedEventIds: [],
      status: 'reconciled',
    },
    {
      id: 'ev-deductions',
      sourceType: 'deduction-summary',
      displayName: 'Work-related deduction summary',
      synthetic: true,
      facts: {
        kind: 'deduction-summary',
        lineItemCount: 3,
        totalMinor: 240_000,
        currency: 'AUD',
      },
      rawText:
        'Synthetic work-deduction summary for demo user: three linked line items totalling $2,400.00 AUD. Previously reviewed, not processed by this prototype.',
      linkedEventIds: [],
      status: 'reconciled',
    },
    {
      id: 'ev-managed-fund',
      sourceType: 'managed-fund-statement',
      displayName: 'Australian managed fund annual statement',
      synthetic: true,
      facts: {
        kind: 'managed-fund-statement',
        holdingCount: 10,
        totalDistributionMinor: 320_000,
        currency: 'AUD',
      },
      rawText:
        'Synthetic Australian managed-fund annual statement covering ten holdings, total distribution $3,200.00 AUD. Previously reviewed, not processed by this prototype.',
      linkedEventIds: [],
      status: 'reconciled',
    },
    {
      id: 'ev-broker',
      sourceType: 'broker-export',
      displayName: 'Foreign broker disposal export',
      synthetic: true,
      facts: {
        kind: 'broker-export',
        disposals: [
          {
            eventId: 'evt-msft',
            symbol: 'MSFT',
            quantity: 50,
            disposalDate: '2023-04-18',
            proceedsMinor: 1_400_000,
            brokerageMinor: 2_500,
            currency: 'USD',
            corporateAction: 'none-asserted',
          },
          {
            eventId: 'evt-aapl',
            symbol: 'AAPL',
            quantity: 30,
            disposalDate: '2023-05-02',
            proceedsMinor: 525_000,
            brokerageMinor: 1_500,
            currency: 'USD',
            corporateAction: 'none-asserted',
          },
        ],
      },
      rawText:
        'Synthetic foreign broker export summary: MSFT disposal 50 units, AAPL disposal 30 units. No corporate actions recorded for either position during the disposal period.',
      linkedEventIds: [],
      status: 'imported',
    },
    {
      id: 'ev-crypto',
      sourceType: 'crypto-export',
      displayName: 'Crypto exchange disposal export',
      synthetic: true,
      facts: {
        kind: 'crypto-export',
        disposals: [
          {
            eventId: 'evt-btc',
            symbol: 'BTC',
            quantity: 0.5,
            disposalDate: '2023-06-20',
            proceedsMinor: 1_500_000,
            currency: 'USD',
          },
        ],
      },
      rawText:
        'Synthetic crypto exchange export: BTC disposal of 0.5 units. Transaction fee was not reported by the exchange.',
      linkedEventIds: [],
      status: 'imported',
    },
    {
      id: 'ev-fx',
      sourceType: 'fx-rates',
      displayName: 'Foreign-exchange rate evidence',
      synthetic: true,
      facts: {
        kind: 'fx-rates',
        rates: [
          { date: '2021-03-10', currency: 'USD', rateToAud: 1.3021 },
          { date: '2023-04-18', currency: 'USD', rateToAud: 1.5142 },
          { date: '2022-09-15', currency: 'USD', rateToAud: 1.4834 },
          { date: '2023-05-02', currency: 'USD', rateToAud: 1.4935 },
          { date: '2021-11-01', currency: 'USD', rateToAud: 1.3452 },
          { date: '2023-06-20', currency: 'USD', rateToAud: 1.5087 },
        ],
      },
      rawText:
        'Synthetic foreign-exchange rate table sourced for the demo evidence dates. All rates are illustrative only.',
      linkedEventIds: [],
      status: 'imported',
    },
  ],
  events: [
    {
      id: 'evt-msft',
      assetClass: 'foreign-share',
      symbol: 'MSFT',
      eventType: 'disposal',
      synthetic: true,
      quantity: 50,
      acquisition: {
        date: '2021-03-10',
        unitPriceMinor: 21_500,
        currency: 'USD',
        provenance: 'documentary',
      },
      disposal: {
        date: '2023-04-18',
        proceedsMinor: 1_400_000,
        currency: 'USD',
        brokerageMinor: 2_500,
        feeMinor: 500,
        corporateAction: 'none-asserted',
      },
      currency: 'USD',
      linkedEvidenceIds: [],
      status: 'unreviewed',
      issueIds: [],
    },
    {
      id: 'evt-aapl',
      assetClass: 'foreign-share',
      symbol: 'AAPL',
      eventType: 'disposal',
      synthetic: true,
      quantity: 30,
      // date and unitPriceMinor are deliberately omitted (not set to undefined):
      // this is the single blocker. Same "absent key" convention as the
      // missing evt-btc.disposal.feeMinor below.
      acquisition: {
        currency: 'USD',
        provenance: 'missing',
      },
      disposal: {
        date: '2023-05-02',
        proceedsMinor: 525_000,
        currency: 'USD',
        brokerageMinor: 1_500,
        corporateAction: 'none-asserted',
      },
      currency: 'USD',
      linkedEvidenceIds: [],
      status: 'unreviewed',
      issueIds: [],
    },
    {
      id: 'evt-btc',
      assetClass: 'crypto',
      symbol: 'BTC',
      eventType: 'disposal',
      synthetic: true,
      quantity: 0.5,
      acquisition: {
        date: '2021-11-01',
        unitPriceMinor: 6_000_000,
        currency: 'USD',
        provenance: 'documentary',
      },
      disposal: {
        date: '2023-06-20',
        proceedsMinor: 1_500_000,
        currency: 'USD',
      },
      currency: 'USD',
      linkedEvidenceIds: [],
      status: 'unreviewed',
      issueIds: [],
    },
  ],
  issues: [],
  activity: [],
};

const demoReturnFixture: ReturnState = deepFreeze(rawFixture);

/** Returns a fresh, independently mutable copy of the synthetic opening state. */
export function createDemoReturnState(): ReturnState {
  return structuredClone(demoReturnFixture);
}
