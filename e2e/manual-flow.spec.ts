import { test, expect, type Page } from '@playwright/test';

async function populate(page: Page) {
  await page.goto('/');
  await expect(page.getByText(/WebMCP unavailable/i)).toBeVisible();

  const deduction = page.getByRole('form', { name: 'Add deduction evidence' });
  await deduction.getByLabel('Description').fill('WFH hours from worksheet');
  await deduction.getByLabel('Period start').fill('2025-07-08');
  await deduction.getByLabel('Period end').fill('2026-05-19');
  await deduction.getByLabel('Quantity').fill('40');
  await deduction.getByRole('button', { name: 'Add deduction' }).click();

  const disposal = page.getByRole('form', { name: 'Add investment disposal' });
  await disposal.getByLabel('Symbol').fill('AAPL');
  await disposal.getByLabel('Quantity').fill('30');
  await disposal.getByLabel('Disposal date').fill('2026-05-02');
  await disposal.getByLabel('Proceeds').fill('5250');
  await disposal.getByRole('button', { name: 'Add disposal' }).click();

  const generate = page.getByRole('button', { name: 'Generate review pack' });
  await generate.click();
  const modal = page.getByRole('dialog', { name: 'Review pack validation' });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('heading', { name: 'Review pack validation' })).toBeFocused();
  await modal.getByRole('button', { name: 'Close' }).click();
  await expect(generate).toBeFocused();

  const acquisition = page.getByRole('form', { name: 'Record acquisition details for AAPL' });
  await acquisition.getByLabel(/Historical acquisition date/).fill('2022-09-15');
  await acquisition.getByLabel('Unit price').fill('150');
  await acquisition.getByLabel('Currency').selectOption('USD');
  await acquisition.getByRole('button', { name: 'Record acquisition details' }).click();

  await generate.click();
  await expect(page.getByRole('heading', { name: /Review pack generated with unresolved warning/ })).toBeVisible();
}

test.describe('ReturnReady sparse manual workflow', () => {
  test('manual controls populate the sparse draft and generate a warning pack', async ({ page }) => {
    await populate(page);
    await page.getByRole('button', { name: 'Reset demo' }).click();
    await expect(page.getByText('No deduction evidence recorded yet.')).toBeVisible();
    await expect(page.getByText('No investment disposals recorded yet.')).toBeVisible();
  });

  test('the flow can be repeated after reset', async ({ page }) => {
    await populate(page);
    await page.getByRole('button', { name: 'Reset demo' }).click();
    await populate(page);
    await expect(page.locator('.activity-strip li')).toHaveCount(4);
  });

  test('forms and action controls have keyboard-accessible names', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('form', { name: 'Add deduction evidence' })).toBeVisible();
    await expect(page.getByRole('form', { name: 'Add investment disposal' })).toBeVisible();
    for (const name of ['Validate review pack', 'Generate review pack', 'Reset demo']) {
      const button = page.getByRole('button', { name });
      await expect(button).toBeEnabled();
      await button.focus();
      await expect(button).toBeFocused();
    }
  });
});
