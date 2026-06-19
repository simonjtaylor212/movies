const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`ERROR: ${msg.text()}`);
    }
  });

  await page.goto('http://localhost:3000');

  // Wait for showtimes to load
  await page.waitForSelector('.movie-card', { timeout: 10000 });

  // Try to select multiple dates
  const dateCards = await page.$$('.date-card');
  if (dateCards.length > 1) {
    await dateCards[1].click();
    console.log('Clicked second date card');
  }

  // Check if any errors occurred
  console.log('Checking for errors...');

  await browser.close();
})();
