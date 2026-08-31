// Registers the six approved ReturnReady WebMCP tools against the same
// `ReturnReadyController` the manual UI uses. This module never
// manipulates the DOM and never reimplements a domain/reconciliation rule
// -- every state-changing tool calls straight through to the controller,
// which delegates to the pure domain functions from `src/domain/*`. The
// only work done here is: (1) defensive, field-by-field re-validation of
// tool arguments (schemas alone are not a trust boundary), (2) projecting
// two tools' controller results into concise shapes that fit the output
// budget (see `serializeToolResult` below), and (3) registration lifecycle
// (fail safely when WebMCP is unavailable; clean up via AbortController).

/// <reference types="webmcp-types" />

import type {
  AssetClass,
  EventStatus,
  EvidenceSourceType,
  EvidenceStatus,
  Result,
  ValidationIssue,
} from '../domain/model';
import type {
  AcquisitionSummary,
  ReconcileSummary,
  ReturnReadiness,
  ReturnReadyController,
  ValidationSummary,
} from '../application/returnReadyController';
import {
  EVENT_STATUS_VALUES,
  generateReviewPackSchema,
  getReturnReadinessSchema,
  listInvestmentEvidenceSchema,
  reconcileInvestmentEvidenceSchema,
  recordAcquisitionDetailsSchema,
  validateReviewPackSchema,
} from './schemas';

// --- Output budget enforcement ----------------------------------------------
//
// AGENTS.md and the design spec mandate every individual tool output stay
// within 1,500 characters. Two tools' literal controller results can
// exceed that in ordinary (non-edge-case) use with the demo fixture's full
// evidence set: an unfiltered `list_investment_evidence` and a generated
// `generate_review_pack` (whose controller result embeds the full
// `ReviewPack`, including per-evidence and per-event tables). Rather than
// truncate or slice JSON -- which could silently drop a blocker or warning
// -- both of those two tools' `value` payloads are projected down to the
// concise fields the design spec's "WebMCP Tool Contract" section already
// names for them. `serializeToolResult` is the last-resort safety net for
// any tool: if a serialized result would still exceed the budget, it
// returns a small structured `output_too_large` error instead.

const MAX_TOOL_OUTPUT_LENGTH = 1500;

interface OutputTooLargeError {
  ok: false;
  changed: false;
  error: { code: 'output_too_large'; message: string };
}

type ToolResult<T> = Result<T> | OutputTooLargeError;

export function serializeToolResult<T>(result: ToolResult<T>): string {
  const json = JSON.stringify(result);
  if (json.length <= MAX_TOOL_OUTPUT_LENGTH) return json;

  const fallback: OutputTooLargeError = {
    ok: false,
    changed: false,
    error: {
      code: 'output_too_large',
      message: 'Result exceeded the tool output size limit. Narrow the request and try again.',
    },
  };
  return JSON.stringify(fallback);
}

function invalidInputResult<T>(message: string): Result<T> {
  return { ok: false, changed: false, error: { code: 'invalid_input', message } };
}

// --- Projected output shapes -------------------------------------------------

interface EvidenceListItem {
  id: string;
  sourceType: EvidenceSourceType;
  displayName: string;
  synthetic: true;
  linkedEventIds: readonly string[];
  status: EvidenceStatus;
}

interface EventListItem {
  id: string;
  assetClass: AssetClass;
  symbol: string;
  synthetic: true;
  status: EventStatus;
}

interface ListInvestmentEvidenceValue {
  evidence: readonly EvidenceListItem[];
  events: readonly EventListItem[];
}

interface GenerateReviewPackValue {
  packId: string;
  remainingWarnings: readonly ValidationIssue[];
  message: string;
}

// --- Defensive argument parsing ----------------------------------------------
//
// Re-validates every field independently of the JSON Schema declared on
// each tool: a schema is advisory to the host, not a guaranteed trust
// boundary, so every handler below re-checks types, enums, formats, and
// numeric constraints itself before ever calling the controller. Unknown
// fields, wrong types, and out-of-range values are all rejected here with
// a structured `invalid_input` error and no controller call is made, so
// state is always left unchanged.

type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(obj: Record<string, unknown>, allowed: readonly string[]): string | null {
  const extra = Object.keys(obj).filter((key) => !allowed.includes(key));
  return extra.length > 0 ? `Unexpected field(s): ${extra.join(', ')}` : null;
}

function parseEmptyArgs(raw: unknown): ParseResult<void> {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (!isPlainObject(raw)) return { ok: false, message: 'Arguments must be an object.' };
  const extra = rejectUnknownKeys(raw, []);
  if (extra) return { ok: false, message: extra };
  return { ok: true, value: undefined };
}

