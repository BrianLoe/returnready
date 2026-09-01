// Presentation for one investment disposal event (foreign share or crypto).
// Renders facts already computed by the domain/controller -- no
// reconciliation, validation, or status-rollup logic lives here.

import type { InvestmentEvent } from '../domain/model';
import { formatEventStatus } from '../application/ReturnReadyContext';
import { AcquisitionForm } from './AcquisitionForm';

export function InvestmentCard({ event }: { event: InvestmentEvent }) {
  const { icon, label } = formatEventStatus(event.status);
  const needsAcquisitionDetails = event.acquisition.provenance === 'missing';

  return (
    <article
      className={`investment-record investment-record--${event.status}`}
      aria-labelledby={`${event.id}-heading`}
    >
      <header className="investment-record__header">
        <h4 id={`${event.id}-heading`}>{event.symbol}</h4>
        <p className={`status status--${event.status}`}>
          <span aria-hidden="true">{icon}</span> {label}
        </p>
      </header>
      <dl className="investment-facts">
        <div>
          <dt>Quantity</dt>
          <dd>{event.quantity}</dd>
        </div>
        <div>
          <dt>Disposal date</dt>
          <dd>{event.disposal.date}</dd>
        </div>
        <div>
          <dt>Linked evidence</dt>
          <dd>{event.linkedEvidenceIds.length} record(s)</dd>
        </div>
      </dl>
      {needsAcquisitionDetails && <AcquisitionForm eventId={event.id} symbol={event.symbol} />}
    </article>
  );
}
