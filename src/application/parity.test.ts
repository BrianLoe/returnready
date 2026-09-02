/// <reference types="webmcp-types" />

import { describe, expect, it } from 'vitest';
import type { ActivityEntry, DeductionInput, DisposalInput, ReturnState } from '../domain/model';
import type { ReviewPack } from '../domain/reviewPack';
import { registerReturnReadyTools } from '../webmcp/registerTools';
import { createReturnReadyController, type ReturnReadyController } from './returnReadyController';

const now = () => '2026-06-30T00:00:00.000Z';
const deduction: DeductionInput = { sourceRecordId: 'wfh-01', category: 'work-from-home', description: 'WFH hours', periodStart: '2025-07-01', periodEnd: '2026-06-30', quantity: 40, unit: 'hours', calculationMethod: 'fixed-rate', currency: 'AUD', sourceLabel: 'wfh.csv' };
const disposals: DisposalInput[] = [
  { sourceRecordId: 'aapl-01', assetType: 'foreign-share', symbol: 'AAPL', quantity: 30, disposalDate: '2026-05-02', proceedsMinor: 525000, currency: 'USD', sourceLabel: 'broker.csv' },
  { sourceRecordId: 'btc-01', assetType: 'crypto', symbol: 'BTC', quantity: 0.5, acquisitionDate: '2024-01-10', acquisitionUnitPriceMinor: 6000000, acquisitionCurrency: 'AUD', disposalDate: '2026-06-20', proceedsMinor: 8000000, currency: 'AUD', sourceLabel: 'crypto.csv' },
];
const acquisition = { eventId: 'disposal-aapl-01', acquisitionDate: '2025-09-15', unitPrice: 150, currency: 'USD' as const };

function capture(controller: ReturnReadyController) {
  const tools = new Map<string, WebMCP.ModelContextTool>();
  const target = document as unknown as { modelContext?: unknown };
  const previous = target.modelContext;
  target.modelContext = { registerTool(tool: WebMCP.ModelContextTool) { tools.set(tool.name, tool); return Promise.resolve(); } };
  try { registerReturnReadyTools(controller); } finally { target.modelContext = previous; }
  return tools;
}

async function call(tools: Map<string, WebMCP.ModelContextTool>, name: string, args: Record<string, unknown>) {
  const tool = tools.get(name); if (!tool) throw new Error(`Missing ${name}`);
  const raw = await tool.execute(args, { signal: new AbortController().signal });
  if (typeof raw !== 'string') throw new Error('Expected serialized result');
  return JSON.parse(raw) as { ok: boolean; changed: boolean };
}

function activity(entry: ActivityEntry) { return { id: entry.id, action: entry.action, recordId: entry.recordId }; }
function pack(value: ReviewPack | null) {
  if (!value) return null;
  const { generatedAt: _generatedAt, ...rest } = value;
  return {
    ...rest,
    deductionEvidence: rest.deductionEvidence.map(({ provenance: _provenance, ...entry }) => entry),
    disposalReviewTable: rest.disposalReviewTable,
  };
}
function state(value: ReturnState) {
  return {
    ...value,
    deductions: value.deductions.map(({ provenance: _provenance, ...entry }) => entry),
    disposals: value.disposals.map(({ provenance: _provenance, ...entry }) => entry),
    activity: value.activity.map(activity),
    reviewPack: pack(value.reviewPack),
  };
}

describe('manual and WebMCP draft population parity', () => {
  it('converges on equal entries, issues, and review pack', async () => {
    const manual = createReturnReadyController({ now });
    const agent = createReturnReadyController({ now });
    const tools = capture(agent);

    expect(manual.recordDeductions([deduction], 'human').ok).toBe(true);
    expect((await call(tools, 'record_deductions', { entries: [deduction] })).ok).toBe(true);
    expect(manual.recordDisposals(disposals, 'human').ok).toBe(true);
    expect((await call(tools, 'record_disposals', { entries: disposals })).ok).toBe(true);
    expect(manual.recordAcquisitionDetails(acquisition, 'human').ok).toBe(true);
    expect((await call(tools, 'record_acquisition_details', acquisition)).ok).toBe(true);
    expect(manual.generateReviewPack('human').ok).toBe(true);
    expect((await call(tools, 'generate_review_pack', {})).ok).toBe(true);

    expect(state(agent.getState())).toEqual(state(manual.getState()));
    expect(agent.getReturnDraft().issues).toEqual(manual.getReturnDraft().issues);

    const repeat = await call(tools, 'record_deductions', { entries: [deduction] });
    expect(repeat).toMatchObject({ ok: true, changed: false });
  });

  it('rejects equivalent invalid input without changing either state', async () => {
    const manual = createReturnReadyController({ now });
    const agent = createReturnReadyController({ now });
    const tools = capture(agent);
    const beforeManual = manual.getState();
    const beforeAgent = agent.getState();
    const invalid = { ...deduction, periodStart: '2025-06-30' };
    expect(manual.recordDeductions([invalid], 'human').ok).toBe(false);
    expect((await call(tools, 'record_deductions', { entries: [invalid] })).ok).toBe(false);
    expect(manual.getState()).toBe(beforeManual);
    expect(agent.getState()).toBe(beforeAgent);
  });
});
