/// <reference types="webmcp-types" />

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemoReturnState } from '../fixtures/demoReturn';
import type { Result } from '../domain/model';
import { createReturnReadyController, type ReturnReadyController } from '../application/returnReadyController';
import { registerReturnReadyTools, serializeToolResult } from './registerTools';

const fixedNow = () => '2026-08-31T00:00:00.000Z';

// AAPL's disposal date (2026-05-02) is strictly after the fixture's
// 2022-09-15/USD FX row, so this is a valid, FX-backed attestation that
// resolves AAPL's missing-acquisition blocker (mirrors
// `returnReadyController.test.ts`'s own fixture-valid input).
const AAPL_ACQUISITION_ARGS = {
  eventId: 'evt-aapl',
  acquisitionDate: '2022-09-15',
  unitPrice: 150.25,
  currency: 'USD',
};

const APPROVED_TOOL_NAMES = [
  'get_return_readiness',
  'list_investment_evidence',
  'reconcile_investment_evidence',
  'record_acquisition_details',
  'validate_review_pack',
  'generate_review_pack',
] as const;

interface CapturedRegistration {
  tool: WebMCP.ModelContextTool;
  options?: WebMCP.ModelContextRegisterToolOptions;
}

function createFakeModelContext() {
  const registrations: CapturedRegistration[] = [];
  const fake = {
    registerTool: vi.fn((tool: WebMCP.ModelContextTool, options?: WebMCP.ModelContextRegisterToolOptions) => {
      registrations.push({ tool, options });
      return Promise.resolve();
    }),
  };
  return { fake, registrations };
}

function setModelContext(value: unknown) {
  (document as unknown as { modelContext?: unknown }).modelContext = value;
}

function clearModelContext() {
  delete (document as unknown as { modelContext?: unknown }).modelContext;
}

function findRegistration(registrations: CapturedRegistration[], name: string): CapturedRegistration {
  const found = registrations.find((r) => r.tool.name === name);
  if (!found) throw new Error(`tool ${name} was not registered`);
  return found;
}

async function callTool(
  registrations: CapturedRegistration[],
  name: string,
  args: unknown,
): Promise<{ raw: string; parsed: unknown }> {
  const { tool } = findRegistration(registrations, name);
  const result = await tool.execute(args as Record<string, unknown>, {
    signal: new AbortController().signal,
  });
  if (typeof result !== 'string') {
    throw new Error(`expected ${name} to return a string, got ${typeof result}`);
  }
  return { raw: result, parsed: JSON.parse(result) };
}

function registerWithFake(controller: ReturnReadyController) {
  const { fake, registrations } = createFakeModelContext();
  setModelContext(fake);
  const registration = registerReturnReadyTools(controller);
  return { registration, registrations };
}

afterEach(() => {
  clearModelContext();
});

// --- Step 1: registration/contract tests ------------------------------------

