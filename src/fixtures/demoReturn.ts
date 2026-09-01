import type { ReturnState } from '../domain/model';

const fixture: ReturnState = {
  incomeSummary: {
    description: 'PAYG income statement available',
    grossIncomeMinor: 9_500_000,
    taxWithheldMinor: 1_800_000,
    currency: 'AUD',
    sourceLabel: 'Example PAYG income statement',
  },
  deductions: [],
  disposals: [],
  incomeStatus: 'previously-reviewed',
  deductionsStatus: 'previously-reviewed',
  investmentsStatus: 'unreviewed',
  blockerCount: 0,
  warningCount: 0,
  currentStep: 'investments',
  reviewPackId: null,
  reviewPack: null,
  evidence: [],
  events: [],
  issues: [],
  activity: [],
};

export function createDemoReturnState(): ReturnState {
  return structuredClone(fixture);
}
