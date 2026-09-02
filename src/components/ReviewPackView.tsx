// Renders a generated `ReviewPack` for accountant review. The heading text
// is UI-computed from `pack.unresolvedWarnings.length` (there is no
// "generated with unresolved warning" string on the domain pack itself);
// everything else is read verbatim from the pack.

import type { ReviewPack } from '../domain/reviewPack';

function aud(minor: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(minor / 100);
}

function labelFor(pack: ReviewPack, recordId: string): string {
  return pack.disposalReviewTable.find((entry) => `disposal-${entry.sourceRecordId}` === recordId)?.symbol
    ?? pack.deductionEvidence.find((entry) => `deduction-${entry.sourceRecordId}` === recordId)?.description
    ?? pack.eventReviewTable.find((entry) => entry.eventId === recordId)?.symbol
    ?? recordId;
}

export function ReviewPackView({ pack }: { pack: ReviewPack }) {
  const hasUnresolvedWarnings = pack.unresolvedWarnings.length > 0;

  return (
    <section id="review-pack-generated" aria-labelledby="review-pack-heading" className="review-pack">
      <h2 id="review-pack-heading">
        {hasUnresolvedWarnings ? 'Review pack generated with unresolved warning' : 'Review pack generated'}
      </h2>
      <p>Generated {pack.generatedAt}</p>

      {pack.deductionEvidence.length > 0 && <section aria-labelledby="review-pack-deductions-heading">
        <h3 id="review-pack-deductions-heading">Deduction evidence</h3>
        <ul>{pack.deductionEvidence.map((entry) => <li key={entry.sourceRecordId}>{entry.description}: {entry.quantity} {entry.unit}{entry.rateMinorPerHour === undefined ? '' : ` × ${aud(entry.rateMinorPerHour)}`}{entry.claimAmountMinor === undefined ? '' : ` = ${aud(entry.claimAmountMinor)}`} — {entry.sourceLabel} ({entry.provenance})</li>)}</ul>
      </section>}

      {pack.disposalReviewTable.length > 0 && <section aria-labelledby="review-pack-events-heading">
        <h3 id="review-pack-events-heading">Investment disposals</h3>
        <table>
          <thead>
            <tr>
              <th scope="col">Symbol</th>
              <th scope="col">Asset class</th>
              <th scope="col">Status</th>
              <th scope="col">Acquisition provenance</th>
            </tr>
          </thead>
          <tbody>
            {pack.disposalReviewTable.map((row) => (
              <tr key={row.sourceRecordId}>
                <td>{row.symbol}</td>
                <td>{row.assetType}</td>
                <td>{row.status}</td>
                <td>{row.acquisitionProvenance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>}

      {pack.evidenceIndex.length > 0 && <section aria-labelledby="review-pack-evidence-heading">
        <h3 id="review-pack-evidence-heading">Evidence links</h3>
        <ul>
          {pack.evidenceIndex.map((entry) => (
            <li key={entry.evidenceId}>
              <span>{entry.displayName}</span> ({entry.linkedEventIds.length} linked event(s))
            </li>
          ))}
        </ul>
      </section>}

      {hasUnresolvedWarnings && (
        <section aria-labelledby="review-pack-warnings-heading">
          <h3 id="review-pack-warnings-heading">Unresolved warnings</h3>
          <ul>
            {pack.unresolvedWarnings.map((issue) => (
              <li key={issue.id}>
                <strong>{labelFor(pack, issue.eventId)}</strong> — <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="review-pack-assumptions-heading">
        <h3 id="review-pack-assumptions-heading">Assumptions and limitations</h3>
        <ul>
          {pack.assumptionsAndLimitations.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </section>

      <p className="disclaimer">{pack.disclaimer}</p>
    </section>
  );
}