describe('registerReturnReadyTools: contract', () => {
  it('registers exactly the six approved tools, no more, no fewer', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registration, registrations } = registerWithFake(controller);

    expect(registration.available).toBe(true);
    expect(registrations).toHaveLength(6);
    expect(registrations.map((r) => r.tool.name).sort()).toEqual([...APPROVED_TOOL_NAMES].sort());
  });

  it('never sets exposedTo (no cross-origin exposure)', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registrations } = registerWithFake(controller);

    for (const { options } of registrations) {
      expect(options?.exposedTo).toBeUndefined();
    }
  });

  it('passes the returned AbortController signal to every registration', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registration, registrations } = registerWithFake(controller);

    for (const { options } of registrations) {
      expect(options?.signal).toBe(registration.controller.signal);
    }
  });

  it.each([
    ['get_return_readiness', { readOnlyHint: true, untrustedContentHint: false }],
    ['list_investment_evidence', { readOnlyHint: true, untrustedContentHint: true }],
    ['reconcile_investment_evidence', { readOnlyHint: false, untrustedContentHint: false }],
    ['record_acquisition_details', { readOnlyHint: false, untrustedContentHint: false }],
    ['validate_review_pack', { readOnlyHint: false, untrustedContentHint: false }],
    ['generate_review_pack', { readOnlyHint: false, untrustedContentHint: false }],
  ] as const)('%s has the exact required annotations', (name, expected) => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registrations } = registerWithFake(controller);

    const { tool } = findRegistration(registrations, name);
    expect(tool.annotations).toEqual(expected);
  });

  it('every tool name and every schema property name stays within 30 characters', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registrations } = registerWithFake(controller);

    for (const { tool } of registrations) {
      expect(tool.name.length).toBeLessThanOrEqual(30);
      const schema = tool.inputSchema as { properties?: Record<string, unknown> } | undefined;
      for (const propName of Object.keys(schema?.properties ?? {})) {
        expect(propName.length).toBeLessThanOrEqual(30);
      }
    }
  });

  it('every tool description stays within 500 characters', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registrations } = registerWithFake(controller);

    for (const { tool } of registrations) {
      expect(tool.description.length).toBeLessThanOrEqual(500);
    }
  });

  it('every schema property description stays within 150 characters', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registrations } = registerWithFake(controller);

    for (const { tool } of registrations) {
      const schema = tool.inputSchema as { properties?: Record<string, { description?: string }> } | undefined;
      for (const prop of Object.values(schema?.properties ?? {})) {
        if (prop.description) {
          expect(prop.description.length).toBeLessThanOrEqual(150);
        }
      }
    }
  });

  it('every tool schema sets additionalProperties: false', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registrations } = registerWithFake(controller);

    for (const { tool } of registrations) {
      const schema = tool.inputSchema as { additionalProperties?: boolean };
      expect(schema.additionalProperties).toBe(false);
    }
  });

  it('reconcile_investment_evidence requires eventIds: a unique, non-empty array', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registrations } = registerWithFake(controller);

    const { tool } = findRegistration(registrations, 'reconcile_investment_evidence');
    const schema = tool.inputSchema as {
      required?: string[];
      properties: { eventIds: { type: string; minItems?: number; uniqueItems?: boolean } };
    };
    expect(schema.required).toEqual(['eventIds']);
    expect(schema.properties.eventIds.type).toBe('array');
    expect(schema.properties.eventIds.minItems).toBe(1);
    expect(schema.properties.eventIds.uniqueItems).toBe(true);
  });

  it('record_acquisition_details requires all four fields with narrow constraints', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registrations } = registerWithFake(controller);

    const { tool } = findRegistration(registrations, 'record_acquisition_details');
    const schema = tool.inputSchema as {
      required?: string[];
      properties: {
        acquisitionDate: { pattern?: string };
        unitPrice: { type: string; exclusiveMinimum?: number };
        currency: { enum?: string[] };
      };
    };
    expect(schema.required).toEqual(['eventId', 'acquisitionDate', 'unitPrice', 'currency']);
    expect(schema.properties.acquisitionDate.pattern).toBe('^\\d{4}-\\d{2}-\\d{2}$');
    expect(schema.properties.unitPrice.type).toBe('number');
    expect(schema.properties.unitPrice.exclusiveMinimum).toBe(0);
    expect(schema.properties.currency.enum).toEqual(['AUD', 'USD']);
  });

  it('get_return_readiness, validate_review_pack, and generate_review_pack accept no parameters', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registrations } = registerWithFake(controller);

    for (const name of ['get_return_readiness', 'validate_review_pack', 'generate_review_pack']) {
      const { tool } = findRegistration(registrations, name);
      const schema = tool.inputSchema as { properties?: Record<string, unknown> };
      expect(schema.properties).toEqual({});
    }
  });
});

// --- Lifecycle -----------------------------------------------------------------

