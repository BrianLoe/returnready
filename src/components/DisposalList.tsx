import type { DisposalEntry, ValidationIssue } from '../domain/model';
import { deriveStatusFromIssues } from '../domain/reconcile';
import { formatEventStatus } from '../application/ReturnReadyContext';
import { AcquisitionForm } from './AcquisitionForm';

export function DisposalList({ entries, issues }: { entries: readonly DisposalEntry[]; issues: readonly ValidationIssue[] }) {
  if (entries.length === 0) return <p className="empty-state">No investment disposals recorded yet.</p>;
  return <div className="investment-list">{entries.map((entry) => {
    const status = deriveStatusFromIssues(issues.filter((issue) => issue.eventId === entry.id));
    const formatted = formatEventStatus(status);
    return <article key={entry.id} className={`investment-record investment-record--${status}`} aria-labelledby={`${entry.id}-heading`}>
      <header className="investment-record__header"><h3 id={`${entry.id}-heading`}>{entry.symbol}</h3><p className={`status status--${status}`}><span aria-hidden="true">{formatted.icon}</span> {formatted.label}</p></header>
      <dl className="investment-facts">
        <div><dt>Asset type</dt><dd>{entry.assetType}</dd></div>
        <div><dt>Quantity</dt><dd>{entry.quantity}</dd></div>
        <div><dt>Disposal date</dt><dd>{entry.disposalDate}</dd></div>
        <div><dt>Source</dt><dd>{entry.sourceLabel}</dd></div>
        <div><dt>Provenance</dt><dd>{entry.provenance}</dd></div>
      </dl>
      {entry.acquisition.provenance === 'missing' && <AcquisitionForm eventId={entry.id} symbol={entry.symbol} />}
    </article>;
  })}</div>;
}
