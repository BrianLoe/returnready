/// <reference types="webmcp-types" />

import type { Currency, DeductionInput, DisposalInput, Result } from '../domain/model';
import type { AcquisitionInput, ReturnReadyController } from '../application/returnReadyController';
import {
  generateReviewPackSchema,
  getReturnDraftSchema,
  recordAcquisitionDetailsSchema,
  recordDeductionsSchema,
  recordDisposalsSchema,
  validateReviewPackSchema,
} from './schemas';

const MAX_OUTPUT = 1500;
const DEDUCTION_KEYS = ['sourceRecordId', 'category', 'description', 'periodStart', 'periodEnd', 'quantity', 'unit', 'claimAmountMinor', 'currency', 'sourceLabel'] as const;
const DISPOSAL_KEYS = ['sourceRecordId', 'assetType', 'symbol', 'quantity', 'acquisitionDate', 'acquisitionUnitPriceMinor', 'acquisitionCurrency', 'disposalDate', 'proceedsMinor', 'currency', 'brokerageMinor', 'feeMinor', 'sourceLabel'] as const;

type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };
type OutputTooLarge = { ok: false; changed: false; error: { code: 'output_too_large'; message: string } };

export function serializeToolResult<T>(result: Result<T> | OutputTooLarge): string {
  const serialized = JSON.stringify(result);
  if (serialized.length <= MAX_OUTPUT) return serialized;
  return JSON.stringify({ ok: false, changed: false, error: { code: 'output_too_large', message: 'Result exceeded the tool output limit.' } });
}

function invalid<T>(message: string): Result<T> {
  return { ok: false, changed: false, error: { code: 'invalid_input', message } };
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unknownKey(value: Record<string, unknown>, allowed: readonly string[]): string | null {
  return Object.keys(value).find((key) => !allowed.includes(key)) ?? null;
}

function emptyArgs(raw: unknown): ParseResult<void> {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (!object(raw)) return { ok: false, message: 'Arguments must be an object.' };
  const key = unknownKey(raw, []);
  return key ? { ok: false, message: `Unexpected field: ${key}` } : { ok: true, value: undefined };
}

function text(value: unknown, name: string, max: number): ParseResult<string> {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) return { ok: false, message: `${name} must be 1-${max} characters.` };
  return { ok: true, value };
}

function positive(value: unknown, name: string, integer = false): ParseResult<number> {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || (integer && !Number.isSafeInteger(value))) {
    return { ok: false, message: `${name} must be a positive ${integer ? 'safe integer' : 'finite number'}.` };
  }
  return { ok: true, value };
}

function date(value: unknown, name: string): ParseResult<string> {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: false, message: `${name} must be YYYY-MM-DD.` };
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return { ok: false, message: `${name} must be a real date.` };
  return { ok: true, value };
}

function currency(value: unknown, name: string): ParseResult<Currency> {
  return value === 'AUD' || value === 'USD' ? { ok: true, value } : { ok: false, message: `${name} must be AUD or USD.` };
}

function parseDeduction(value: unknown): ParseResult<DeductionInput> {
  if (!object(value)) return { ok: false, message: 'Each deduction must be an object.' };
  const extra = unknownKey(value, DEDUCTION_KEYS);
  if (extra) return { ok: false, message: `Unexpected deduction field: ${extra}` };
  const id = text(value.sourceRecordId, 'sourceRecordId', 64); if (!id.ok) return id;
  const description = text(value.description, 'description', 120); if (!description.ok) return description;
  const start = date(value.periodStart, 'periodStart'); if (!start.ok) return start;
  const end = date(value.periodEnd, 'periodEnd'); if (!end.ok) return end;
  const quantity = positive(value.quantity, 'quantity'); if (!quantity.ok) return quantity;
  const source = text(value.sourceLabel, 'sourceLabel', 120); if (!source.ok) return source;
  if (value.category !== 'work-from-home' && value.category !== 'other-work-related') return { ok: false, message: 'category is unsupported.' };
  if (value.unit !== 'hours' && value.unit !== 'AUD') return { ok: false, message: 'unit is unsupported.' };
  if (value.currency !== 'AUD') return { ok: false, message: 'currency must be AUD.' };
  let claimAmountMinor: number | undefined;
  if (value.claimAmountMinor !== undefined) { const amount = positive(value.claimAmountMinor, 'claimAmountMinor', true); if (!amount.ok) return amount; claimAmountMinor = amount.value; }
  return { ok: true, value: { sourceRecordId: id.value, category: value.category, description: description.value, periodStart: start.value, periodEnd: end.value, quantity: quantity.value, unit: value.unit, ...(claimAmountMinor === undefined ? {} : { claimAmountMinor }), currency: 'AUD', sourceLabel: source.value } };
}

