import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

const PREVIOUSLY_REVIEWED = 'Previously reviewed — not processed by this prototype';
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

    // --- Opening page: section statuses and synthetic-data markers -------
    const previouslyReviewed = screen.getAllByText(PREVIOUSLY_REVIEWED);
    expect(previouslyReviewed.length).toBeGreaterThanOrEqual(2); // Income + Deductions

    expect(screen.getByText('Action required')).toBeVisible();

    const syntheticMarkers = screen.getAllByText('Synthetic demo data');
    expect(syntheticMarkers.length).toBeGreaterThanOrEqual(3); // Managed funds, Foreign shares, Crypto assets

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

    // --- Reset demo: exact opening UI restored ----------------------------
    await user.click(screen.getByRole('button', { name: /reset demo/i }));

    expect(screen.getAllByText(PREVIOUSLY_REVIEWED).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Action required')).toBeVisible();
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

    // AAPL's disposal date is 2023-05-02; an acquisition date on/after it is invalid.
    await user.clear(dateInput);
    await user.type(dateInput, '2023-06-01');
    await user.clear(priceInput);
    await user.type(priceInput, '150');
    await user.selectOptions(currencySelect, 'USD');
    await user.click(screen.getByRole('button', { name: /record acquisition details/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('acquisitionDate must be strictly before the disposal date.');
    expect(dateInput).toHaveAttribute('aria-invalid', 'true');
    expect(dateInput.getAttribute('aria-describedby')).toBe(alert.id);

    // The blocker remains open: no reconciliation-driven success has occurred.
    expect(screen.getByLabelText(/acquisition date/i)).toBeVisible();

    // Correcting the date resolves the blocker and the form un-mounts.
    await user.clear(dateInput);
    await user.type(dateInput, '2022-09-15');
    await user.click(screen.getByRole('button', { name: /record acquisition details/i }));

    expect(screen.queryByLabelText(/acquisition date/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
