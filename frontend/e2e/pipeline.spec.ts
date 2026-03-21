import { test, expect } from '@playwright/test';

test.describe('Pipeline Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a pipeline page with a dummy runId
    await page.goto('/pipeline/test-run-id');
  });

  test('page title is "Crucible Pipeline"', async ({ page }) => {
    const heading = page.locator('h1', { hasText: 'Crucible Pipeline' });
    await expect(heading).toBeVisible();
  });

  test('shows all 8 step labels', async ({ page }) => {
    const stepLabels = [
      'Company Research',
      'Dossier Review',
      'Threat Analysis',
      'Scenario Selection',
      'Config Generation',
      'Simulations',
      'After-Action Reports',
      'Comparative Analysis',
    ];

    for (const label of stepLabels) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('shows "pending" status icons for steps initially', async ({ page }) => {
    // All steps should show the pending icon (circle: "○")
    const pendingIcons = page.locator('span.font-mono.text-lg', { hasText: '○' });
    await expect(pendingIcons).toHaveCount(8);
  });

  test('has breadcrumb with Home link', async ({ page }) => {
    const homeLink = page.getByRole('link', { name: 'Home' });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute('href', '/');
  });
});
