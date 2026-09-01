import { describe, expect, it } from 'vitest';
import wfhCsv from '../../demo-evidence/wfh-hours-fy2025-26.csv?raw';
import brokerCsv from '../../demo-evidence/foreign-broker-fy2025-26.csv?raw';
import cryptoCsv from '../../demo-evidence/crypto-transactions-fy2025-26.csv?raw';
import { createDemoReturnState } from './demoReturn';

describe('sparse demo fixture', () => {
  it('opens with small PAYG context and no deduction, disposal, file, issue, activity, or pack state', () => {
    const state = createDemoReturnState();
    expect(state.incomeSummary.description).toBe('PAYG income statement available');
    expect(state.deductions).toEqual([]);
    expect(state.disposals).toEqual([]);
    expect(state.evidence).toEqual([]);
    expect(state.events).toEqual([]);
    expect(state.issues).toEqual([]);
    expect(state.activity).toEqual([]);
    expect(state.reviewPack).toBeNull();
  });

  it('returns independent clones', () => {
    const first = createDemoReturnState();
    first.blockerCount = 99;
    expect(createDemoReturnState().blockerCount).toBe(0);
  });

  it('ships three synthetic attachments with FY2025-26 reporting dates and a missing AAPL acquisition pair', () => {
    expect(wfhCsv).toContain('wfh-summary-01,2025-07-08,8');
    expect(wfhCsv).toContain('wfh-summary-01,2026-05-19,8');
    expect(brokerCsv).toContain('broker-aapl-01,foreign-share,AAPL,30,,,,2026-05-02');
    expect(cryptoCsv).toContain('crypto-btc-01,crypto,BTC');
    expect(`${wfhCsv}${brokerCsv}${cryptoCsv}`).not.toContain('2023-');
  });
});
