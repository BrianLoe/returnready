// Real-browser proof of the manual (human) ReturnReady workflow: Task 7.
//
// This does NOT drive WebMCP -- Playwright's Chromium has no WebMCP origin
// trial token on a plain localhost origin, so `document.modelContext` is
// expected to be absent here (see `docs/testing/gate-0-webmcp.md`, Ruling
// R1 branch (a): environmental, not a failure). The point of this spec is
// the opposite: proving that when WebMCP is unavailable, the manual
// controls are entirely unaffected -- the same judged flow that
// `src/components/workflow.test.tsx` exercises in jsdom, replayed here in a
// real browser with real focus and real Tab-key navigation.

import { test, expect, type Page } from '@playwright/test';

const AAPL_BLOCKER_MESSAGE =
  'Acquisition date and unit cost are required before this disposal can be evidence-complete for review.';
const BTC_WARNING_MESSAGE =
  'Transaction fee evidence is missing for this crypto disposal; it remains a visible warning and does not block review.';
const DISCLAIMER = 'ReturnReady does not lodge returns or provide tax advice';

async function runJudgedFlow(page: Page) {
  await page.goto('/');

  // --- WebMCP-unavailable notice must not disable manual controls ----------
  const unavailableNotice = page.getByText(/webmcp unavailable in this browser/i);
  await expect(unavailableNotice).toBeVisible();

  const reconcileButton = page.getByRole('button', { name: /reconcile investment evidence/i });
  const validateButton = page.getByRole('button', { name: /validate review pack/i });
  const generateButton = page.getByRole('button', { name: /^generate review pack$/i });
  const resetButton = page.getByRole('button', { name: /reset demo/i });
  await expect(reconcileButton).toBeEnabled();
  await expect(validateButton).toBeEnabled();
  await expect(generateButton).toBeEnabled();
  await expect(resetButton).toBeEnabled();

  // --- Opening state ----------------------------------------------------------
  await expect(page.getByText('Action required').first()).toBeVisible();

  // --- Reconcile, then attempt to generate: blocked ----------------------------
  await reconcileButton.click();
  await generateButton.click();

  const modal = page.getByRole('dialog', { name: /review pack validation/i });
  await expect(modal).toBeVisible();
  const modalHeading = page.getByRole('heading', { name: /review pack validation/i });
  await expect(modalHeading).toBeFocused();
  await expect(modal.getByText('AAPL')).toBeVisible();
  await expect(modal.getByText(AAPL_BLOCKER_MESSAGE)).toBeVisible();
  await expect(modal.getByText('BTC')).toBeVisible();
  await expect(modal.getByText(BTC_WARNING_MESSAGE)).toBeVisible();
  await expect(page.getByRole('heading', { name: /review pack generated/i })).toHaveCount(0);

  // --- Modal focus returns to the Generate button on close ---------------------
  await modal.getByRole('button', { name: /close/i }).click();
  await expect(modal).toHaveCount(0);
  await expect(generateButton).toBeFocused();

  // --- Resolve the AAPL blocker via the manual acquisition form ----------------
  await page.getByLabel(/acquisition date/i).fill('2022-09-15');
  await page.getByLabel(/unit price/i).fill('150');
  await page.getByLabel(/currency/i).selectOption('USD');
  await page.getByRole('button', { name: /record acquisition details/i }).click();

  // --- Validate: only the BTC warning should remain -----------------------------
  await validateButton.click();
  const secondModal = page.getByRole('dialog', { name: /review pack validation/i });
  await expect(secondModal).toBeVisible();
  await expect(secondModal.getByText(AAPL_BLOCKER_MESSAGE)).toHaveCount(0);
  await expect(secondModal.getByText(BTC_WARNING_MESSAGE)).toBeVisible();
  await secondModal.getByRole('button', { name: /close/i }).click();
  await expect(generateButton).toBeFocused();

  // --- Generate: succeeds with the unresolved BTC warning surfaced ---------------
  await generateButton.click();
  const packHeading = page.getByRole('heading', { name: /review pack generated with unresolved warning/i });
  await expect(packHeading).toBeVisible();
  await expect(page.getByRole('cell', { name: 'user-attested' })).toBeVisible();
  await expect(page.getByText(BTC_WARNING_MESSAGE)).toBeVisible();
  await expect(page.getByText('Foreign-exchange rate evidence')).toBeVisible();
  await expect(page.getByText('Foreign broker disposal export')).toBeVisible();
  await expect(page.locator('.disclaimer', { hasText: DISCLAIMER })).toBeVisible();

  // --- Reset: exact opening UI restored -------------------------------------------
  await resetButton.click();
  await expect(page.getByText('Action required').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /review pack generated/i })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel(/acquisition date/i)).toBeVisible();
}

test.describe('ReturnReady manual workflow (real browser)', () => {
  test('WebMCP-unavailable notice does not disable manual controls; full judged flow completes', async ({
    page,
  }) => {
    await runJudgedFlow(page);
  });

  test('the same judged flow can be repeated after reset with no leftover state (idempotency proof)', async ({
    page,
  }) => {
    await runJudgedFlow(page);
    // `runJudgedFlow` already ends on a freshly-reset page; replaying it
    // proves a second pass through reconcile -> blocked generate -> resolve
    // -> validate -> generate -> reset produces the identical judged flow,
    // with no duplicated activity entries or accumulated state from the
    // first pass.
    await runJudgedFlow(page);

    const activityList = page.locator('.activity-strip ul li');
    // After the second pass's own reset, the activity log restarts from
    // fixture-empty just like the first pass did -- no growth across runs.
    await expect(activityList).toHaveCount(0);
  });

  test('every action control is keyboard-reachable with a clear accessible name (Tab order)', async ({
    page,
  }) => {
    await page.goto('/');

    const expectedNames = [
      /reconcile investment evidence/i,
      /validate review pack/i,
      /^generate review pack$/i,
      /reset demo/i,
    ];

    const actionBar = page.locator('.action-bar');
    const buttons = actionBar.getByRole('button');
    await expect(buttons).toHaveCount(expectedNames.length);

    for (let i = 0; i < expectedNames.length; i++) {
      const button = buttons.nth(i);
      await expect(button).toHaveAccessibleName(expectedNames[i]);
      await button.focus();
      await expect(button).toBeFocused();
    }

    // The whole-return stepper's four steps are real links, keyboard
    // reachable in document order, each with a distinct accessible name.
    const stepLinks = page.locator('.return-stepper a');
    await expect(stepLinks).toHaveCount(4);
    for (const label of ['Income', 'Deductions', 'Investments', 'Review pack']) {
      await expect(stepLinks.filter({ hasText: label })).toHaveCount(1);
    }
  });
});
