# Automated Login with Email Code Verification - Expensify

This guide explains how to automate the Expensify login process that requires:

1. Entering an email address
2. Waiting for a verification code email from Expensify
3. Extracting the code from the email (subject: "Expensify magic code: 147826")
4. Auto-filling the code into the web form
5. Completing the login

## Expensify-Specific Configuration

- **Login URL**: `https://dev.new.expensify.com:8082/`
- **Email Provider**: Gmail (IMAP)
- **Email Format**: Subject line contains "Expensify magic code: [NUMBERS]"
- **Code Format**: Numeric only (extracted from subject line)
- **Email Sender**: `noreply@expensify.com` (default)

## Architecture Overview

The solution consists of two main components:

- **Web Automation**: Uses Playwright (or Puppeteer) to interact with the browser
- **Email Monitoring**: Polls email inbox (via IMAP or email API) to detect and extract the verification code

## Prerequisites

- Bun runtime installed
- Access to email account (IMAP credentials or API access)
- Node.js/npm packages for email and browser automation

## Implementation Options

### Option 1: Gmail API (Recommended for Gmail)

**Pros:**

- Fast and reliable
- Real-time push notifications possible
- No need for app-specific passwords

**Cons:**

- Requires OAuth2 setup
- More complex initial setup

### Option 2: IMAP (Universal)

**Pros:**

- Works with any email provider
- Simpler authentication (username/password)
- No OAuth setup needed

**Cons:**

- Requires polling (not real-time)
- May need app-specific password for Gmail
- Slightly slower

### Option 3: Email Service APIs (SendGrid, Mailgun, etc.)

**Pros:**

- If you control the email sending service
- Can use webhooks for instant notifications

**Cons:**

- Only works if you control the email infrastructure

## Step-by-Step Implementation

### 1. Project Setup

```bash
# Initialize Bun project (if not already done)
bun init

# Install dependencies
bun add playwright imap mailparser

# Install Playwright browsers
bunx playwright install chromium
```

**Note**: This project uses IMAP for Gmail (simpler setup than Gmail API). You'll need a Gmail App Password.

### 2. Email Monitoring Service

#### Using IMAP (Universal Approach)

```typescript
// email-monitor.ts
import Imap from "imap";
import { simpleParser } from "mailparser";

interface EmailConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
}

export class EmailMonitor {
  private imap: Imap;
  private config: EmailConfig;

  constructor(config: EmailConfig) {
    this.config = config;
    this.imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
    });
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.imap.once("ready", () => resolve());
      this.imap.once("error", reject);
      this.imap.connect();
    });
  }

  async waitForCode(
    fromEmail: string,
    subjectPattern: RegExp,
    maxWaitTime: number = 60000
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkEmail = async () => {
        if (Date.now() - startTime > maxWaitTime) {
          reject(new Error("Timeout waiting for email"));
          return;
        }

        try {
          await this.openInbox();
          const code = await this.findCode(fromEmail, subjectPattern);
          if (code) {
            resolve(code);
          } else {
            // Poll every 2 seconds
            setTimeout(checkEmail, 2000);
          }
        } catch (error) {
          reject(error);
        }
      };

      checkEmail();
    });
  }

  private async openInbox(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.imap.openBox("INBOX", false, (err, box) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async findCode(
    fromEmail: string,
    subjectPattern: RegExp
  ): Promise<string | null> {
    return new Promise((resolve, reject) => {
      this.imap.search(["UNSEEN", ["FROM", fromEmail]], (err, results) => {
        if (err) {
          reject(err);
          return;
        }

        if (!results || results.length === 0) {
          resolve(null);
          return;
        }

        const fetch = this.imap.fetch(results, { bodies: "" });
        fetch.on("message", (msg) => {
          msg.on("body", async (stream) => {
            const parsed = await simpleParser(stream);
            if (subjectPattern.test(parsed.subject || "")) {
              const code = this.extractCode(parsed.text || parsed.html || "");
              if (code) {
                resolve(code);
              }
            }
          });
        });

        fetch.once("end", () => {
          resolve(null);
        });
      });
    });
  }

  private extractCode(emailBody: string): string | null {
    // For Expensify: Extract code from subject line
    // Subject format: "Expensify magic code: 147826"
    const codeMatch = emailBody.match(/Expensify magic code:\s*(\d+)/);
    return codeMatch ? codeMatch[1] : null;
  }

  disconnect(): void {
    this.imap.end();
  }
}
```

