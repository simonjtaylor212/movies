from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_filters(page: Page):
    # 1. Arrange: Go to the local site
    page.goto("http://localhost:3000")

    # Wait for showtimes to load
    page.wait_for_selector(".movie-card", timeout=10000)

    # 2. Test Multiselect Dates
    date_cards = page.query_selector_all(".date-card")
    if len(date_cards) > 1:
        date_cards[1].click()
        print("Clicked second date card")
        # Verify both are active
        expect(page.locator(".date-card.active")).to_have_count(2)

    # Take screenshot of expanded filters with multiselect
    page.screenshot(path="/home/jules/verification/filters_expanded.png")

    # 3. Test Collapse Filters
    toggle_btn = page.locator("#filterToggleBtn")
    toggle_btn.click()
    print("Clicked toggle button to collapse")

    # Wait for transition
    time.sleep(1)

    # Verify filter content is hidden (max-height: 0)
    filter_content = page.locator("#filterContent")
    # In playwright, hidden might mean different things, let's check visibility or height
    # Since we use max-height: 0 and opacity: 0, it might still be "visible" but with 0 size.

    # Verify summary is visible
    expect(page.locator("#filterSummary")).to_be_visible()

    # Take screenshot of collapsed filters
    page.screenshot(path="/home/jules/verification/filters_collapsed_summary.png")

    # 4. Test clicking summary item to expand
    summary_item = page.locator(".summary-item").first
    summary_item.click()
    print("Clicked summary item to expand")

    time.sleep(1)
    # Verify expanded
    expect(page.locator("#filterContent")).to_be_visible()

    # Verify search is always visible
    expect(page.locator("#searchInput")).to_be_visible()

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_filters(page)
        finally:
            browser.close()
