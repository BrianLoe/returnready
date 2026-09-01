import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

const PREVIOUSLY_REVIEWED = 'Reviewed';
const AAPL_BLOCKER_MESSAGE =
  'Acquisition date and unit cost are required before this disposal can be evidence-complete for review.';
const BTC_WARNING_MESSAGE =
  'Transaction fee evidence is missing for this crypto disposal; it remains a visible warning and does not block review.';
const DISCLAIMER = 'ReturnReady does not lodge returns or provide tax advice';

async function fillAndRecordAapl(user: ReturnType<typeof userEvent.setup>) {
  const dateInput = screen.getByLabelText(/acquisition date/i);
  const priceInput = screen.getByLabelText(/unit price/i);
  const currencySelect = screen.getByLabelText(/currency/i);

  await user.clear(dateInput);
  await user.type(dateInput, '2022-09-15');
  await user.clear(priceInput);
  await user.type(priceInput, '150');
  await user.selectOptions(currencySelect, 'USD');

  await user.click(screen.getByRole('button', { name: /record acquisition details/i }));
}

describe('ReturnReady manual workflow', () => {
  it('walks the judged flow: opening state, blocked generation, resolving the blocker, and reset', async () => {
    const user = userEvent.setup();
    render(<App />);

    // --- Opening page: section statuses and visual hierarchy -------------
    const previouslyReviewed = screen.getAllByText(PREVIOUSLY_REVIEWED);
    expect(previouslyReviewed.length).toBeGreaterThanOrEqual(2); // Income + Deductions

    expect(screen.getAllByRole('img', { name: 'Reviewed' })).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'Action required' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Not yet generated' })).toBeVisible();

    expect(screen.getByRole('navigation', { name: 'Return steps' })).toHaveClass('evidence-trail');
    expect(screen.getByRole('region', { name: 'Activity' })).toHaveClass('audit-trail');

    expect(screen.queryByText('Synthetic demo data')).not.toBeInTheDocument();

    const investmentsSection = screen.getByRole('region', { name: 'Investments' });
    expect(investmentsSection).toHaveClass('return-section', 'return-section--primary');
    expect(
      within(investmentsSection).getByRole('region', { name: 'Imported foreign-share disposals' }),
    ).toHaveClass(
      'asset-group',
    );
    expect(within(investmentsSection).getByText(/complete the missing details yourself/i)).toBeVisible();
    expect(within(investmentsSection).queryByText('Holdings')).not.toBeInTheDocument();
    expect(within(investmentsSection).getByRole('article', { name: 'MSFT' })).toHaveClass(
      'investment-record',
    );

    // --- Reconcile, then attempt to generate: blocked --------------------
    await user.click(screen.getByRole('button', { name: /reconcile investment evidence/i }));

    const generateButton = screen.getByRole('button', { name: /^generate review pack$/i });
    await user.click(generateButton);

    const modalHeading = await screen.findByRole('heading', { name: /review pack validation/i });
    expect(modalHeading).toHaveFocus();

    const modal = screen.getByRole('dialog', { name: /review pack validation/i });
    expect(within(modal).getByText(/AAPL/)).toBeVisible();
    expect(within(modal).getByText(AAPL_BLOCKER_MESSAGE)).toBeVisible();
    expect(within(modal).getByText(/BTC/)).toBeVisible();
    expect(within(modal).getByText(BTC_WARNING_MESSAGE)).toBeVisible();

    // Generation is blocked: no review pack rendered yet.
    expect(screen.queryByRole('heading', { name: /review pack generated/i })).not.toBeInTheDocument();

    await user.click(within(modal).getByRole('button', { name: /close/i }));
    expect(generateButton).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // --- Resolve the AAPL blocker via the acquisition form ---------------
    await fillAndRecordAapl(user);

    // --- Validate: only the BTC warning should remain --------------------
    await user.click(screen.getByRole('button', { name: /validate review pack/i }));
    const secondModal = await screen.findByRole('dialog', { name: /review pack validation/i });
    expect(within(secondModal).queryByText(AAPL_BLOCKER_MESSAGE)).not.toBeInTheDocument();
    expect(within(secondModal).getByText(BTC_WARNING_MESSAGE)).toBeVisible();
    await user.click(within(secondModal).getByRole('button', { name: /close/i }));
    expect(generateButton).toHaveFocus();

    // --- Generate: succeeds with the unresolved BTC warning surfaced -----
    await user.click(generateButton);

    const packHeading = await screen.findByRole('heading', {
      name: /review pack generated with unresolved warning/i,
    });
    expect(packHeading).toBeVisible();
    expect(screen.getByText('user-attested')).toBeVisible();
    expect(screen.getByText(BTC_WARNING_MESSAGE)).toBeVisible();
    expect(screen.getByText('Foreign-exchange rate evidence')).toBeVisible();
    expect(screen.getByText('Foreign broker disposal export')).toBeVisible();
    expect(screen.getByText(DISCLAIMER)).toBeVisible();
    expect(screen.getByText('Generated 2026-06-30T00:00:00.000Z')).toBeVisible();

    // --- Reset demo: exact opening UI restored ----------------------------
    await user.click(screen.getByRole('button', { name: /reset demo/i }));

    expect(screen.getAllByText(PREVIOUSLY_REVIEWED).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('img', { name: 'Action required' })).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: /review pack generated/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/acquisition date/i)).toBeVisible();
  });

  it('shows an accessible field error and leaves the blocker open when acquisition details are invalid', async () => {
    const user = userEvent.setup();
    render(<App />);

    const dateInput = screen.getByLabelText(/acquisition date/i);
    const priceInput = screen.getByLabelText(/unit price/i);
    const currencySelect = screen.getByLabelText(/currency/i);

    // AAPL's disposal date is 2026-05-02; an acquisition date on/after it is invalid.
    await user.clear(dateInput);
    await user.type(dateInput, '2026-06-01');
    await user.clear(priceInput);
    await user.type(priceInput, '150');
    await user.selectOptions(currencySelect, 'USD');
    await user.click(screen.getByRole('button', { name: /record acquisition details/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('acquisitionDate must be strictly before the disposal date.');
    expect(dateInput).toHaveAttribute('aria-invalid', 'true');
    expect(dateInput.getAttribute('aria-describedby')).toBe(alert.id);

    // Field-scoped: the OTHER two fields must not be marked invalid.
    expect(priceInput).not.toHaveAttribute('aria-invalid');
    expect(priceInput).not.toHaveAttribute('aria-describedby');
    expect(currencySelect).not.toHaveAttribute('aria-invalid');
    expect(currencySelect).not.toHaveAttribute('aria-describedby');

    // The blocker remains open: no reconciliation-driven success has occurred.
    expect(screen.getByLabelText(/acquisition date/i)).toBeVisible();

    // Correcting the date resolves the blocker and the form un-mounts.
    await user.clear(dateInput);
    await user.type(dateInput, '2022-09-15');
    await user.click(screen.getByRole('button', { name: /record acquisition details/i }));

    expect(screen.queryByLabelText(/acquisition date/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('marks only the currency select as invalid for a missing-currency error', async () => {
    render(<App />);

    const dateInput = screen.getByLabelText(/acquisition date/i) as HTMLInputElement;
    const priceInput = screen.getByLabelText(/unit price/i) as HTMLInputElement;
    const currencySelect = screen.getByLabelText(/currency/i) as HTMLSelectElement;

    // Valid date/price, but currency left at its unselected placeholder.
    // fireEvent.submit bypasses the <select required> native constraint (it
    // does not go through the form's requestSubmit()/reportValidity() gate)
    // so the component's own client-side currency guard can be exercised.
    fireEvent.change(dateInput, { target: { value: '2022-09-15' } });
    fireEvent.change(priceInput, { target: { value: '150' } });
    fireEvent.submit(currencySelect.closest('form') as HTMLFormElement);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Select a supported currency.');
    expect(currencySelect).toHaveAttribute('aria-invalid', 'true');
    expect(currencySelect.getAttribute('aria-describedby')).toBe(alert.id);

    expect(dateInput).not.toHaveAttribute('aria-invalid');
    expect(dateInput).not.toHaveAttribute('aria-describedby');
    expect(priceInput).not.toHaveAttribute('aria-invalid');
    expect(priceInput).not.toHaveAttribute('aria-describedby');
  });

  it('marks only the unit price field as invalid for a non-positive unit price', async () => {
    render(<App />);

    const dateInput = screen.getByLabelText(/acquisition date/i) as HTMLInputElement;
    const priceInput = screen.getByLabelText(/unit price/i) as HTMLInputElement;
    const currencySelect = screen.getByLabelText(/currency/i) as HTMLSelectElement;

    // Valid date/currency, but a non-positive price. fireEvent.submit
    // bypasses the <input min="0.01"> native constraint the same way as
    // above, so the domain's own unitPrice rule is what fires.
    fireEvent.change(dateInput, { target: { value: '2022-09-15' } });
    fireEvent.change(priceInput, { target: { value: '0' } });
    fireEvent.change(currencySelect, { target: { value: 'USD' } });
    fireEvent.submit(priceInput.closest('form') as HTMLFormElement);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('unitPrice must be a positive finite number.');
    expect(priceInput).toHaveAttribute('aria-invalid', 'true');
    expect(priceInput.getAttribute('aria-describedby')).toBe(alert.id);

    expect(dateInput).not.toHaveAttribute('aria-invalid');
    expect(dateInput).not.toHaveAttribute('aria-describedby');
    expect(currencySelect).not.toHaveAttribute('aria-invalid');
    expect(currencySelect).not.toHaveAttribute('aria-describedby');
  });
});
