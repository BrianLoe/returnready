import { useId, useState } from 'react';
import { useReturnReadyController, useReturnState } from '../application/ReturnReadyContext';
import type { DeductionCategory, DeductionUnit } from '../domain/model';

const categories: readonly DeductionCategory[] = ['work-from-home', 'other-work-related'];
const units: readonly DeductionUnit[] = ['hours', 'AUD'];

export function DeductionForm() {
  const controller = useReturnReadyController();
  const state = useReturnState();
  const [error, setError] = useState<string | null>(null);
  const formId = useId();
  const errorId = useId();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const categoryRaw = String(data.get('category') ?? '');
    const unitRaw = String(data.get('unit') ?? '');
    const category = categories.find((value) => value === categoryRaw);
    const unit = units.find((value) => value === unitRaw);
    if (!category || !unit) {
      setError('Select a supported deduction category and unit.');
      return;
    }
    const claimRaw = String(data.get('claimAmount') ?? '').trim();
    const result = controller.recordDeductions([{
      sourceRecordId: `manual-deduction-${state.deductions.length + 1}`,
      category,
      description: String(data.get('description') ?? ''),
      periodStart: String(data.get('periodStart') ?? ''),
      periodEnd: String(data.get('periodEnd') ?? ''),
      quantity: Number(data.get('quantity')),
      unit,
      ...(claimRaw === '' ? {} : { claimAmountMinor: Math.round(Number(claimRaw) * 100) }),
      currency: 'AUD',
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
      <h3 id={`${formId}-heading`}>Add deduction evidence</h3>
      <div className="form-grid">
        <label>Category<select name="category" defaultValue="work-from-home">{categories.map((value) => <option key={value} value={value}>{value === 'work-from-home' ? 'Work from home' : 'Other work-related'}</option>)}</select></label>
        <label>Description<input name="description" required /></label>
        <label>Period start<input name="periodStart" type="date" min="2025-07-01" max="2026-06-30" required /></label>
        <label>Period end<input name="periodEnd" type="date" min="2025-07-01" max="2026-06-30" required /></label>
        <label>Quantity<input name="quantity" type="number" min="0.01" step="0.01" required /></label>
        <label>Unit<select name="unit" defaultValue="hours">{units.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Claim amount (AUD, optional)<input name="claimAmount" type="number" min="0.01" step="0.01" /></label>
      </div>
      {error && <p id={errorId} role="alert" className="field-error">{error}</p>}
      <button type="submit">Add deduction</button>
    </form>
  );
}
