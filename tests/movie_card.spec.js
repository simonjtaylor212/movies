const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('MovieCard Collapsible Behavior', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the API response to ensure we have data
    await page.route('**/api/v1/showtimes.json', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            "movie": "Test Movie 1",
            "cinema": "Cine Yelmo Ideal",
            "date": "2026-06-24",
            "time": "18:00",
            "language": "English with Spanish Subtitles",
            "original_language": "English",
            "booking_url": "http://example.com/book1"
          },
          {
            "movie": "Test Movie 1",
            "cinema": "Cine Yelmo Ideal",
            "date": "2026-06-25",
            "time": "20:00",
            "language": "English with Spanish Subtitles",
            "original_language": "English",
            "booking_url": "http://example.com/book2"
          }
        ])
      });
    });

    // Navigate to index.html AFTER mocking
    await page.goto('http://localhost:3000/index.html');

    // Wait for the loader to disappear and cards to render
    await page.waitForSelector('.movie-card');
  });

  test('View by day: cards should be expanded and NOT collapsible', async ({ page }) => {
    await page.click('#btnViewDay');
    const firstCard = page.locator('.movie-card').first();

    await expect(firstCard).not.toHaveClass(/collapsible/);
    const expandedContent = firstCard.locator('.expanded-content');
    await expect(expandedContent).toBeVisible();

    // Check that clicking does NOT toggle (class shouldn't change)
    await firstCard.click();
    await expect(firstCard).not.toHaveClass(/expanded/);
  });

  test('View by movie: cards should be collapsed by default', async ({ page }) => {
    await page.click('#btnViewMovie');
    const firstCard = page.locator('.movie-card').first();

    await expect(firstCard).toHaveClass(/collapsible/);
    await expect(firstCard).not.toHaveClass(/expanded/);

    const collapsedContent = firstCard.locator('.collapsed-content');
    await expect(collapsedContent).toBeVisible();

    const expandedContent = firstCard.locator('.expanded-content');
    // In collapsed state, expanded-content has max-height: 0 and opacity: 0
    // We check the computed style or presence of class
    const opacity = await expandedContent.evaluate(el => getComputedStyle(el).opacity);
    expect(opacity).toBe('0');
  });

  test('View by movie: clicking a card expands it', async ({ page }) => {
    await page.click('#btnViewMovie');
    const firstCard = page.locator('.movie-card').first();

    await firstCard.click();
    await expect(firstCard).toHaveClass(/expanded/);

    const expandedContent = firstCard.locator('.expanded-content');
    // Wait for transition to finish
    await expect(expandedContent).toBeVisible();
    await expandedContent.evaluate(async (el) => {
        while (getComputedStyle(el).opacity !== '1') {
            await new Promise(r => setTimeout(r, 50));
        }
    });

    const opacity = await expandedContent.evaluate(el => getComputedStyle(el).opacity);
    expect(opacity).toBe('1');

    // Aria-expanded should be true
    await expect(firstCard).toHaveAttribute('aria-expanded', 'true');
  });

  test('View by movie: keyboard interaction (Enter) toggles expansion', async ({ page }) => {
    await page.click('#btnViewMovie');
    const firstCard = page.locator('.movie-card').first();

    await firstCard.focus();
    await page.keyboard.press('Enter');
    await expect(firstCard).toHaveClass(/expanded/);

    await page.keyboard.press(' ');
    await expect(firstCard).not.toHaveClass(/expanded/);
  });

  test('View by movie: collapsed summary contains correct info', async ({ page }) => {
    await page.click('#btnViewMovie');
    const firstCard = page.locator('.movie-card').first();

    const dateRange = firstCard.locator('.summary-item').first();
    await expect(dateRange).toContainText('Jun 24 - Jun 25, 2026');

    const cinemaSummary = firstCard.locator('.summary-item').nth(1);
    await expect(cinemaSummary).toContainText('Ideal');
  });

  test('View by movie: clicking a booking link does NOT toggle expansion', async ({ page }) => {
    await page.click('#btnViewMovie');
    const firstCard = page.locator('.movie-card').first();

    // Expand first to see the links
    await firstCard.click();
    await expect(firstCard).toHaveClass(/expanded/);

    const bookingLink = firstCard.locator('.time-pill').first();
    // We just want to check if clicking it triggers a toggle.
    // Since it's a link, it might try to navigate, so we prevent default or check state.
    await bookingLink.click();

    // Should still be expanded
    await expect(firstCard).toHaveClass(/expanded/);
  });
});
