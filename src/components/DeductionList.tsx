import type { DeductionEntry } from '../domain/model';

export function DeductionList({ entries }: { entries: readonly DeductionEntry[] }) {
  if (entries.length === 0) return <p className="empty-state">No deduction evidence recorded yet.</p>;
  return <div className="draft-entry-list">{entries.map((entry) => (
    <article key={entry.id} className="draft-entry" aria-label={entry.description}>
      <h3>{entry.description}</h3>
      <dl className="investment-facts">
        <div><dt>Category</dt><dd>{entry.category}</dd></div>
        <div><dt>Evidence period</dt><dd>{entry.periodStart} to {entry.periodEnd}</dd></div>
        <div><dt>Evidence quantity</dt><dd>{entry.quantity} {entry.unit}</dd></div>
        <div><dt>Source</dt><dd>{entry.sourceLabel}</dd></div>
        <div><dt>Provenance</dt><dd>{entry.provenance}</dd></div>
      </dl>
    </article>
  ))}</div>;
}
