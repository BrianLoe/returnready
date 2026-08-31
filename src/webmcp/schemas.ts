// Narrow JSON Schemas for the six approved ReturnReady WebMCP tools.
//
// Each schema is deliberately restrictive: `additionalProperties: false`,
// explicit `required` arrays, enums for closed value sets, a pattern for
// the one date field, and numeric constraints for the one price field.
// Schemas alone are not a trust boundary -- `registerTools.ts` re-validates
// every field again inside each tool's `execute` handler -- but a narrow
// schema keeps well-behaved callers from ever sending shapes the handler
// has to reject.
//
// Tool/parameter names and description lengths here are verified against
// the WebMCP output budgets (name <= 30 chars, parameter description
// <= 150 chars, tool description <= 500 chars) by `registerTools.test.ts`.

/** Reused by `registerTools.ts` so the schema enum and handler-side re-validation never drift apart. */
export const EVENT_STATUS_VALUES = [
  'unreviewed',
  'action-required',
  'evidence-complete-for-review',
  'warning',
] as const;

const CURRENCY_ENUM = ['AUD', 'USD'] as const;

const ISO_DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';

/** No parameters: an empty object, and nothing else. */
export const emptyInputSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

export const getReturnReadinessSchema = emptyInputSchema;

export const listInvestmentEvidenceSchema = {
  type: 'object',
  properties: {
    filter: {
      type: 'string',
      enum: [...EVENT_STATUS_VALUES],
      description: 'Optional: restrict results to evidence linked to events at this status.',
    },
  },
  additionalProperties: false,
} as const;

export const reconcileInvestmentEvidenceSchema = {
  type: 'object',
  properties: {
    eventIds: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      minItems: 1,
      uniqueItems: true,
      description: 'Stable investment event IDs to reconcile with their linked evidence.',
    },
  },
  required: ['eventIds'],
  additionalProperties: false,
} as const;

export const recordAcquisitionDetailsSchema = {
  type: 'object',
  properties: {
    eventId: {
      type: 'string',
      minLength: 1,
      description: 'Stable ID of the investment event to update.',
    },
    acquisitionDate: {
      type: 'string',
      pattern: ISO_DATE_PATTERN,
      description: 'Acquisition date as YYYY-MM-DD, strictly before the disposal date.',
    },
    unitPrice: {
      type: 'number',
      exclusiveMinimum: 0,
      description: 'Per-unit acquisition price. Must be a positive number.',
    },
    currency: {
      type: 'string',
      enum: [...CURRENCY_ENUM],
      description: 'Currency of the acquisition price.',
    },
  },
  required: ['eventId', 'acquisitionDate', 'unitPrice', 'currency'],
  additionalProperties: false,
} as const;

export const validateReviewPackSchema = emptyInputSchema;

export const generateReviewPackSchema = emptyInputSchema;