describe('registerReturnReadyTools: lifecycle', () => {
  it('fails safe when document.modelContext is unavailable', () => {
    clearModelContext();
    const controller = createReturnReadyController({ now: fixedNow });

    const registration = registerReturnReadyTools(controller);

    expect(registration.available).toBe(false);
    expect(registration.controller).toBeInstanceOf(AbortController);
  });

  it('does not throw when registerTool throws synchronously', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    setModelContext({
      registerTool: () => {
        throw new Error('host rejected registration');
      },
    });

    expect(() => registerReturnReadyTools(controller)).not.toThrow();
  });

  it('one tool throwing synchronously does not block the remaining five from registering', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const registrations: CapturedRegistration[] = [];
    setModelContext({
      registerTool: vi.fn((tool: WebMCP.ModelContextTool, options?: WebMCP.ModelContextRegisterToolOptions) => {
        if (tool.name === 'get_return_readiness') {
          throw new Error('host rejected this one tool');
        }
        registrations.push({ tool, options });
        return Promise.resolve();
      }),
    });

    expect(() => registerReturnReadyTools(controller)).not.toThrow();
    const names = registrations.map((r) => r.tool.name).sort();
    expect(names).toEqual(
      APPROVED_TOOL_NAMES.filter((n) => n !== 'get_return_readiness')
        .slice()
        .sort(),
    );
  });

  it('does not throw or reject unhandled when registerTool returns a rejected promise', async () => {
    const controller = createReturnReadyController({ now: fixedNow });
    setModelContext({
      registerTool: vi.fn(() => Promise.reject(new Error('host refused this tool'))),
    });

    expect(() => registerReturnReadyTools(controller)).not.toThrow();
    // Let the swallowed rejection's microtask settle before the test ends.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('aborting the returned controller aborts every registered tool signal', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registration, registrations } = registerWithFake(controller);

    registration.controller.abort();

    for (const { options } of registrations) {
      expect(options?.signal?.aborted).toBe(true);
    }
  });

  it('re-registers cleanly after a previous registration was aborted (mount/unmount/mount)', () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { fake, registrations } = createFakeModelContext();
    setModelContext(fake);

    const first = registerReturnReadyTools(controller);
    first.controller.abort();
    registrations.length = 0;

    const second = registerReturnReadyTools(controller);

    expect(second.controller.signal.aborted).toBe(false);
    expect(registrations).toHaveLength(6);
  });
});

// --- Step 2: handler safety tests -----------------------------------------------

describe('tool handlers: reads never mutate state', () => {
  it('get_return_readiness matches controller.getReturnReadiness() and logs nothing', async () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registrations } = registerWithFake(controller);
    const listener = vi.fn();
    controller.subscribe(listener);

    const { parsed } = await callTool(registrations, 'get_return_readiness', {});

    expect(parsed).toEqual({ ok: true, changed: false, value: controller.getReturnReadiness() });
    expect(controller.getState().activity).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('list_investment_evidence returns all evidence and events, unfiltered, without mutating', async () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registrations } = registerWithFake(controller);
    const listener = vi.fn();
    controller.subscribe(listener);

    const { parsed } = await callTool(registrations, 'list_investment_evidence', {});
    const value = (parsed as { ok: true; value: { evidence: unknown[]; events: unknown[] } }).value;

    expect(value.evidence).toHaveLength(controller.getState().evidence.length);
    expect(value.events).toHaveLength(controller.getState().events.length);
    expect(controller.getState().activity).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('list_investment_evidence narrows both evidence and events by filter', async () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registrations } = registerWithFake(controller);

    const { parsed } = await callTool(registrations, 'list_investment_evidence', {
      filter: 'evidence-complete-for-review',
    });
    const value = (parsed as { ok: true; value: { evidence: unknown[]; events: unknown[] } }).value;

    // Nothing is reconciled yet, so no evidence/events are linked at this status.
    expect(value.evidence).toEqual([]);
    expect(value.events).toEqual([]);
  });
});

