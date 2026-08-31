// Renders a generated `ReviewPack` for accountant review. The heading text
// is UI-computed from `pack.unresolvedWarnings.length` (there is no
// "generated with unresolved warning" string on the domain pack itself);
// everything else is read verbatim from the pack.

import type { InvestmentEvent } from '../domain/model';
import type { ReviewPack } from '../domain/reviewPack';

function symbolFor(events: readonly InvestmentEvent[], eventId: string): string {
  return events.find((event) => event.id === eventId)?.symbol ?? eventId;
}

export function ReviewPackView({
  pack,
  events,
}: {
  pack: ReviewPack;
  events: readonly InvestmentEvent[];
}) {
  const hasUnresolvedWarnings = pack.unresolvedWarnings.length > 0;

  return (
    <section id="review-pack-generated" aria-labelledby="review-pack-heading" className="review-pack">
      <h2 id="review-pack-heading">
        {hasUnresolvedWarnings ? 'Review pack generated with unresolved warning' : 'Review pack generated'}
      </h2>
      <p>Generated {pack.generatedAt}</p>

      <section aria-labelledby="review-pack-events-heading">
        <h3 id="review-pack-events-heading">Investment events</h3>
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
            {pack.eventReviewTable.map((row) => (
              <tr key={row.eventId}>
                <td>{row.symbol}</td>
                <td>{row.assetClass}</td>
                <td>{row.status}</td>
                <td>{row.acquisitionProvenance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="review-pack-evidence-heading">
        <h3 id="review-pack-evidence-heading">Evidence links</h3>
        <ul>
          {pack.evidenceIndex.map((entry) => (
            <li key={entry.evidenceId}>
              <span>{entry.displayName}</span> ({entry.linkedEventIds.length} linked event(s))
            </li>
          ))}
        </ul>
      </section>

      {hasUnresolvedWarnings && (
        <section aria-labelledby="review-pack-warnings-heading">
          <h3 id="review-pack-warnings-heading">Unresolved warnings</h3>
          <ul>
            {pack.unresolvedWarnings.map((issue) => (
              <li key={issue.id}>
                <strong>{symbolFor(events, issue.eventId)}</strong> — <span>{issue.message}</span>
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
      <p className="synthetic-marker">Synthetic demo data</p>
    </section>
  );
}
