// Investment-evidence reconciliation.
//
// This module owns the single source of truth for "which readiness issues
// currently apply to an investment event" (`deriveIssuesForEvents`) and for
// linking evidence to events by explicit provenance references rather than
// by symbol or fixed id. Both are reused by `acquisition.ts` and
// `validation.ts` so the matching logic never has to be re-derived (or
// re-diverge) elsewhere.

import type {
  ActivityEntry,
  Actor,
  EventStatus,
  InvestmentEvent,
  InvestmentsStatus,
  Result,
  ReturnState,
  ValidationIssue,
} from './model';

/**
 * Structural deep-equality for plain JSON-shaped domain values (no
 * functions, no `Date` instances, no cycles). Used to decide whether a
 * mutation actually changed observable state, so an exact repeat call can be
 * reported as `changed: false` without adding a duplicate activity entry.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bRecord, key)) return false;
    if (!deepEqual(aRecord[key], bRecord[key])) return false;
  }
  return true;
}

/**
 * The single source of truth for "which readiness issues currently apply to
 * this event", derived purely from the event's own facts. This NEVER
 * branches on symbol, event id, or evidence id -- only on the presence and
 * shape of fields already declared on `InvestmentEvent`. Reused by
 * reconciliation (scoped to the touched events), attestation (scoped to the
 * one named event), and validation (all events).
 */
export function deriveIssuesForEvents(events: readonly InvestmentEvent[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const event of events) {
    if (event.acquisition.date === undefined || event.acquisition.unitPriceMinor === undefined) {
      issues.push({
        id: `issue-${event.id}-missing-acquisition`,
        code: 'missing-acquisition',
        severity: 'blocker',
        eventId: event.id,
        message:
          'Acquisition date and unit cost are required before this disposal can be evidence-complete for review.',
        resolutionFields: ['acquisitionDate', 'unitPrice', 'currency'],
        resolved: false,
      });
    }

    if (event.assetClass === 'crypto' && event.disposal.feeMinor === undefined) {
      issues.push({
        id: `issue-${event.id}-missing-crypto-fee`,
        code: 'missing-crypto-fee',
        severity: 'warning',
        eventId: event.id,
        message:
          'Transaction fee evidence is missing for this crypto disposal; it remains a visible warning and does not block review.',
        resolutionFields: ['feeMinor'],
        resolved: false,
      });
    }
  }
  return issues;
}

/**
 * The single source of truth for "what status does one event have, given
 * exactly these issues". Exported so callers that need a status derived
 * from freshly-computed issues -- without first persisting them onto
 * `state` -- (e.g. a read-only readiness summary) can reuse this instead of
 * re-deriving the same threshold rule.
 */
export function deriveStatusFromIssues(issues: readonly ValidationIssue[]): EventStatus {
  if (issues.some((issue) => issue.severity === 'blocker')) return 'action-required';
  if (issues.some((issue) => issue.severity === 'warning')) return 'warning';
  return 'evidence-complete-for-review';
}

/**
 * The single source of truth for rolling a set of per-event statuses up
 * into one investments-section status. Exported (alongside
 * `deriveStatusFromIssues`) so callers with freshly-derived, not-yet-
 * persisted per-event statuses can reuse this rollup rule instead of
 * re-deriving it.
 */
export function deriveInvestmentsStatusFromEventStatuses(
  statuses: readonly EventStatus[],
): InvestmentsStatus {
  if (statuses.some((status) => status === 'action-required')) return 'action-required';
  if (statuses.some((status) => status === 'warning')) return 'warning';
  if (statuses.length > 0 && statuses.every((status) => status === 'evidence-complete-for-review')) {
    return 'evidence-complete-for-review';
  }
  return 'unreviewed';
}

function deriveInvestmentsStatus(events: readonly InvestmentEvent[]): InvestmentsStatus {
  return deriveInvestmentsStatusFromEventStatuses(events.map((event) => event.status));
}

/**
 * Rolls a set of events up to one investments-section status directly from a
 * set of freshly-derived issues (not from each event's persisted `status`).
 * Shared by the controller's read-only `getReturnReadiness` and the review
 * pack's `buildPack` so both derive the section status identically -- fresh
 * from the same issues -- rather than re-implementing the two-step rollup.
 */
export function deriveInvestmentsStatusFromIssues(
  events: readonly InvestmentEvent[],
  issues: readonly ValidationIssue[],
): InvestmentsStatus {
  const statuses = events.map((event) =>
    deriveStatusFromIssues(issues.filter((issue) => issue.eventId === event.id)),
  );
  return deriveInvestmentsStatusFromEventStatuses(statuses);
}