#### Using Gmail API

```typescript
// gmail-monitor.ts
import { google } from "googleapis";

export class GmailMonitor {
  private gmail: any;

  constructor(credentialsPath: string, tokenPath: string) {
    // Initialize Gmail API client
    // Requires OAuth2 setup
  }

  async waitForCode(
    fromEmail: string,
    subjectPattern: RegExp,
    maxWaitTime: number = 60000
  ): Promise<string> {
    // Poll Gmail API for new messages
    // Extract code from email body
  }
}
```

### 3. Web Automation Service

```typescript
// web-automation.ts
import { chromium, Browser, Page } from "playwright";

export class WebAutomation {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async init(): Promise<void> {
    this.browser = await chromium.launch({
      headless: false, // Set to true for headless mode
    });
    this.page = await this.browser.newPage();
  }

  async navigateToLogin(url: string): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");
    await this.page.goto(url);
  }

  async enterEmail(email: string, emailSelector: string): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");
    await this.page.fill(emailSelector, email);
    await this.page.click('button[type="submit"]'); // Adjust selector
  }

  async enterCode(code: string, codeSelector: string): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");
    await this.page.fill(codeSelector, code);
    await this.page.click('button[type="submit"]'); // Adjust selector
  }

  async waitForLoginSuccess(successIndicator: string): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");
    await this.page.waitForSelector(successIndicator);
  }

  async logout(logoutSelector: string): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");
    await this.page.click(logoutSelector);
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }
}
```

### 4. Main Automation Script

```typescript
// auto-login.ts
import { EmailMonitor } from "./email-monitor";
import { WebAutomation } from "./web-automation";

interface Config {
  email: string;
  emailPassword: string;
  loginUrl: string;
  emailSelector: string;
  codeSelector: string;
  fromEmail: string; // Email address that sends the code
  subjectPattern: RegExp; // Regex to match email subject
  imapConfig: {
    host: string;
    port: number;
    tls: boolean;
  };
}

export class AutoLogin {
  private emailMonitor: EmailMonitor;
  private webAutomation: WebAutomation;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.emailMonitor = new EmailMonitor({
      user: config.email,
      password: config.emailPassword,
      ...config.imapConfig,
    });
    this.webAutomation = new WebAutomation();
  }

  async login(): Promise<void> {
    try {
      // 1. Initialize services
      await this.emailMonitor.connect();
      await this.webAutomation.init();

      // 2. Navigate to login page
      await this.webAutomation.navigateToLogin(this.config.loginUrl);

      // 3. Enter email
      await this.webAutomation.enterEmail(
        this.config.email,
        this.config.emailSelector
      );

      // 4. Wait for email and extract code
      console.log("Waiting for verification code email...");
      const code = await this.emailMonitor.waitForCode(
        this.config.fromEmail,
        this.config.subjectPattern,
        60000 // 60 seconds timeout
      );

      console.log(`Code received: ${code}`);

      // 5. Enter code and complete login
      await this.webAutomation.enterCode(code, this.config.codeSelector);
      await this.webAutomation.waitForLoginSuccess(".dashboard"); // Adjust selector

      console.log("Login successful!");
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    } finally {
      this.emailMonitor.disconnect();
      await this.webAutomation.close();
    }
  }

  async logout(): Promise<void> {
    await this.webAutomation.logout('button[data-testid="logout"]'); // Adjust selector
  }
}

// Expensify Usage Example
const config: Config = {
  email: "your-email@gmail.com",
  emailPassword: "your-gmail-app-password", // 16-char App Password from Google
  loginUrl: "https://dev.new.expensify.com:8082/",
  emailSelector: 'input[type="email"]',
  codeSelector: 'input[type="text"][name*="code" i]',
  fromEmail: "noreply@expensify.com",
  subjectPattern: /Expensify magic code:/i,
  imapConfig: {
    host: "imap.gmail.com",
    port: 993,
    tls: true,
  },
};

const autoLogin = new AutoLogin(config);
await autoLogin.login();
```

