// Core domain types for ReturnReady.
//
// These types are shared by the fixture repository, the normalization
// boundary, and (in later tasks) domain actions and the WebMCP adapter.
// Keep this module free of behaviour: it defines shape only.

// Type-only, so this mutual reference with `./reviewPack` is fully erased at
// compile time and creates no runtime import cycle. The generated pack is a
// domain fact once produced, so it belongs on `ReturnState` below.
import type { ReviewPack } from './reviewPack';

export type Currency = 'AUD' | 'USD';
export type Severity = 'blocker' | 'warning';
export type Actor = 'human' | 'agent';
export type EventStatus =
  | 'unreviewed'
  | 'action-required'
  | 'evidence-complete-for-review'
  | 'warning';

export type Result<T> =
  | { ok: true; value: T; changed: boolean }
  | {
      ok: false;
      error: { code: 'invalid_input' | 'not_found' | 'blocked'; message: string };
      changed: false;
    };

export interface UserAttestation {
  acquisitionDate: string;
  unitPriceMinor: number;
  currency: Currency;
  provenance: 'user-attested';
}

export interface ValidationIssue {
  id: string;
  code: 'missing-acquisition' | 'missing-crypto-fee';
  severity: Severity;
  eventId: string;
  message: string;
  resolutionFields: readonly string[];
  resolved: boolean;
}

export interface ActivityEntry {
  id: string;
  timestamp: string;
  actor: Actor;
  action: string;
  description: string;
  recordId: string;
}

// --- Evidence model -------------------------------------------------------

export type EvidenceSourceType =
  | 'payg-summary'
  | 'deduction-summary'
  | 'managed-fund-statement'
  | 'broker-export'
  | 'crypto-export'
  | 'fx-rates';

export type EvidenceStatus = 'reconciled' | 'imported';

export interface PaygFacts {
  kind: 'payg-summary';
  grossIncomeMinor: number;
  taxWithheldMinor: number;
  currency: Currency;
}

export interface DeductionFacts {
  kind: 'deduction-summary';
  lineItemCount: number;
  totalMinor: number;
  currency: Currency;
}

export interface ManagedFundFacts {
  kind: 'managed-fund-statement';
  holdingCount: number;
  totalDistributionMinor: number;
  currency: Currency;
}

export interface BrokerDisposalFact {
  eventId: string;
  symbol: string;
  quantity: number;
  disposalDate: string;
  proceedsMinor: number;
  brokerageMinor: number;
  currency: Currency;
  corporateAction: 'none-asserted' | 'unknown';
}

export interface BrokerFacts {
  kind: 'broker-export';
  disposals: readonly BrokerDisposalFact[];
}

export interface CryptoDisposalFact {
  eventId: string;
  symbol: string;
  quantity: number;
  disposalDate: string;
  proceedsMinor: number;
  currency: Currency;
  feeMinor?: number;
}

export interface CryptoFacts {
  kind: 'crypto-export';
  disposals: readonly CryptoDisposalFact[];
}

export interface FxRateFact {
  date: string;
  currency: Currency;
  rateToAud: number;
}

export interface FxFacts {
  kind: 'fx-rates';
  rates: readonly FxRateFact[];
}

export type EvidenceFacts =
  | PaygFacts
  | DeductionFacts
  | ManagedFundFacts
  | BrokerFacts
  | CryptoFacts
  | FxFacts;

export interface EvidenceItem {
  id: string;
  sourceType: EvidenceSourceType;
  displayName: string;
  synthetic: true;
  facts: EvidenceFacts;
  /** Untrusted raw source text/prose. Never expose this beyond the normalization boundary. */
  rawText: string;
  linkedEventIds: string[];
  status: EvidenceStatus;
}

/**
 * The only shape a browser agent may see for an evidence record.
 * Deliberately excludes `rawText` and anything else not on this allow-list.
 */
export interface NormalizedEvidenceSummary {
  id: string;
  sourceType: EvidenceSourceType;
  displayName: string;
  synthetic: true;
  facts: EvidenceFacts;
  linkedEventIds: string[];
  status: EvidenceStatus;
}

// --- Investment event model ------------------------------------------------

export type AssetClass = 'foreign-share' | 'crypto';
export type EventType = 'disposal';

export interface AcquisitionFacts {
  date?: string;
  unitPriceMinor?: number;
  currency: Currency;
  provenance: 'documentary' | 'user-attested' | 'missing';
}

export interface DisposalFacts {
  date: string;
  proceedsMinor: number;
  currency: Currency;
  brokerageMinor?: number;
  feeMinor?: number;
  corporateAction?: 'none-asserted' | 'unknown';
}

export interface InvestmentEvent {
  id: string;
  assetClass: AssetClass;
  symbol: string;
  eventType: EventType;
  synthetic: true;
  quantity: number;
  acquisition: AcquisitionFacts;
  disposal: DisposalFacts;
  currency: Currency;
  linkedEvidenceIds: string[];
  status: EventStatus;
  issueIds: string[];
}

// --- Whole-return state -----------------------------------------------------

export type FixtureSectionStatus = 'previously-reviewed';
export type InvestmentsStatus =
  | 'unreviewed'
  | 'action-required'
  | 'evidence-complete-for-review'
  | 'warning';
export type Step = 'income' | 'deductions' | 'investments' | 'review-pack';

export interface ReturnState {
  incomeStatus: FixtureSectionStatus;
  deductionsStatus: FixtureSectionStatus;
  investmentsStatus: InvestmentsStatus;
  blockerCount: number;
  warningCount: number;
  currentStep: Step;
  reviewPackId: string | null;
  /**
   * The generated review pack, owned by application state (not derived at
   * render time). Non-null whenever `reviewPackId` is set; `null` before any
   * generation and after `reset()` recreates state from the fixture.
   */
  reviewPack: ReviewPack | null;
  evidence: EvidenceItem[];
  events: InvestmentEvent[];
  issues: ValidationIssue[];
  activity: ActivityEntry[];
}
