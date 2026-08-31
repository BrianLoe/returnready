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
    <article className="investment-card" aria-labelledby={`${event.id}-heading`}>
      <h3 id={`${event.id}-heading`}>{event.symbol}</h3>
      <p className={`status status--${event.status}`}>
        <span aria-hidden="true">{icon}</span> {label}
      </p>
      <dl>
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
      <p className="synthetic-marker">Synthetic demo data</p>
    </article>
  );
}
