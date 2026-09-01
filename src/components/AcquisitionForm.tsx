// Records a user-attested acquisition date, unit price, and currency for one
// investment event. Renders only when that event still needs these facts.
// Submitting calls `controller.recordAcquisitionDetails` with actor
// 'human' and branches on the returned `Result` -- it never assumes success.

import { useId, useState } from 'react';
import type { Currency } from '../domain/model';
import { useReturnReadyController } from '../application/ReturnReadyContext';

const CURRENCIES: readonly Currency[] = ['AUD', 'USD'];

type AcquisitionErrorField = 'date' | 'unitPrice' | 'currency';

// The domain (`src/domain/acquisition.ts`) reports errors as a code plus a
// human message, not a field key. Map its known messages to the single field
// they concern so the error can be announced against the field that caused
// it, rather than against every field at once. A message that doesn't match
// any known field-specific case (e.g. an unknown event id) is treated as
// general and is not attached to any single control.
function fieldForErrorMessage(message: string): AcquisitionErrorField | null {
  if (message.startsWith('Unsupported currency')) return 'currency';
  if (message.startsWith('unitPrice')) return 'unitPrice';
  if (message.startsWith('acquisitionDate')) return 'date';
  // "No FX evidence found for the supplied acquisition date and currency.":
  // currency itself has already passed its own validation by this point, so
  // the acquisition date is the field the user needs to revisit.
  if (message.startsWith('No FX evidence found')) return 'date';
  return null;
}

export function AcquisitionForm({ eventId, symbol }: { eventId: string; symbol: string }) {
  const controller = useReturnReadyController();
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<AcquisitionErrorField | null>(null);
  const headingId = useId();
  const dateId = useId();
  const priceId = useId();
  const currencyId = useId();
  const errorId = useId();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const acquisitionDate = String(formData.get('acquisitionDate') ?? '');
    const unitPriceRaw = String(formData.get('unitPrice') ?? '');
    const currencyRaw = String(formData.get('currency') ?? '');
    const currency = CURRENCIES.find((candidate) => candidate === currencyRaw);

    if (!currency) {
      setError('Select a supported currency.');
      setErrorField('currency');
      return;
    }

    const result = controller.recordAcquisitionDetails(
      { eventId, acquisitionDate, unitPrice: Number(unitPriceRaw), currency },
      'human',
    );

    if (!result.ok) {
      setError(result.error.message);
      setErrorField(fieldForErrorMessage(result.error.message));
      return;
    }
    setError(null);
    setErrorField(null);
  }

  return (
    <form className="acquisition-form" onSubmit={handleSubmit} aria-labelledby={headingId}>
      <h4 id={headingId}>Record acquisition details for {symbol}</h4>
      <p>Recorded as a user attestation, not documentary evidence.</p>

      <div className="form-row">
        <label htmlFor={dateId}>Historical acquisition date (YYYY-MM-DD)</label>
        <input
          id={dateId}
          name="acquisitionDate"
          type="text"
          inputMode="numeric"
          placeholder="YYYY-MM-DD"
          required
          aria-invalid={errorField === 'date' ? true : undefined}
          aria-describedby={errorField === 'date' ? errorId : undefined}
        />
      </div>

      <div className="form-row">
        <label htmlFor={priceId}>Unit price</label>
        <input
          id={priceId}
          name="unitPrice"
          type="number"
          min="0.01"
          step="0.01"
          required
          aria-invalid={errorField === 'unitPrice' ? true : undefined}
          aria-describedby={errorField === 'unitPrice' ? errorId : undefined}
        />
      </div>

      <div className="form-row">
        <label htmlFor={currencyId}>Currency</label>
        <select
          id={currencyId}
          name="currency"
          defaultValue=""
          required
          aria-invalid={errorField === 'currency' ? true : undefined}
          aria-describedby={errorField === 'currency' ? errorId : undefined}
        >
          <option value="" disabled>
            Select currency
          </option>
          {CURRENCIES.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p id={errorId} role="alert" className="field-error">
          {error}
        </p>
      )}

      <button type="submit">Record acquisition details</button>
    </form>
  );
}