describe('tool handlers: invalid input is rejected and state is left unchanged', () => {
  it.each([
    ['reconcile_investment_evidence', { eventIds: ['evt-does-not-exist'] }, 'not_found'],
    ['reconcile_investment_evidence', { eventIds: ['evt-msft'], bogus: true }, 'invalid_input'],
    ['reconcile_investment_evidence', { eventIds: ['evt-msft', 'evt-msft'] }, 'invalid_input'],
    ['reconcile_investment_evidence', { eventIds: [] }, 'invalid_input'],
    ['reconcile_investment_evidence', {}, 'invalid_input'],
    ['record_acquisition_details', { ...AAPL_ACQUISITION_ARGS, eventId: 'evt-does-not-exist' }, 'not_found'],
    ['record_acquisition_details', { ...AAPL_ACQUISITION_ARGS, extra: true }, 'invalid_input'],
    ['record_acquisition_details', { ...AAPL_ACQUISITION_ARGS, acquisitionDate: '15-09-2022' }, 'invalid_input'],
    ['record_acquisition_details', { ...AAPL_ACQUISITION_ARGS, acquisitionDate: '2022-13-40' }, 'invalid_input'],
    ['record_acquisition_details', { ...AAPL_ACQUISITION_ARGS, currency: 'EUR' }, 'invalid_input'],
    ['record_acquisition_details', { ...AAPL_ACQUISITION_ARGS, unitPrice: 0 }, 'invalid_input'],
    ['record_acquisition_details', { ...AAPL_ACQUISITION_ARGS, unitPrice: -5 }, 'invalid_input'],
    ['record_acquisition_details', { ...AAPL_ACQUISITION_ARGS, unitPrice: '150.25' }, 'invalid_input'],
    ['list_investment_evidence', { filter: 'not-a-real-status' }, 'invalid_input'],
    ['list_investment_evidence', { filter: 'warning', extra: true }, 'invalid_input'],
    ['get_return_readiness', { extra: true }, 'invalid_input'],
    ['validate_review_pack', { extra: true }, 'invalid_input'],
    ['generate_review_pack', { extra: true }, 'invalid_input'],
  ] as const)('%s rejects %j with %s and leaves state unchanged', async (name, args, expectedCode) => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registrations } = registerWithFake(controller);
    const before = controller.getState();

    const { parsed } = await callTool(registrations, name, args);

    expect((parsed as { ok: boolean }).ok).toBe(false);
    expect((parsed as { error: { code: string } }).error.code).toBe(expectedCode);
    expect(controller.getState()).toBe(before);
    expect(controller.getState().activity).toEqual([]);
  });
});

