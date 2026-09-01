import { useId, useState } from 'react';
import { useReturnReadyController, useReturnState } from '../application/ReturnReadyContext';
import type { Currency, DisposalAssetType } from '../domain/model';

const assetTypes: readonly DisposalAssetType[] = ['foreign-share', 'crypto'];
const currencies: readonly Currency[] = ['AUD', 'USD'];

export function DisposalForm() {
  const controller = useReturnReadyController();
  const state = useReturnState();
  const [error, setError] = useState<string | null>(null);
  const formId = useId();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const assetTypeRaw = String(data.get('assetType') ?? '');
    const currencyRaw = String(data.get('currency') ?? '');
    const assetType = assetTypes.find((value) => value === assetTypeRaw);
    const currency = currencies.find((value) => value === currencyRaw);
    if (!assetType || !currency) {
      setError('Select a supported asset type and currency.');
      return;
    }
    const acquisitionDate = String(data.get('acquisitionDate') ?? '').trim();
    const acquisitionPrice = String(data.get('acquisitionUnitPrice') ?? '').trim();
    const brokerage = String(data.get('brokerage') ?? '').trim();
    const fee = String(data.get('fee') ?? '').trim();
    const result = controller.recordDisposals([{
      sourceRecordId: `manual-disposal-${state.disposals.length + 1}`,
      assetType,
      symbol: String(data.get('symbol') ?? '').trim().toUpperCase(),
      quantity: Number(data.get('quantity')),
      ...(acquisitionDate === '' && acquisitionPrice === '' ? {} : {
        acquisitionDate,
        acquisitionUnitPriceMinor: Math.round(Number(acquisitionPrice) * 100),
        acquisitionCurrency: currency,
      }),
      disposalDate: String(data.get('disposalDate') ?? ''),
      proceedsMinor: Math.round(Number(data.get('proceeds')) * 100),
      currency,
      ...(brokerage === '' ? {} : { brokerageMinor: Math.round(Number(brokerage) * 100) }),
      ...(fee === '' ? {} : { feeMinor: Math.round(Number(fee) * 100) }),
      sourceLabel: 'Manual entry',
    }], 'human');
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    form.reset();
  }

  return (
    <form className="entry-form" aria-labelledby={`${formId}-heading`} onSubmit={handleSubmit}>
      <h3 id={`${formId}-heading`}>Add investment disposal</h3>
      <div className="form-grid">
        <label>Asset type<select name="assetType" defaultValue="foreign-share">{assetTypes.map((value) => <option key={value} value={value}>{value === 'foreign-share' ? 'Foreign share' : 'Crypto'}</option>)}</select></label>
        <label>Symbol<input name="symbol" required /></label>
        <label>Quantity<input name="quantity" type="number" min="0.00000001" step="any" required /></label>
        <label>Disposal date<input name="disposalDate" type="date" min="2025-07-01" max="2026-06-30" required /></label>
        <label>Proceeds<input name="proceeds" type="number" min="0.01" step="0.01" required /></label>
        <label>Currency<select name="currency" defaultValue="USD">{currencies.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Historical acquisition date (optional)<input name="acquisitionDate" type="date" max="2026-06-29" /></label>
        <label>Historical unit price (optional)<input name="acquisitionUnitPrice" type="number" min="0.01" step="0.01" /></label>
        <label>Brokerage (optional)<input name="brokerage" type="number" min="0.01" step="0.01" /></label>
        <label>Transaction fee (optional)<input name="fee" type="number" min="0.01" step="0.01" /></label>
      </div>
      {error && <p role="alert" className="field-error">{error}</p>}
      <button type="submit">Add disposal</button>
    </form>
  );
}
