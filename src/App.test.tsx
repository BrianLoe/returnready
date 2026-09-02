/// <reference types="webmcp-types" />

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the ReturnReady heading without repeating implementation-oriented demo labels', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'ReturnReady' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Prepare your 2025–26 return evidence' })).toBeVisible();
    expect(screen.getByText(/add entries manually, or ask Codex to populate/i)).toBeVisible();

    expect(screen.queryByText('Synthetic demo data')).not.toBeInTheDocument();
    expect(screen.queryByText('Holdings')).not.toBeInTheDocument();
  });
});

// --- WebMCP wiring: proves the manual UI and the registered tools share
// the same controller instance, not just that a controller passed directly
// into `registerReturnReadyTools` behaves correctly (that's covered by
// `registerTools.test.ts`). This is the integration the whole task exists
// for: an agent tool call and a human button click must produce the same
// visible effect through the same state. ---------------------------------

interface CapturedRegistration {
  tool: WebMCP.ModelContextTool;
  options?: WebMCP.ModelContextRegisterToolOptions;
}

function setModelContext(value: unknown) {
  (document as unknown as { modelContext?: unknown }).modelContext = value;
}

function clearModelContext() {
  delete (document as unknown as { modelContext?: unknown }).modelContext;
}

afterEach(() => {
  clearModelContext();
});

describe('App + WebMCP wiring', () => {
  it('registers tools against the controller the manual UI renders from, and an agent tool call updates the rendered activity strip', async () => {
    const registrations: CapturedRegistration[] = [];
    setModelContext({
      registerTool: vi.fn((tool: WebMCP.ModelContextTool, options?: WebMCP.ModelContextRegisterToolOptions) => {
        registrations.push({ tool, options });
        return Promise.resolve();
      }),
    });

    render(<App />);

    // `App` is not wrapped in `StrictMode` here (unlike `main.tsx`), so the
    // registration effect runs once; filtering to non-aborted signals keeps
    // this robust even if that ever changes.
    const live = () => registrations.filter((r) => r.options?.signal?.aborted !== true);
    await waitFor(() => expect(live().length).toBe(6));

    const recordDeductions = live().find((r) => r.tool.name === 'record_deductions');
    if (!recordDeductions) throw new Error('record_deductions was not registered');

    expect(screen.getByText('No activity yet.')).toBeVisible();

    const raw = await recordDeductions.tool.execute(
      { entries: [{
        sourceRecordId: 'wfh-app-test-01',
        category: 'work-from-home',
        description: 'WFH hours populated by Codex',
        periodStart: '2025-07-01',
        periodEnd: '2026-06-30',
        quantity: 40,
        unit: 'hours',
        calculationMethod: 'fixed-rate',
        currency: 'AUD',
        sourceLabel: 'wfh-hours-fy2025-26.csv',
      }] },
      { signal: new AbortController().signal },
    );
    if (typeof raw !== 'string') throw new Error('expected a string tool result');
    const parsed = JSON.parse(raw) as { ok: boolean };
    expect(parsed.ok).toBe(true);

    // The agent call above went through `document.modelContext` into
    // `registerReturnReadyTools(controller)` inside `App`'s effect -- if
    // that were a different controller instance than the one
    // `ReturnReadyApp` renders `state` from, this assertion would never
    // pass without a remount. It passes because they are the same
    // instance: the controller's `notify()` re-renders this same tree via
    // `useSyncExternalStore`.
    await waitFor(() => {
      expect(screen.getAllByText('Agent').length).toBeGreaterThan(0);
      expect(screen.getByRole('article', { name: 'WFH hours populated by Codex' })).toBeVisible();
    });
  });

  it('shows freshly derived blockers and warnings when an agent generation call opens validation', async () => {
    const registrations: CapturedRegistration[] = [];
    setModelContext({
      registerTool: vi.fn((tool: WebMCP.ModelContextTool, options?: WebMCP.ModelContextRegisterToolOptions) => {
        registrations.push({ tool, options });
        return Promise.resolve();
      }),
    });

    render(<App />);

    const live = () => registrations.filter((registration) => registration.options?.signal?.aborted !== true);
    await waitFor(() => expect(live().length).toBe(6));

    const recordDisposals = live().find((registration) => registration.tool.name === 'record_disposals');
    const generateReviewPack = live().find((registration) => registration.tool.name === 'generate_review_pack');
    if (!recordDisposals || !generateReviewPack) throw new Error('required WebMCP tools were not registered');

    await recordDisposals.tool.execute(
      {
        entries: [
          {
            sourceRecordId: 'broker-aapl-modal-test',
            assetType: 'foreign-share',
            symbol: 'AAPL',
            quantity: 30,
            disposalDate: '2026-05-02',
            proceedsMinor: 525000,
            currency: 'USD',
            brokerageMinor: 1500,
            sourceLabel: 'foreign-broker-fy2025-26.csv',
          },
          {
            sourceRecordId: 'crypto-btc-modal-test',
            assetType: 'crypto',
            symbol: 'BTC',
            quantity: 0.5,
            acquisitionDate: '2021-11-01',
            acquisitionUnitPriceMinor: 6000000,
            acquisitionCurrency: 'USD',
            disposalDate: '2026-06-20',
            proceedsMinor: 1500000,
            currency: 'USD',
            sourceLabel: 'crypto-transactions-fy2025-26.csv',
          },
        ],
      },
      { signal: new AbortController().signal },
    );

    await generateReviewPack.tool.execute({}, { signal: new AbortController().signal });

    const dialog = await screen.findByRole('dialog', { name: 'Review pack validation' });
    expect(within(dialog).getByRole('heading', { name: 'Blocking issues' })).toBeVisible();
    expect(within(dialog).getByText(/AAPL/)).toBeVisible();
    expect(within(dialog).getByText(/acquisition date and unit cost are required/i)).toBeVisible();
    expect(within(dialog).getByRole('heading', { name: 'Warnings' })).toBeVisible();
    expect(within(dialog).getByText(/BTC/)).toBeVisible();
    expect(within(dialog).getByText(/transaction fee evidence is missing/i)).toBeVisible();
    expect(within(dialog).queryByText('No blocking issues or warnings remain.')).not.toBeInTheDocument();
  });
});
