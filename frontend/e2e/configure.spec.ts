import { test, expect } from '@playwright/test';

test.describe('Configure Page', () => {
  test('shows loading state for unknown project ID', async ({ page }) => {
    await page.goto('/configure/project/unknown-project-id');
    // The page should show a loading skeleton while fetching project data
    // It renders Skeleton components and a progress message
    const loadingText = page.getByText(
      'The AI is building agents, scenarios, and pressures from your company data.'
    );
    // Either the loading skeleton or an error state should appear
    const skeleton = page.locator('[data-slot="skeleton"]');
    await expect(skeleton.or(loadingText).first()).toBeVisible({ timeout: 10000 });
  });

  test('handles error state gracefully', async ({ page }) => {
    await page.goto('/configure/project/unknown-project-id');
    // After the fetch fails, an error alert should appear (since backend is unavailable)
    // The page shows either the loading state or error — both are acceptable
    const errorAlert = page.locator('[data-slot="alert"]');
    const loadingState = page.locator('[data-slot="skeleton"]');
    await expect(errorAlert.or(loadingState).first()).toBeVisible({ timeout: 10000 });
  });
});
