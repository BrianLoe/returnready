import { useId, useState } from 'react';
import { useReturnReadyController, useReturnState } from '../application/ReturnReadyContext';
import type { DeductionCalculationMethod, DeductionCategory, DeductionUnit } from '../domain/model';

const categories: readonly DeductionCategory[] = ['work-from-home', 'other-work-related'];
const units: readonly DeductionUnit[] = ['hours', 'AUD'];
const methods: readonly DeductionCalculationMethod[] = ['fixed-rate', 'actual-cost'];

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
    const methodRaw = String(data.get('calculationMethod') ?? '');
    const category = categories.find((value) => value === categoryRaw);
    const unit = units.find((value) => value === unitRaw);
    const calculationMethod = methods.find((value) => value === methodRaw);
    if (!category || !unit || !calculationMethod) {
      setError('Select a supported deduction category, method, and unit.');
      return;
    }
    const result = controller.recordDeductions([{
      sourceRecordId: `manual-deduction-${state.deductions.length + 1}`,
      category,
      description: String(data.get('description') ?? ''),
      periodStart: String(data.get('periodStart') ?? ''),
      periodEnd: String(data.get('periodEnd') ?? ''),
      quantity: Number(data.get('quantity')),
      unit,
      calculationMethod,
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
        <label>Category<select name="category" defaultValue="work-from-home">{categories.map((value) => <option key={value} value={value} disabled={value === 'other-work-related'}>{value === 'work-from-home' ? 'Work from home' : 'Other work-related (not in demo)'}</option>)}</select></label>
        <label>Description<input name="description" required /></label>
        <label>Period start<input name="periodStart" type="date" min="2025-07-01" max="2026-06-30" required /></label>
        <label>Period end<input name="periodEnd" type="date" min="2025-07-01" max="2026-06-30" required /></label>
        <label>Quantity<input name="quantity" type="number" min="0.01" step="0.01" required /></label>
        <label>Unit<select name="unit" defaultValue="hours">{units.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Calculation method<select name="calculationMethod" defaultValue="fixed-rate"><option value="fixed-rate">Fixed rate</option><option value="actual-cost" disabled>Actual cost (not in demo)</option></select></label>
      </div>
      <p className="form-hint">Fixed rate uses 70 cents per work hour for FY2025–26. Actual cost requires itemised expense evidence and is not included in this demo.</p>
      {error && <p id={errorId} role="alert" className="field-error">{error}</p>}
      <button type="submit">Add deduction</button>
    </form>
  );
}