function parseDisposal(value: unknown): ParseResult<DisposalInput> {
  if (!object(value)) return { ok: false, message: 'Each disposal must be an object.' };
  const extra = unknownKey(value, DISPOSAL_KEYS); if (extra) return { ok: false, message: `Unexpected disposal field: ${extra}` };
  const id = text(value.sourceRecordId, 'sourceRecordId', 64); if (!id.ok) return id;
  const symbol = text(value.symbol, 'symbol', 12); if (!symbol.ok || !/^[A-Z0-9.-]{1,12}$/.test(symbol.value)) return { ok: false, message: 'symbol must be uppercase and 1-12 characters.' };
  const quantity = positive(value.quantity, 'quantity'); if (!quantity.ok) return quantity;
  const disposalDate = date(value.disposalDate, 'disposalDate'); if (!disposalDate.ok) return disposalDate;
  const proceeds = positive(value.proceedsMinor, 'proceedsMinor', true); if (!proceeds.ok) return proceeds;
  const disposalCurrency = currency(value.currency, 'currency'); if (!disposalCurrency.ok) return disposalCurrency;
  const source = text(value.sourceLabel, 'sourceLabel', 120); if (!source.ok) return source;
  if (value.assetType !== 'foreign-share' && value.assetType !== 'crypto') return { ok: false, message: 'assetType is unsupported.' };
  const optionalMinor = (key: 'brokerageMinor' | 'feeMinor'): ParseResult<number | undefined> => value[key] === undefined ? { ok: true, value: undefined } : positive(value[key], key, true);
  const brokerage = optionalMinor('brokerageMinor'); if (!brokerage.ok) return brokerage;
  const fee = optionalMinor('feeMinor'); if (!fee.ok) return fee;
  const acquisitionValues = [value.acquisitionDate, value.acquisitionUnitPriceMinor, value.acquisitionCurrency];
  const supplied = acquisitionValues.filter((item) => item !== undefined).length;
  if (supplied !== 0 && supplied !== 3) return { ok: false, message: 'Acquisition fields must be supplied together.' };
  let acquisition: Pick<DisposalInput, 'acquisitionDate' | 'acquisitionUnitPriceMinor' | 'acquisitionCurrency'> = {};
  if (supplied === 3) {
    const acquisitionDate = date(value.acquisitionDate, 'acquisitionDate'); if (!acquisitionDate.ok) return acquisitionDate;
    const price = positive(value.acquisitionUnitPriceMinor, 'acquisitionUnitPriceMinor', true); if (!price.ok) return price;
    const acquisitionCurrency = currency(value.acquisitionCurrency, 'acquisitionCurrency'); if (!acquisitionCurrency.ok) return acquisitionCurrency;
    acquisition = { acquisitionDate: acquisitionDate.value, acquisitionUnitPriceMinor: price.value, acquisitionCurrency: acquisitionCurrency.value };
  }
  return { ok: true, value: { sourceRecordId: id.value, assetType: value.assetType, symbol: symbol.value, quantity: quantity.value, ...acquisition, disposalDate: disposalDate.value, proceedsMinor: proceeds.value, currency: disposalCurrency.value, ...(brokerage.value === undefined ? {} : { brokerageMinor: brokerage.value }), ...(fee.value === undefined ? {} : { feeMinor: fee.value }), sourceLabel: source.value } };
}

function parseBatch<T>(raw: unknown, parser: (value: unknown) => ParseResult<T>): ParseResult<T[]> {
  if (!object(raw)) return { ok: false, message: 'Arguments must be an object.' };
  const extra = unknownKey(raw, ['entries']); if (extra) return { ok: false, message: `Unexpected field: ${extra}` };
  if (!Array.isArray(raw.entries) || raw.entries.length < 1 || raw.entries.length > 20) return { ok: false, message: 'entries must contain 1-20 items.' };
  const parsed: T[] = [];
  for (const item of raw.entries) { const result = parser(item); if (!result.ok) return result; parsed.push(result.value); }
  return { ok: true, value: parsed };
}

