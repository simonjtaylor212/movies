import pytest
from playwright.sync_api import expect, Page
import subprocess
import time
import os
import signal
import re

@pytest.fixture(scope="module")
def server():
    # Start a simple HTTP server to serve the static files
    process = subprocess.Popen(
        ["python3", "-m", "http.server", "8002"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    time.sleep(2)  # Wait for server to start
    yield "http://localhost:8002"
    os.kill(process.pid, signal.SIGTERM)

def test_filter_toggle(page: Page, server):
    page.goto(server)

    # Check initial state (should be expanded on desktop/default playwright size)
    toggle = page.locator("#filterToggle")
    panel = page.locator("#filterPanel")

    expect(toggle).to_have_attribute("aria-expanded", "true")
    expect(panel).not_to_have_class(re.compile(r"collapsed"))

    # Toggle to collapse
    toggle.click()
    expect(toggle).to_have_attribute("aria-expanded", "false")
    expect(panel).to_have_class(re.compile(r"collapsed"))

    # Toggle to expand
    toggle.click()
    expect(toggle).to_have_attribute("aria-expanded", "true")
    expect(panel).not_to_have_class(re.compile(r"collapsed"))

def test_active_filter_chips_rendering(page: Page, server):
    page.goto(server)

    # 1. Select a cinema chain
    page.locator("#chipYelmo").click()

    # 2. Collapse filters to see chips
    page.locator("#filterToggle").click()

    summary = page.locator("#activeFiltersSummary")
    expect(summary).to_be_visible()

    # Check for Yelmo chip
    yelmo_chip = summary.get_by_text("Chain: Yelmo")
    expect(yelmo_chip).to_be_visible()

def test_chip_click_expands_and_focuses(page: Page, server):
    page.goto(server)

    # 1. Select a cinema chain
    page.locator("#chipYelmo").click()

    # 2. Collapse filters
    page.locator("#filterToggle").click()
    panel = page.locator("#filterPanel")
    expect(panel).to_have_class(re.compile(r"collapsed"))

    # 3. Click the chip text
    summary = page.locator("#activeFiltersSummary")
    yelmo_chip_text = summary.get_by_text("Chain: Yelmo")
    yelmo_chip_text.click()

    # 4. Panel should be expanded
    expect(panel).not_to_have_class(re.compile(r"collapsed"))
    expect(page.locator("#filterToggle")).to_have_attribute("aria-expanded", "true")

def test_chip_clear_removes_filter_without_expanding(page: Page, server):
    page.goto(server)

    # 1. Select a cinema chain
    page.locator("#chipYelmo").click()

    # 2. Collapse filters
    page.locator("#filterToggle").click()
    panel = page.locator("#filterPanel")
    expect(panel).to_have_class(re.compile(r"collapsed"))

    # 3. Click the clear (X) icon on the chip
    summary = page.locator("#activeFiltersSummary")
    yelmo_chip = summary.locator("div.chip", has_text="Chain: Yelmo")
    clear_btn = yelmo_chip.locator("i.fa-xmark")
    clear_btn.click()

    # 4. Chip should be gone, panel should STILL be collapsed
    expect(yelmo_chip).not_to_be_attached()
    expect(panel).to_have_class(re.compile(r"collapsed"))

    # 5. Verify the filter was actually cleared in the panel (even if hidden)
    expect(page.locator("#chipYelmo")).not_to_have_class(re.compile(r"active"))
    expect(page.locator("#chipAll")).to_have_class(re.compile(r"active"))

def test_mobile_view_collapsed_by_default(browser, server):
    # Use a fresh context with mobile viewport
    context = browser.new_context(viewport={"width": 375, "height": 667})
    page = context.new_page()
    page.goto(server)

    # Wait for JS to run
    page.wait_for_timeout(500)

    toggle = page.locator("#filterToggle")
    panel = page.locator("#filterPanel")

    expect(toggle).to_have_attribute("aria-expanded", "false")
    expect(panel).to_have_class(re.compile(r"collapsed"))

    # Search should remain visible
    expect(page.locator("#searchInput")).to_be_visible()
    context.close()
