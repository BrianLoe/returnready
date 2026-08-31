import type { EvidenceItem, NormalizedEvidenceSummary } from './model';

/**
 * The normalization boundary between raw imported evidence and anything a
 * browser agent (or any WebMCP tool output) can see.
 *
 * This is an ALLOW-LIST: the returned object is constructed field-by-field
 * from only the fields a caller is permitted to see. It never spreads the
 * source `EvidenceItem` and never deletes fields from a copy, so a future
 * field added to `EvidenceItem` (raw or otherwise) cannot leak through here
 * by accident.
 *
 * `EvidenceItem.rawText` — untrusted raw source prose that may contain
 * hostile embedded instructions — is deliberately never read here.
 */
export function normalizeEvidence(item: EvidenceItem): NormalizedEvidenceSummary {
  return {
    id: item.id,
    sourceType: item.sourceType,
    displayName: item.displayName,
    synthetic: item.synthetic,
    facts: structuredClone(item.facts),
    linkedEventIds: [...item.linkedEventIds],
    status: item.status,
  };
}
