import type { DeductionEntry } from '../domain/model';

function dollars(minor: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(minor / 100);
}

export function DeductionList({ entries }: { entries: readonly DeductionEntry[] }) {
  if (entries.length === 0) return <p className="empty-state">No deduction evidence recorded yet.</p>;
  return <div className="draft-entry-list">{entries.map((entry) => (
    <article key={entry.id} className="draft-entry" aria-label={entry.description}>
      <h3>{entry.description}</h3>
      <dl className="investment-facts">
        <div><dt>Category</dt><dd>{entry.category}</dd></div>
        <div><dt>Evidence period</dt><dd>{entry.periodStart} to {entry.periodEnd}</dd></div>
        <div><dt>Evidence quantity</dt><dd>{entry.quantity} {entry.unit}</dd></div>
        <div><dt>Method</dt><dd>{entry.calculationMethod === 'fixed-rate' ? 'Fixed rate' : 'Actual cost'}</dd></div>
        {entry.rateMinorPerHour !== undefined && <div><dt>Calculation</dt><dd>{entry.quantity} hours × {dollars(entry.rateMinorPerHour)}</dd></div>}
        {entry.claimAmountMinor !== undefined && <div><dt>Deduction amount</dt><dd>{dollars(entry.claimAmountMinor)}</dd></div>}
        <div><dt>Source</dt><dd>{entry.sourceLabel}</dd></div>
        <div><dt>Provenance</dt><dd>{entry.provenance}</dd></div>
      </dl>
    </article>
  ))}</div>;
}
