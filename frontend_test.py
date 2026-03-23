import os
from playwright.sync_api import sync_playwright

def verify_frontend():
    os.makedirs("/home/jules/verification", exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Mobile Viewport
        context = browser.new_context(viewport={'width': 375, 'height': 812})
        page = context.new_page()

        page.goto("http://localhost:5173")
        page.wait_for_timeout(3000)

        page.screenshot(path="/home/jules/verification/mobile.png")
        browser.close()

if __name__ == "__main__":
    verify_frontend()
