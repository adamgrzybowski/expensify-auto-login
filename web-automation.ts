import { chromium, Browser, Page } from 'playwright';

export class WebAutomation {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async init(headless: boolean = false, devtools: boolean = false): Promise<void> {
    const args = ['--start-maximized'];
    if (devtools) {
      args.push('--auto-open-devtools-for-tabs');
    }

    this.browser = await chromium.launchPersistentContext('./browser-data', {
      headless,
      slowMo: 100,
      viewport: null,
      args,
    });

    this.page = this.browser.pages()[0] || await this.browser.newPage();
  }

  async navigateToLogin(url: string): Promise<void> {
    if (!this.page) throw new Error('Browser not initialized');
    console.log(`🌐 Navigating to ${url}`);
    await this.page.goto(url, { waitUntil: 'networkidle' });
  }

  /**
   * Enters email and submits the form
   * Adjust selectors based on actual Expensify login page structure
   */
  async enterEmail(email: string): Promise<boolean> {
    if (!this.page) throw new Error('Browser not initialized');

    // Wait for email input to be visible
    // Try multiple possible selectors
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[id*="email"]',
      'input[placeholder*="email" i]',
      'input[placeholder*="Email" i]',
    ];

    let emailInput = null;
    for (const selector of emailSelectors) {
      try {
        emailInput = await this.page.waitForSelector(selector, { timeout: 5000 });
        if (emailInput) break;
      } catch (e) {
        // Try next selector
      }
    }

    if (!emailInput) {
      const url = this.page.url();
      if (!url.includes('/login') && !url.includes('/signin')) {
        console.log('Already logged in, skipping login process');
        return false;
      }
      throw new Error('Could not find email input field');
    }

    console.log(`✉️  Entering email: ${email}`);
    await this.page.fill(emailSelectors.find(s => emailInput) || emailSelectors[0], email);

    // Find and click submit button
    const submitSelectors = [
      'button[type="submit"]',
      'button:has-text("Continue")',
      'button:has-text("Send")',
      'button:has-text("Next")',
      '[role="button"]:has-text("Continue")',
    ];

    let submitted = false;
    for (const selector of submitSelectors) {
      try {
        const button = await this.page.$(selector);
        if (button) {
          await button.click();
          submitted = true;
          console.log('✅ Email submitted');
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }

    if (!submitted) {
      // Try pressing Enter as fallback
      await this.page.press(emailSelectors[0], 'Enter');
      console.log('✅ Email submitted (via Enter key)');
    }

    // Wait a bit for the form to process
    await this.page.waitForTimeout(1000);
    return true;
  }

  /**
   * Enters the verification code and submits
   */
  async enterCode(code: string): Promise<void> {
    if (!this.page) throw new Error('Browser not initialized');

    // Wait for code input to appear
    // Ordered by likelihood for Expensify
    const codeSelectors = [
      'input[inputmode="numeric"]',
      'input[type="number"]',
      'input[type="text"][name*="code" i]',
      'input[type="text"][id*="code" i]',
      'input[placeholder*="code" i]',
      'input[placeholder*="magic" i]',
    ];

    console.log('⏳ Waiting for code input field...');
    let codeInput = null;
    let foundSelector = '';
    for (const selector of codeSelectors) {
      try {
        codeInput = await this.page.waitForSelector(selector, { timeout: 2000 });
        if (codeInput) {
          foundSelector = selector;
          console.log(`🔑 Found code input with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }

    if (!codeInput || !foundSelector) {
      // Log page content for debugging
      console.error('Available inputs on page:', await this.page.$$eval('input', (inputs) =>
        inputs.map(i => ({
          type: i.type,
          name: i.name,
          id: i.id,
          placeholder: i.placeholder,
          inputmode: i.inputMode,
        }))
      ));
      throw new Error('Could not find code input field');
    }

    console.log(`🔑 Entering code: ${code}`);
    await this.page.fill(foundSelector, code);

    // Submit the code
    const submitSelectors = [
      'button[type="submit"]',
      'button:has-text("Continue")',
      'button:has-text("Verify")',
      'button:has-text("Login")',
      '[role="button"]:has-text("Continue")',
    ];

    let submitted = false;
    for (const selector of submitSelectors) {
      try {
        const button = await this.page.$(selector);
        if (button) {
          await button.click();
          submitted = true;
          console.log('✅ Code submitted');
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }

    if (!submitted) {
      // Try pressing Enter as fallback
      await this.page.press(foundSelector, 'Enter');
      console.log('✅ Code submitted (via Enter key)');
    }

    // Wait a bit for login to complete
    await this.page.waitForTimeout(2000);
  }

  /**
   * Waits for login success indicator
   */
  async waitForLoginSuccess(
    successIndicators: string[] = [
      '[data-testid="workspace"]',
      '.workspace',
      '[aria-label*="workspace" i]',
      'nav',
      'header',
    ]
  ): Promise<void> {
    if (!this.page) throw new Error('Browser not initialized');

    console.log('⏳ Waiting for login to complete...');
    
    // Wait for any success indicator
    for (const selector of successIndicators) {
      try {
        await this.page.waitForSelector(selector, { timeout: 10000 });
        console.log('✅ Login successful!');
        return;
      } catch (e) {
        // Try next indicator
      }
    }

    // If no specific indicator found, just wait a bit and check URL
    await this.page.waitForTimeout(3000);
    const url = this.page.url();
    if (!url.includes('/login') && !url.includes('/signin')) {
      console.log('✅ Login successful! (URL changed)');
      return;
    }

    console.log('⚠️  Could not confirm login success, but continuing...');
  }

  /**
   * Logs out from Expensify
   */
  async logout(): Promise<void> {
    if (!this.page) throw new Error('Browser not initialized');

    const logoutSelectors = [
      'button:has-text("Logout")',
      'button:has-text("Log out")',
      '[data-testid="logout"]',
      '[aria-label*="logout" i]',
      'a[href*="logout"]',
    ];

    for (const selector of logoutSelectors) {
      try {
        const button = await this.page.$(selector);
        if (button) {
          await button.click();
          console.log('👋 Logged out');
          await this.page.waitForTimeout(1000);
          return;
        }
      } catch (e) {
        // Try next selector
      }
    }

    console.log('⚠️  Could not find logout button');
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      console.log('🔒 Browser closed');
    }
  }

  getPage(): Page | null {
    return this.page;
  }
}