## Configuration Examples

### Gmail IMAP Configuration

```typescript
{
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  // Note: You'll need an "App Password" from Google Account settings
}
```

### Outlook IMAP Configuration

```typescript
{
  host: 'outlook.office365.com',
  port: 993,
  tls: true,
}
```

### Custom Email Provider

```typescript
{
  host: 'mail.yourprovider.com',
  port: 993, // or 143 for non-TLS
  tls: true,
}
```

## Environment Variables (Optional, Non-Sensitive Only)

You can set non-sensitive configuration in environment variables:

```env
EMAIL=your-email@gmail.com  # Optional, will prompt if not set
LOGIN_URL=https://dev.new.expensify.com:8082/
FROM_EMAIL=noreply@expensify.com
HEADLESS=false
```

**Important**:

- ⚠️ **Passwords are never read from environment variables**
- ✅ Use macOS Keychain or interactive prompts for passwords
- ✅ Use a Gmail **App Password** (not your regular password)
- ✅ Get it from: Google Account → Security → 2-Step Verification → App passwords

## Security Considerations

### Password Storage (Secure Methods Only)

1. **macOS Keychain** (Recommended on macOS)

   - Encrypted storage managed by the OS
   - Automatically used if available
   - Store with: `security add-generic-password -s "expensify-auto-login" -a "email" -w "password"`

2. **Interactive Prompt** (Always Available)

   - Password never stored on disk
   - Only kept in memory during execution
   - Script will prompt if keychain not available

**Note:** Passwords are never read from environment variables for security.

### Best Practices

1. **Never commit credentials**: Use secure secret management (keychain, secrets manager)
2. **App Passwords**: For Gmail, use App Passwords instead of your main password
3. **OAuth2**: For Gmail API, use OAuth2 for better security (alternative to IMAP)
4. **Rate Limiting**: Implement delays between email checks to avoid being rate-limited
5. **Principle of Least Privilege**: Use read-only email access when possible

## Testing Strategy

1. **Unit Tests**: Test email parsing and code extraction separately
2. **Integration Tests**: Test email monitoring with a test email account
3. **E2E Tests**: Test full flow with a staging environment

## Troubleshooting

### Email Not Detected

- Check IMAP credentials
- Verify email filters/search criteria
- Check if email is going to spam
- Increase polling interval

### Code Extraction Fails

- Adjust regex pattern in `extractCode()` method
- Log email body to see actual format
- Handle HTML emails properly

### Browser Automation Issues

- Update selectors if website structure changes
- Add wait times for dynamic content
- Use `page.waitForSelector()` before interactions

## Advanced Features

### 1. Retry Logic

```typescript
async loginWithRetry(maxRetries: number = 3): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await this.login();
      return;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}
```

### 2. Multiple Email Providers

Support multiple email backends with a factory pattern.

### 3. Webhook Integration

If you control the email service, use webhooks for instant code delivery.

### 4. Code Caching

Cache codes temporarily to handle race conditions.

## Next Steps

1. Choose your email monitoring approach (IMAP vs Gmail API)
2. Set up email credentials (App Password for Gmail)
3. Identify CSS selectors on your login page
4. Configure email patterns (sender, subject, code format)
5. Test with a single login cycle
6. Add error handling and retry logic
7. Implement logging for debugging

## Expensify Implementation Status

✅ **Completed Configuration:**

- ✅ Email provider: Gmail (IMAP)
- ✅ Email sender: `noreply@expensify.com`
- ✅ Code format: Numeric (extracted from subject)
- ✅ Code location: Email subject line ("Expensify magic code: 147826")
- ✅ Login page: `https://dev.new.expensify.com:8082/`
- ✅ Implementation files created and ready to use

## Quick Start

1. **Set up Gmail App Password** (see README.md)
2. **Copy `.env.example` to `.env`** and fill in credentials
3. **Install dependencies**: `bun install`
4. **Install Playwright**: `bunx playwright install chromium`
5. **Run**: `bun run auto-login.ts`

See `README.md` for detailed setup instructions.