function parseListArgs(raw: unknown): ParseResult<EventStatus | undefined> {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (!isPlainObject(raw)) return { ok: false, message: 'Arguments must be an object.' };
  const extra = rejectUnknownKeys(raw, ['filter']);
  if (extra) return { ok: false, message: extra };

  const { filter } = raw;
  if (filter === undefined) return { ok: true, value: undefined };
  if (typeof filter !== 'string' || !(EVENT_STATUS_VALUES as readonly string[]).includes(filter)) {
    return { ok: false, message: 'filter must be one of the known event statuses.' };
  }
  return { ok: true, value: filter as EventStatus };
}

function parseReconcileArgs(raw: unknown): ParseResult<string[]> {
  if (!isPlainObject(raw)) return { ok: false, message: 'Arguments must be an object.' };
  const extra = rejectUnknownKeys(raw, ['eventIds']);
  if (extra) return { ok: false, message: extra };

  const { eventIds } = raw;
  if (!Array.isArray(eventIds) || eventIds.length === 0) {
    return { ok: false, message: 'eventIds must be a non-empty array.' };
  }
  if (!eventIds.every((id): id is string => typeof id === 'string' && id.length > 0)) {
    return { ok: false, message: 'eventIds must contain only non-empty strings.' };
  }
  if (new Set(eventIds).size !== eventIds.length) {
    return { ok: false, message: 'eventIds must not contain duplicate IDs.' };
  }
  return { ok: true, value: eventIds as string[] };
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

interface AcquisitionArgs {
  eventId: string;
  acquisitionDate: string;
  unitPrice: number;
  currency: 'AUD' | 'USD';
}

function parseAcquisitionArgs(raw: unknown): ParseResult<AcquisitionArgs> {
  if (!isPlainObject(raw)) return { ok: false, message: 'Arguments must be an object.' };
  const extra = rejectUnknownKeys(raw, ['eventId', 'acquisitionDate', 'unitPrice', 'currency']);
  if (extra) return { ok: false, message: extra };

  const { eventId, acquisitionDate, unitPrice, currency } = raw;

  if (typeof eventId !== 'string' || eventId.length === 0) {
    return { ok: false, message: 'eventId must be a non-empty string.' };
  }
  if (typeof acquisitionDate !== 'string' || !isValidIsoDate(acquisitionDate)) {
    return { ok: false, message: 'acquisitionDate must be a valid YYYY-MM-DD date.' };
  }
  if (typeof unitPrice !== 'number' || !Number.isFinite(unitPrice) || unitPrice <= 0) {
    return { ok: false, message: 'unitPrice must be a positive finite number.' };
  }
  if (currency !== 'AUD' && currency !== 'USD') {
    return { ok: false, message: 'currency must be AUD or USD.' };
  }

  return { ok: true, value: { eventId, acquisitionDate, unitPrice, currency } };
}

// --- Tool definitions ---------------------------------------------------------

function buildTools(controller: ReturnReadyController): WebMCP.ModelContextTool[] {
  return [
    {
      name: 'get_return_readiness',
      title: 'Get return readiness',
      description:
        'Reads whole-return readiness: section statuses, blocker/warning counts, and whether a review pack can be generated. Read-only. Does not lodge returns or calculate tax.',
      inputSchema: getReturnReadinessSchema,
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      async execute(rawArgs) {
        const parsed = parseEmptyArgs(rawArgs);
        if (!parsed.ok) {
          return serializeToolResult(invalidInputResult<ReturnReadiness>(parsed.message));
        }
        const value = controller.getReturnReadiness();
        return serializeToolResult<ReturnReadiness>({ ok: true, changed: false, value });
      },
    },
    {
      name: 'list_investment_evidence',
      title: 'List investment evidence',
      description:
        'Reads normalized investment evidence and the investment events they may link to, with an optional status filter. Returns stable IDs and normalized fields only, never raw source text.',
      inputSchema: listInvestmentEvidenceSchema,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(rawArgs) {
        const parsed = parseListArgs(rawArgs);
        if (!parsed.ok) {
          return serializeToolResult(invalidInputResult<ListInvestmentEvidenceValue>(parsed.message));
        }
        const filter = parsed.value;
        const evidence = controller.listInvestmentEvidence(filter);
        const events = controller
          .getState()
          .events.filter((event) => filter === undefined || event.status === filter);

        const value: ListInvestmentEvidenceValue = {
          evidence: evidence.map((item) => ({
            id: item.id,
            sourceType: item.sourceType,
            displayName: item.displayName,
            synthetic: true,
            linkedEventIds: item.linkedEventIds,
            status: item.status,
          })),
          events: events.map((event) => ({
            id: event.id,
            assetClass: event.assetClass,
            symbol: event.symbol,
            synthetic: true,
            status: event.status,
          })),
        };
        return serializeToolResult<ListInvestmentEvidenceValue>({ ok: true, changed: false, value });
      },
    },
    {
      name: 'reconcile_investment_evidence',
      title: 'Reconcile investment evidence',
      description:
        'Links named investment events to matching evidence and recomputes their blocking/warning issues. Idempotent: repeated calls make no further change once already reconciled.',
      inputSchema: reconcileInvestmentEvidenceSchema,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(rawArgs) {
        const parsed = parseReconcileArgs(rawArgs);
        if (!parsed.ok) {
          return serializeToolResult(invalidInputResult<ReconcileSummary>(parsed.message));
        }
        const result = controller.reconcileInvestmentEvidence(parsed.value, 'agent');
        return serializeToolResult<ReconcileSummary>(result);
      },
    },
    {
      name: 'record_acquisition_details',
      title: 'Record acquisition details',
      description:
        'Records a user-attested acquisition date, unit price, and currency for one investment event and links matching FX evidence. This is a user attestation, not documentary evidence.',
      inputSchema: recordAcquisitionDetailsSchema,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(rawArgs) {
        const parsed = parseAcquisitionArgs(rawArgs);
        if (!parsed.ok) {
          return serializeToolResult(invalidInputResult<AcquisitionSummary>(parsed.message));
        }
        const result = controller.recordAcquisitionDetails(parsed.value, 'agent');
        return serializeToolResult<AcquisitionSummary>(result);
      },
    },
    {
      name: 'validate_review_pack',
      title: 'Validate review pack',
      description:
        'Re-derives current blocking/warning issues across all investment events and reports whether a review pack can be generated yet. Does not lodge returns or calculate tax.',
      inputSchema: validateReviewPackSchema,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(rawArgs) {
        const parsed = parseEmptyArgs(rawArgs);
        if (!parsed.ok) {
          return serializeToolResult(invalidInputResult<ValidationSummary>(parsed.message));
        }
        const result = controller.validateReviewPack('agent');
        return serializeToolResult<ValidationSummary>(result);
      },
    },
    {
      name: 'generate_review_pack',
      title: 'Generate review pack',
      description:
        'Generates the accountant review pack once no blocking issues remain. Returns the pack ID, remaining warnings, and a completion message. Does not lodge returns or calculate tax.',
      inputSchema: generateReviewPackSchema,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(rawArgs) {
        const parsed = parseEmptyArgs(rawArgs);
        if (!parsed.ok) {
          return serializeToolResult(invalidInputResult<GenerateReviewPackValue>(parsed.message));
        }
        const result = controller.generateReviewPack('agent');
        if (!result.ok) {
          return serializeToolResult<GenerateReviewPackValue>(result);
        }

        const value: GenerateReviewPackValue = {
          packId: result.value.pack.id,
          remainingWarnings: result.value.pack.unresolvedWarnings,
          message: 'Review pack generated for accountant review.',
        };
        return serializeToolResult<GenerateReviewPackValue>({
          ok: true,
          changed: result.changed,
          value,
        });
      },
    },
  ];
}

// --- Registration lifecycle ---------------------------------------------------

export interface RegisterToolsResult {
  /** False when `document.modelContext` is unavailable; the manual UI still works either way. */
  available: boolean;
  /** Abort to unregister all six tools (call on unmount / hot-reload). */
  controller: AbortController;
}

/**
 * Registers the six ReturnReady WebMCP tools against `document.modelContext`,
 * if present. Fails safe: when WebMCP is unavailable, or registration
 * throws or rejects, this never throws back to the caller -- it returns
 * `available: false` (or `available: true` with an aborted-in-place
 * registration attempt already swallowed) and the manual UI keeps working
 * either way. Does not set `exposedTo` (no cross-origin exposure).
 */
export function registerReturnReadyTools(controller: ReturnReadyController): RegisterToolsResult {
  const abortController = new AbortController();
  const modelContext = typeof document === 'undefined' ? undefined : document.modelContext;

  if (!modelContext || typeof modelContext.registerTool !== 'function') {
    return { available: false, controller: abortController };
  }

  const { signal } = abortController;
  for (const tool of buildTools(controller)) {
    try {
      modelContext.registerTool(tool, { signal }).catch(() => {
        // A single tool's async registration failing must not crash the
        // app or block the others; the manual UI remains fully functional
        // regardless of WebMCP registration outcomes.
      });
    } catch {
      // Synchronous failure from the host on this one tool (e.g.
      // `registerTool` throws immediately) must not prevent the remaining
      // tools from attempting registration, and must not crash the app;
      // the manual UI stays functional either way.
    }
  }

  return { available: true, controller: abortController };
}