function parseAcquisition(raw: unknown): ParseResult<AcquisitionInput> {
  if (!object(raw)) return { ok: false, message: 'Arguments must be an object.' };
  const extra = unknownKey(raw, ['eventId', 'acquisitionDate', 'unitPrice', 'currency']); if (extra) return { ok: false, message: `Unexpected field: ${extra}` };
  const id = text(raw.eventId, 'eventId', 80); if (!id.ok) return id;
  const acquisitionDate = date(raw.acquisitionDate, 'acquisitionDate'); if (!acquisitionDate.ok) return acquisitionDate;
  const price = positive(raw.unitPrice, 'unitPrice'); if (!price.ok) return price;
  const acquisitionCurrency = currency(raw.currency, 'currency'); if (!acquisitionCurrency.ok) return acquisitionCurrency;
  return { ok: true, value: { eventId: id.value, acquisitionDate: acquisitionDate.value, unitPrice: price.value, currency: acquisitionCurrency.value } };
}

function tools(controller: ReturnReadyController): WebMCP.ModelContextTool[] {
  return [
    { name: 'get_return_draft', title: 'Get return draft', description: 'Reads the current sparse return draft, issue counts, and whether the review pack can be generated. Does not calculate tax or lodge a return.', inputSchema: getReturnDraftSchema, annotations: { readOnlyHint: true, untrustedContentHint: false }, async execute(raw) { const args = emptyArgs(raw); return serializeToolResult(args.ok ? { ok: true, changed: false, value: controller.getReturnDraft() } : invalid(args.message)); } },
    { name: 'record_deductions', title: 'Record deductions', description: 'Records structured deduction evidence interpreted by Codex from synthetic attachments. Accepts facts and a display-safe source label, never file contents or paths.', inputSchema: recordDeductionsSchema, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(raw) { const args = parseBatch(raw, parseDeduction); return serializeToolResult(args.ok ? controller.recordDeductions(args.value, 'agent') : invalid(args.message)); } },
    { name: 'record_disposals', title: 'Record disposals', description: 'Records structured foreign-share or crypto disposal facts interpreted by Codex from synthetic attachments. Does not calculate gains or tax.', inputSchema: recordDisposalsSchema, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(raw) { const args = parseBatch(raw, parseDisposal); return serializeToolResult(args.ok ? controller.recordDisposals(args.value, 'agent') : invalid(args.message)); } },
    { name: 'record_acquisition_details', title: 'Record acquisition details', description: 'Records user-attested historical acquisition details for one disposal that is missing them. Documentary facts cannot be overwritten.', inputSchema: recordAcquisitionDetailsSchema, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(raw) { const args = parseAcquisition(raw); return serializeToolResult(args.ok ? controller.recordAcquisitionDetails(args.value, 'agent') : invalid(args.message)); } },
    { name: 'validate_review_pack', title: 'Validate review pack', description: 'Derives blockers and warnings from the current draft and reports whether a review pack can be generated. Does not calculate tax.', inputSchema: validateReviewPackSchema, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(raw) { const args = emptyArgs(raw); return serializeToolResult(args.ok ? controller.validateReviewPack('agent') : invalid(args.message)); } },
    { name: 'generate_review_pack', title: 'Generate review pack', description: 'Generates an evidence review pack when no blockers remain. Warnings remain visible. Does not lodge a return or calculate tax.', inputSchema: generateReviewPackSchema, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(raw) { const args = emptyArgs(raw); if (!args.ok) return serializeToolResult(invalid(args.message)); const result = controller.generateReviewPack('agent'); if (!result.ok) return serializeToolResult(result); return serializeToolResult({ ok: true, changed: result.changed, value: { packId: result.value.pack.id, warnings: result.value.pack.unresolvedWarnings.map((issue) => ({ code: issue.code, recordId: issue.eventId })) } }); } },
  ];
}

export interface RegisterToolsResult { available: boolean; controller: AbortController }

export function registerReturnReadyTools(controller: ReturnReadyController): RegisterToolsResult {
  const abortController = new AbortController();
  const modelContext = typeof document === 'undefined' ? undefined : document.modelContext;
  if (!modelContext || typeof modelContext.registerTool !== 'function') return { available: false, controller: abortController };
  for (const tool of tools(controller)) {
    try { modelContext.registerTool(tool, { signal: abortController.signal }).catch(() => undefined); } catch { /* Keep the manual app available and attempt every registration. */ }
  }
  return { available: true, controller: abortController };
}