/**
 * Replaces `state.issues` entries for exactly the given event ids with a
 * fresh derivation from those events' current facts, then recomputes the
 * dependent aggregate fields (`blockerCount`, `warningCount`,
 * `investmentsStatus`). Mutates `state` in place -- callers clone first.
 * Returns the fresh issues for the touched events only.
 */
export function upsertIssuesForEvents(
  state: ReturnState,
  eventIds: readonly string[],
): ValidationIssue[] {
  const touchedIds = new Set(eventIds);
  const touchedEvents = state.events.filter((event) => touchedIds.has(event.id));
  const freshForTouched = deriveIssuesForEvents(touchedEvents);

  state.issues = [
    ...state.issues.filter((issue) => !touchedIds.has(issue.eventId)),
    ...freshForTouched,
  ];

  for (const event of touchedEvents) {
    const eventIssues = freshForTouched.filter((issue) => issue.eventId === event.id);
    event.issueIds = eventIssues.map((issue) => issue.id);
    event.status = deriveStatusFromIssues(eventIssues);
  }

  state.blockerCount = state.issues.filter((issue) => issue.severity === 'blocker').length;
  state.warningCount = state.issues.filter((issue) => issue.severity === 'warning').length;
  state.investmentsStatus = deriveInvestmentsStatus(state.events);

  return freshForTouched;
}

/**
 * Links `event` to every evidence record that references it by explicit
 * provenance: disposal-export rows keyed by `eventId`, and FX rate rows
 * keyed by (date, currency) pairs drawn from the event's own acquisition and
 * disposal facts. Purely data-driven: no branch here ever inspects a symbol
 * or a specific event/evidence id literal.
 */
export function linkEvidenceForEvent(state: ReturnState, event: InvestmentEvent): void {
  const linked = new Set(event.linkedEvidenceIds);

  for (const evidence of state.evidence) {
    let matches = false;

    if (evidence.facts.kind === 'broker-export') {
      matches = evidence.facts.disposals.some((disposal) => disposal.eventId === event.id);
    } else if (evidence.facts.kind === 'crypto-export') {
      matches = evidence.facts.disposals.some((disposal) => disposal.eventId === event.id);
    } else if (evidence.facts.kind === 'fx-rates') {
      const wantedPairs: Array<{ date: string; currency: string }> = [
        { date: event.disposal.date, currency: event.disposal.currency },
      ];
      if (event.acquisition.date !== undefined) {
        wantedPairs.push({ date: event.acquisition.date, currency: event.acquisition.currency });
      }
      matches = evidence.facts.rates.some((rate) =>
        wantedPairs.some((pair) => pair.date === rate.date && pair.currency === rate.currency),
      );
    }

    if (matches) {
      linked.add(evidence.id);
      if (!evidence.linkedEventIds.includes(event.id)) {
        evidence.linkedEventIds.push(event.id);
      }
    }
  }

  event.linkedEvidenceIds = [...linked];
}

export function buildActivityEntry(
  state: ReturnState,
  actor: Actor,
  action: string,
  description: string,
  recordId: string,
  now: () => string,
): ActivityEntry {
  return {
    id: `activity-${state.activity.length + 1}`,
    timestamp: now(),
    actor,
    action,
    description,
    recordId,
  };
}

export function reconcileEvents(
  state: ReturnState,
  eventIds: readonly string[],
  actor: Actor,
  now: () => string,
): Result<{
  state: ReturnState;
  reconciledEventIds: readonly string[];
  issues: readonly ValidationIssue[];
}> {
  if (!Array.isArray(eventIds) || eventIds.length === 0) {
    return {
      ok: false,
      error: { code: 'invalid_input', message: 'reconcileEvents requires at least one event id.' },
      changed: false,
    };
  }

  const dedupedIds = [...new Set(eventIds)];
  const knownIds = new Set(state.events.map((event) => event.id));
  const unknownIds = dedupedIds.filter((id) => !knownIds.has(id));
  if (unknownIds.length > 0) {
    return {
      ok: false,
      error: { code: 'not_found', message: `Unknown event id(s): ${unknownIds.join(', ')}` },
      changed: false,
    };
  }

  const clone = structuredClone(state);

  for (const eventId of dedupedIds) {
    const event = clone.events.find((candidate) => candidate.id === eventId);
    if (event) {
      linkEvidenceForEvent(clone, event);
    }
  }
  const issuesForTouched = upsertIssuesForEvents(clone, dedupedIds);

  const changed = !deepEqual(clone, state);

  if (changed) {
    clone.activity.push(
      buildActivityEntry(
        clone,
        actor,
        'reconcile-investment-evidence',
        `Reconciled ${dedupedIds.length} investment event(s): ${dedupedIds.join(', ')}.`,
        dedupedIds.join(','),
        now,
      ),
    );
  }

  return {
    ok: true,
    changed,
    value: { state: clone, reconciledEventIds: dedupedIds, issues: issuesForTouched },
  };
}
