const date = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;
const positive = { type: 'number', exclusiveMinimum: 0 } as const;
const positiveMinor = { type: 'integer', minimum: 1 } as const;
const currency = { type: 'string', enum: ['AUD', 'USD'] } as const;

export const emptyInputSchema = { type: 'object', properties: {}, additionalProperties: false } as const;
export const getReturnDraftSchema = emptyInputSchema;

export const recordDeductionsSchema = {
  type: 'object',
  properties: {
    entries: {
      type: 'array', minItems: 1, maxItems: 20,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          sourceRecordId: { type: 'string', minLength: 1, maxLength: 64 },
          category: { type: 'string', enum: ['work-from-home', 'other-work-related'] },
          description: { type: 'string', minLength: 1, maxLength: 120 },
          periodStart: date, periodEnd: date, quantity: positive,
          unit: { type: 'string', enum: ['hours', 'AUD'] },
          calculationMethod: { type: 'string', enum: ['fixed-rate'] },
          currency: { type: 'string', enum: ['AUD'] },
          sourceLabel: { type: 'string', minLength: 1, maxLength: 120 },
        },
        required: ['sourceRecordId', 'category', 'description', 'periodStart', 'periodEnd', 'quantity', 'unit', 'calculationMethod', 'currency', 'sourceLabel'],
      },
    },
  },
  required: ['entries'], additionalProperties: false,
} as const;

export const recordDisposalsSchema = {
  type: 'object',
  properties: {
    entries: {
      type: 'array', minItems: 1, maxItems: 20,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          sourceRecordId: { type: 'string', minLength: 1, maxLength: 64 },
          assetType: { type: 'string', enum: ['foreign-share', 'crypto'] },
          symbol: { type: 'string', pattern: '^[A-Z0-9.-]{1,12}$' },
          quantity: positive,
          acquisitionDate: date,
          acquisitionUnitPriceMinor: positiveMinor,
          acquisitionCurrency: currency,
          disposalDate: date,
          proceedsMinor: positiveMinor,
          currency,
          brokerageMinor: positiveMinor,
          feeMinor: positiveMinor,
          sourceLabel: { type: 'string', minLength: 1, maxLength: 120 },
        },
        required: ['sourceRecordId', 'assetType', 'symbol', 'quantity', 'disposalDate', 'proceedsMinor', 'currency', 'sourceLabel'],
      },
    },
  },
  required: ['entries'], additionalProperties: false,
} as const;

export const recordAcquisitionDetailsSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    eventId: { type: 'string', minLength: 1, maxLength: 80 },
    acquisitionDate: date,
    unitPrice: positive,
    currency,
  },
  required: ['eventId', 'acquisitionDate', 'unitPrice', 'currency'],
} as const;

export const validateReviewPackSchema = emptyInputSchema;
export const generateReviewPackSchema = emptyInputSchema;
