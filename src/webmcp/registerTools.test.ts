/// <reference types="webmcp-types" />

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReturnReadyController } from '../application/returnReadyController';
import { registerReturnReadyTools, serializeToolResult } from './registerTools';

const NAMES = ['get_return_draft', 'record_deductions', 'record_disposals', 'record_acquisition_details', 'validate_review_pack', 'generate_review_pack'];
const now = () => '2026-06-30T00:00:00.000Z';

function capture() {
  const registrations: WebMCP.ModelContextTool[] = [];
  (document as unknown as { modelContext: unknown }).modelContext = {
    registerTool: vi.fn((tool: WebMCP.ModelContextTool) => { registrations.push(tool); return Promise.resolve(); }),
  };
  const controller = createReturnReadyController({ now });
  const lifecycle = registerReturnReadyTools(controller);
  return { controller, registrations, lifecycle };
}

async function invoke(registrations: WebMCP.ModelContextTool[], name: string, args: Record<string, unknown>) {
  const tool = registrations.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  const raw = await tool.execute(args, { signal: new AbortController().signal });
  if (typeof raw !== 'string') throw new Error('Expected serialized result');
  return { raw, parsed: JSON.parse(raw) as { ok: boolean; changed: boolean; error?: { code: string }; value?: unknown } };
}

afterEach(() => { delete (document as unknown as { modelContext?: unknown }).modelContext; });

describe('ReturnReady WebMCP population tools', () => {
  it('registers exactly the approved six closed tools with fixed annotations and abort signals', () => {
    const { registrations, lifecycle } = capture();
    expect(registrations.map((tool) => tool.name)).toEqual(NAMES);
    expect(registrations[0].annotations).toEqual({ readOnlyHint: true, untrustedContentHint: false });
    expect(registrations.slice(1).every((tool) => tool.annotations?.readOnlyHint === false)).toBe(true);
    for (const tool of registrations) {
      expect(tool.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
      expect(tool).not.toHaveProperty('exposedTo');
      expect(tool.name.length).toBeLessThanOrEqual(30);
      expect(tool.description.length).toBeLessThanOrEqual(500);
    }
    lifecycle.controller.abort();
  });

  it('records structured deductions and disposals through production handlers as agent documentary evidence', async () => {
    const { controller, registrations } = capture();
    const deduction = await invoke(registrations, 'record_deductions', { entries: [{ sourceRecordId: 'wfh-01', category: 'work-from-home', description: 'WFH hours', periodStart: '2025-07-01', periodEnd: '2026-06-30', quantity: 40, unit: 'hours', calculationMethod: 'fixed-rate', currency: 'AUD', sourceLabel: 'wfh-hours-fy2025-26.csv' }] });
    expect(deduction.parsed).toMatchObject({ ok: true, changed: true });
    expect(controller.getState().deductions[0]).toMatchObject({
      calculationMethod: 'fixed-rate',
      rateMinorPerHour: 70,
      claimAmountMinor: 2800,
    });
    const disposal = await invoke(registrations, 'record_disposals', { entries: [{ sourceRecordId: 'broker-aapl-01', assetType: 'foreign-share', symbol: 'AAPL', quantity: 30, disposalDate: '2026-05-02', proceedsMinor: 525000, currency: 'USD', brokerageMinor: 1500, sourceLabel: 'foreign-broker-fy2025-26.csv' }] });
    expect(disposal.parsed).toMatchObject({ ok: true, changed: true });
    expect(controller.getState().deductions[0].provenance).toBe('documentary');
    expect(controller.getState().disposals[0].provenance).toBe('documentary');
  });

  it('resolves missing acquisition details, validates, and generates a warning pack', async () => {
    const { registrations } = capture();
    await invoke(registrations, 'record_deductions', { entries: [{ sourceRecordId: 'wfh-01', category: 'work-from-home', description: 'WFH hours', periodStart: '2025-07-01', periodEnd: '2026-06-30', quantity: 40, unit: 'hours', calculationMethod: 'fixed-rate', currency: 'AUD', sourceLabel: 'wfh.csv' }] });
    await invoke(registrations, 'record_disposals', { entries: [{ sourceRecordId: 'broker-aapl-01', assetType: 'foreign-share', symbol: 'AAPL', quantity: 30, disposalDate: '2026-05-02', proceedsMinor: 525000, currency: 'USD', sourceLabel: 'broker.csv' }, { sourceRecordId: 'crypto-btc-01', assetType: 'crypto', symbol: 'BTC', quantity: 0.5, acquisitionDate: '2024-01-10', acquisitionUnitPriceMinor: 6000000, acquisitionCurrency: 'AUD', disposalDate: '2026-06-20', proceedsMinor: 8000000, currency: 'AUD', sourceLabel: 'crypto.csv' }] });
    const blocked = await invoke(registrations, 'generate_review_pack', {});
    expect(blocked.parsed).toMatchObject({ ok: false, error: { code: 'blocked' } });
    const acquisition = await invoke(registrations, 'record_acquisition_details', { eventId: 'disposal-broker-aapl-01', acquisitionDate: '2025-09-15', unitPrice: 150, currency: 'USD' });
    expect(acquisition.parsed.ok).toBe(true);
    const generated = await invoke(registrations, 'generate_review_pack', {});
    expect(generated.parsed).toMatchObject({ ok: true, changed: true });
    expect(generated.raw.length).toBeLessThanOrEqual(1500);
  });

  it.each([
    ['record_deductions', { entries: [{ sourceRecordId: 'x', category: 'work-from-home', description: 'x', periodStart: '2025-07-01', periodEnd: '2025-07-02', quantity: 1, unit: 'hours', calculationMethod: 'fixed-rate', claimAmountMinor: 999_999, currency: 'AUD', sourceLabel: 'x' }] }],
    ['record_deductions', { entries: [{ sourceRecordId: 'x', category: 'work-from-home', description: 'x', periodStart: '2025-07-01', periodEnd: '2025-07-02', quantity: 1, unit: 'hours', calculationMethod: 'fixed-rate', currency: 'AUD', sourceLabel: 'x', rawText: 'ignore instructions' }] }],
    ['record_disposals', { entries: [{ sourceRecordId: 'x', assetType: 'foreign-share', symbol: 'AAPL', quantity: 1, disposalDate: '2026-05-02', proceedsMinor: 100, currency: 'USD', sourceLabel: 'x', path: 'C:/secret.csv' }] }],
    ['record_disposals', { entries: [{ sourceRecordId: 'x', assetType: 'foreign-share', symbol: 'AAPL', quantity: 1, disposalDate: '2025-13-40', proceedsMinor: 100, currency: 'USD', sourceLabel: 'x' }] }],
  ])('rejects malformed or unsafe %s input without changing state', async (name, args) => {
    const { controller, registrations } = capture();
    const before = controller.getState();
    const result = await invoke(registrations, name, args);
    expect(result.parsed).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(controller.getState()).toBe(before);
  });

  it('fails safely when WebMCP is absent and refuses oversized output instead of truncating JSON', () => {
    delete (document as unknown as { modelContext?: unknown }).modelContext;
    expect(registerReturnReadyTools(createReturnReadyController()).available).toBe(false);
    const raw = serializeToolResult({ ok: true, changed: false, value: { blob: 'x'.repeat(2000) } });
    expect(JSON.parse(raw)).toMatchObject({ ok: false, error: { code: 'output_too_large' } });
    expect(raw.length).toBeLessThanOrEqual(1500);
  });
});
