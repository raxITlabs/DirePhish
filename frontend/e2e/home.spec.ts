import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads with "Crucible" heading', async ({ page }) => {
    const heading = page.locator('h1', { hasText: 'Crucible' });
    await expect(heading).toBeVisible();
  });

  test('"Recent Simulations" section is visible', async ({ page }) => {
    const section = page.locator('h2', { hasText: 'Recent Simulations' });
    await expect(section).toBeVisible();
  });

  test('"Research Your Company" section is visible', async ({ page }) => {
    const section = page.locator('h2', { hasText: 'Research Your Company' });
    await expect(section).toBeVisible();
  });

  test('company URL input exists', async ({ page }) => {
    const input = page.locator('#company-url');
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('type', 'url');
    await expect(input).toHaveAttribute('placeholder', 'https://company.com');
  });

  test('"Start Pipeline" button exists and is disabled without URL', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Start Pipeline' });
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
  });

  test('"Start Pipeline" button enables when URL is entered', async ({ page }) => {
    const input = page.locator('#company-url');
    const button = page.getByRole('button', { name: 'Start Pipeline' });

    await input.fill('https://example.com');
    await expect(button).toBeEnabled();
  });
});
