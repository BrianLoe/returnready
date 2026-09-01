import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

async function addWfhDeduction(user: ReturnType<typeof userEvent.setup>) {
  const form = screen.getByRole('form', { name: 'Add deduction evidence' });
  await user.type(within(form).getByLabelText('Description'), 'WFH hours from worksheet');
  await user.type(within(form).getByLabelText('Period start'), '2025-07-08');
  await user.type(within(form).getByLabelText('Period end'), '2026-05-19');
  await user.type(within(form).getByLabelText('Quantity'), '40');
  await user.click(within(form).getByRole('button', { name: 'Add deduction' }));
}

async function addAaplDisposal(user: ReturnType<typeof userEvent.setup>) {
  const form = screen.getByRole('form', { name: 'Add investment disposal' });
  await user.type(within(form).getByLabelText('Symbol'), 'AAPL');
  await user.type(within(form).getByLabelText('Quantity'), '30');
  await user.type(within(form).getByLabelText('Disposal date'), '2026-05-02');
  await user.type(within(form).getByLabelText('Proceeds'), '5250');
  await user.type(within(form).getByLabelText('Brokerage (optional)'), '15');
  await user.click(within(form).getByRole('button', { name: 'Add disposal' }));
}

describe('ReturnReady sparse draft workflow', () => {
  it('populates an empty draft manually, resolves a blocker, generates a warning pack, and resets', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText(/add entries manually, or ask Codex to populate/i)).toBeVisible();
    expect(screen.getByText('No deduction evidence recorded yet.')).toBeVisible();
    expect(screen.getByText('No investment disposals recorded yet.')).toBeVisible();
    expect(screen.queryByText('Holdings')).not.toBeInTheDocument();

    await addWfhDeduction(user);
    expect(screen.getByRole('article', { name: 'WFH hours from worksheet' })).toBeVisible();
    expect(screen.getByText('Manual entry')).toBeVisible();

    await addAaplDisposal(user);
    expect(screen.getByRole('article', { name: 'AAPL' })).toBeVisible();
    expect(screen.getByRole('form', { name: 'Record acquisition details for AAPL' })).toBeVisible();

    const generate = screen.getByRole('button', { name: 'Generate review pack' });
    await user.click(generate);
    const blocked = await screen.findByRole('dialog', { name: 'Review pack validation' });
    expect(within(blocked).getByText(/acquisition date and unit cost are required/i)).toBeVisible();
    await user.click(within(blocked).getByRole('button', { name: 'Close' }));
    expect(generate).toHaveFocus();

    const acquisition = screen.getByRole('form', { name: 'Record acquisition details for AAPL' });
    await user.type(within(acquisition).getByLabelText(/historical acquisition date/i), '2022-09-15');
    await user.type(within(acquisition).getByLabelText('Unit price'), '150');
    await user.selectOptions(within(acquisition).getByLabelText('Currency'), 'USD');
    await user.click(within(acquisition).getByRole('button', { name: 'Record acquisition details' }));

    await user.click(generate);
    expect(await screen.findByRole('heading', { name: /review pack generated with unresolved warning/i })).toBeVisible();
    expect(screen.getByText(/WFH hours from worksheet: 40 hours/)).toBeVisible();
    expect(screen.getAllByText('user-attested').length).toBeGreaterThan(0);
    expect(screen.getByText('Generated 2026-06-30T00:00:00.000Z')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Reset demo' }));
    expect(screen.getByText('No deduction evidence recorded yet.')).toBeVisible();
    expect(screen.getByText('No investment disposals recorded yet.')).toBeVisible();
    expect(screen.queryByRole('heading', { name: /review pack generated/i })).not.toBeInTheDocument();
  });

  it('rejects a disposal date outside FY2025-26 and keeps the draft unchanged', async () => {
    render(<App />);
    const form = screen.getByRole('form', { name: 'Add investment disposal' });
    fireEvent.change(within(form).getByLabelText('Symbol'), { target: { value: 'MSFT' } });
    fireEvent.change(within(form).getByLabelText('Quantity'), { target: { value: '1' } });
    fireEvent.change(within(form).getByLabelText('Disposal date'), { target: { value: '2025-06-30' } });
    fireEvent.change(within(form).getByLabelText('Proceeds'), { target: { value: '100' } });
    fireEvent.submit(form);

    expect(within(form).getByRole('alert')).toHaveTextContent('disposalDate');
    expect(screen.getByText('No investment disposals recorded yet.')).toBeVisible();
  });
});
