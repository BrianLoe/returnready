import type { DisposalEntry, ValidationIssue } from '../domain/model';
import { deriveStatusFromIssues } from '../domain/reconcile';
import { formatEventStatus } from '../application/ReturnReadyContext';
import { AcquisitionForm } from './AcquisitionForm';

function money(minor: number, currency: string): string {
  const amount = new Intl.NumberFormat('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
  return `$${amount} ${currency}`;
}

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
        <div><dt>Acquisition date</dt><dd>{entry.acquisition.date ?? 'Missing'}</dd></div>
        <div><dt>Acquisition unit price</dt><dd>{entry.acquisition.unitPriceMinor === undefined || entry.acquisition.currency === undefined ? 'Missing' : money(entry.acquisition.unitPriceMinor, entry.acquisition.currency)}</dd></div>
        <div><dt>Disposal date</dt><dd>{entry.disposalDate}</dd></div>
        <div><dt>Disposal proceeds</dt><dd>{money(entry.proceedsMinor, entry.currency)}</dd></div>
        <div><dt>{entry.assetType === 'crypto' ? 'Transaction fee' : 'Brokerage'}</dt><dd>{entry.assetType === 'crypto' ? (entry.feeMinor === undefined ? 'Missing' : money(entry.feeMinor, entry.currency)) : (entry.brokerageMinor === undefined ? 'Missing' : money(entry.brokerageMinor, entry.currency))}</dd></div>
        <div><dt>Acquisition provenance</dt><dd>{entry.acquisition.provenance}</dd></div>
        <div><dt>Source</dt><dd>{entry.sourceLabel}</dd></div>
        <div><dt>Provenance</dt><dd>{entry.provenance}</dd></div>
      </dl>
      {entry.acquisition.provenance === 'missing' && <AcquisitionForm eventId={entry.id} symbol={entry.symbol} />}
    </article>;
  })}</div>;
}
