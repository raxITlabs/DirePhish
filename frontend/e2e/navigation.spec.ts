import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('header "Crucible" link navigates to home', async ({ page }) => {
    // Start on a non-home page
    await page.goto('/pipeline/test-run-id');
    const headerLink = page.locator('header').getByRole('link', { name: /Crucible/ });
    await expect(headerLink).toBeVisible();
    await expect(headerLink).toHaveAttribute('href', '/');

    await headerLink.click();
    await expect(page).toHaveURL('/');
  });

  test('report page loads with correct route', async ({ page }) => {
    await page.goto('/report/test-sim-id');
    // Report page should have the header
    const header = page.locator('header');
    await expect(header).toBeVisible();
    // Should show breadcrumbs with "Report" label
    await expect(page.getByText('Report', { exact: true })).toBeVisible();
  });

  test('simulation page loads with correct route', async ({ page }) => {
    await page.goto('/simulation/test-sim-id');
    const header = page.locator('header');
    await expect(header).toBeVisible();
    // Should show breadcrumbs with "Simulation" label
    await expect(page.getByText('Simulation')).toBeVisible();
  });
});