describe('tool handlers: first mutation logs one activity entry, repeats log none', () => {
  it('record_acquisition_details records once, then rejects re-recording a resolved acquisition', async () => {
    // First call resolves AAPL's MISSING acquisition (1 activity entry).
    // The provenance guard then makes a second identical call reject with
    // `invalid_input` -- no new activity, listener still called once -- since
    // the tool resolves missing facts and never overwrites resolved ones.
    const controller = createReturnReadyController({ now: fixedNow });
    const { registrations } = registerWithFake(controller);
    const listener = vi.fn();
    controller.subscribe(listener);

    const first = await callTool(registrations, 'record_acquisition_details', AAPL_ACQUISITION_ARGS);
    expect((first.parsed as { ok: true; changed: boolean }).changed).toBe(true);
    expect(controller.getState().activity).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);

    const second = await callTool(registrations, 'record_acquisition_details', AAPL_ACQUISITION_ARGS);
    expect((second.parsed as { ok: boolean }).ok).toBe(false);
    expect((second.parsed as { error: { code: string } }).error.code).toBe('invalid_input');
    expect(controller.getState().activity).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reconcile_investment_evidence is idempotent on repeat calls', async () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registrations } = registerWithFake(controller);
    const listener = vi.fn();
    controller.subscribe(listener);

    const first = await callTool(registrations, 'reconcile_investment_evidence', { eventIds: ['evt-msft'] });
    expect((first.parsed as { ok: true; changed: boolean }).changed).toBe(true);
    expect(controller.getState().activity).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);

    const second = await callTool(registrations, 'reconcile_investment_evidence', { eventIds: ['evt-msft'] });
    expect((second.parsed as { ok: true; changed: boolean }).changed).toBe(false);
    expect(controller.getState().activity).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('generate_review_pack is idempotent on repeat calls once unblocked', async () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registrations } = registerWithFake(controller);

    await callTool(registrations, 'record_acquisition_details', AAPL_ACQUISITION_ARGS);
    await callTool(registrations, 'reconcile_investment_evidence', {
      eventIds: ['evt-msft', 'evt-aapl', 'evt-btc'],
    });
    const activityBeforeGenerate = controller.getState().activity.length;

    const listener = vi.fn();
    controller.subscribe(listener);

    const first = await callTool(registrations, 'generate_review_pack', {});
    expect((first.parsed as { ok: true; changed: boolean }).changed).toBe(true);
    expect((first.parsed as { ok: true; value: { packId: string } }).value.packId).toBe('review-pack-2026');
    expect(controller.getState().activity).toHaveLength(activityBeforeGenerate + 1);
    expect(listener).toHaveBeenCalledTimes(1);

    const second = await callTool(registrations, 'generate_review_pack', {});
    expect((second.parsed as { ok: true; changed: boolean }).changed).toBe(false);
    expect(controller.getState().activity).toHaveLength(activityBeforeGenerate + 1);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('tool handlers: blocked generate_review_pack', () => {
  it('returns a structured blocked error and opens the validation modal, without mutating state', async () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registrations } = registerWithFake(controller);
    const before = controller.getState();

    expect(controller.isValidationModalOpen()).toBe(false);

    const { parsed } = await callTool(registrations, 'generate_review_pack', {});

    expect(parsed).toEqual({
      ok: false,
      changed: false,
      error: { code: 'blocked', message: expect.any(String) },
    });
    expect(controller.isValidationModalOpen()).toBe(true);
    expect(controller.getState()).toBe(before);
  });
});

describe('tool handlers: normalization boundary', () => {
  it('list_investment_evidence never includes raw evidence text', async () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registrations } = registerWithFake(controller);
    const rawTexts = createDemoReturnState()
      .evidence.map((item) => item.rawText)
      .filter((text) => text.length > 0);

    const { raw, parsed } = await callTool(registrations, 'list_investment_evidence', {});

    for (const item of (parsed as { value: { evidence: unknown[] } }).value.evidence) {
      expect(item).not.toHaveProperty('rawText');
    }
    for (const rawText of rawTexts) {
      expect(raw).not.toContain(rawText);
    }
  });
});

describe('tool handlers: output budget', () => {
  it('every tool output is valid JSON of at most 1500 characters, across typical calls', async () => {
    const controller = createReturnReadyController({ now: fixedNow });
    const { registrations } = registerWithFake(controller);

    await callTool(registrations, 'reconcile_investment_evidence', {
      eventIds: ['evt-msft', 'evt-aapl', 'evt-btc'],
    });

    const calls: Array<[string, unknown]> = [
      ['get_return_readiness', {}],
      ['list_investment_evidence', {}],
      ['reconcile_investment_evidence', { eventIds: ['evt-msft'] }],
      ['record_acquisition_details', AAPL_ACQUISITION_ARGS],
      ['validate_review_pack', {}],
      ['generate_review_pack', {}],
    ];

    for (const [name, args] of calls) {
      const { raw } = await callTool(registrations, name, args);
      expect(() => JSON.parse(raw)).not.toThrow();
      expect(raw.length).toBeLessThanOrEqual(1500);
    }
  });

  it('serializeToolResult falls back to a small, valid output_too_large error rather than slicing JSON', () => {
    const oversized: Result<{ blob: string }> = {
      ok: true,
      changed: false,
      value: { blob: 'x'.repeat(2000) },
    };

    const output = serializeToolResult(oversized);

    expect(output.length).toBeLessThanOrEqual(1500);
    const parsed = JSON.parse(output) as { ok: boolean; error: { code: string } };
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe('output_too_large');
  });
});
