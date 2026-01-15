import { EmailMonitor } from "./email-monitor";
import { WebAutomation } from "./web-automation";
import { getEmailPassword, getEmail } from "./credentials";

// Bun automatically loads .env files, but we'll load it explicitly in main()

interface Config {
  email: string;
  emailPassword: string; // Gmail App Password
  loginUrl: string;
  fromEmail?: string; // Email sender (default: noreply@expensify.com)
  headless?: boolean; // Run browser in headless mode
  devtools?: boolean; // Open DevTools automatically
  maxWaitTime?: number; // Max time to wait for email (ms)
}

// Strip +tag from email (e.g., user+tag@domain.com -> user@domain.com)
function stripEmailTag(email: string): string {
  return email.replace(/\+[^@]+@/, '@');
}

export class AutoLogin {
  private emailMonitor: EmailMonitor;
  private webAutomation: WebAutomation;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    // Use email without +tag for IMAP connection
    const imapEmail = stripEmailTag(config.email);
    this.emailMonitor = new EmailMonitor({
      user: imapEmail,
      password: config.emailPassword,
      host: "imap.gmail.com",
      port: 993,
      tls: true,
    });
    this.webAutomation = new WebAutomation();
  }

  async login(): Promise<void> {
    try {
      console.log("🚀 Starting automated login process...\n");

      // 1. Initialize services
      await this.emailMonitor.connect();
      await this.webAutomation.init(this.config.headless || false, this.config.devtools || false);

      // 2. Navigate to login page
      await this.webAutomation.navigateToLogin(this.config.loginUrl);

      // 3. Enter email
      await this.webAutomation.enterEmail(this.config.email);

      // 4. Wait for email and extract code
      const code = await this.emailMonitor.waitForCode(
        this.config.fromEmail || "noreply@expensify.com",
        this.config.maxWaitTime || 60000
      );

      console.log(`\n📧 Code received: ${code}\n`);

      // 5. Enter code and complete login
      await this.webAutomation.enterCode(code);
      await this.webAutomation.waitForLoginSuccess();

      console.log("\n🎉 Login process completed successfully!\n");
    } catch (error) {
      console.error("\n❌ Login failed:", error);
      throw error;
    } finally {
      this.emailMonitor.disconnect();
      // Don't close browser automatically - user might want to interact
      // await this.webAutomation.close();
    }
  }

  async logout(): Promise<void> {
    await this.webAutomation.logout();
  }

  async close(): Promise<void> {
    await this.webAutomation.close();
  }
}

// Main execution
async function main() {
  // Explicitly load .env file FIRST to ensure APP_PASSWORD is available
  try {
    // @ts-ignore - Bun global
    if (typeof Bun !== "undefined") {
      // @ts-ignore - Bun.file
      const envFile = Bun.file(".env");
      if (await envFile.exists()) {
        const text = await envFile.text();
        console.log("📄 Loading .env file...");
        let loadedCount = 0;
        let foundAppPassword = false;
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
            const [key, ...valueParts] = trimmed.split("=");
            const value = valueParts.join("=").trim();
            if (key && value) {
              // Always set, even if already exists (env file takes precedence)
              process.env[key] = value;
              loadedCount++;
              if (key === "APP_PASSWORD") {
                foundAppPassword = true;
                console.log(
                  `✅ Found APP_PASSWORD in .env (raw value length: ${value.length})`
                );
              }
            }
          }
        }
        console.log(`📄 Loaded ${loadedCount} variables from .env`);
        if (!foundAppPassword) {
          console.log("⚠️  APP_PASSWORD not found in .env file");
        }
      } else {
        console.log("⚠️  .env file not found");
      }
    }
  } catch (error) {
    console.error("❌ Error loading .env file:", error);
  }

  // Debug: Check if APP_PASSWORD is loaded
  if (process.env.APP_PASSWORD) {
    const cleanPassword = process.env.APP_PASSWORD.trim().replace(/\s/g, "");
    console.log(
      `✅ APP_PASSWORD found in environment (${cleanPassword.length} characters after cleanup)`
    );
  } else {
    console.log(
      "❌ APP_PASSWORD not found in environment, will check Keychain"
    );
    const appVars = Object.keys(process.env).filter((k) => k.startsWith("APP"));
    if (appVars.length > 0) {
      console.log(
        `   Available env vars starting with APP: ${appVars.join(", ")}`
      );
    }
  }

  // Load configuration - prefer secure methods
  let email = process.env.EMAIL;

  // Check if email is still the template value
  if (email === "your-email@gmail.com") {
    console.warn(
      "⚠️  Warning: EMAIL in .env file is still the template value."
    );
    console.warn(
      "   Please update your .env file with your actual email address."
    );
    console.warn("   Falling back to interactive prompt...\n");
    email = await getEmail();
  } else if (!email) {
    email = await getEmail();
  }

  const loginUrl =
    process.env.LOGIN_URL || "https://dev.new.expensify.com:8082/";
  const fromEmail = process.env.FROM_EMAIL || "noreply@expensify.com";
  const headless = process.env.HEADLESS === "true";
  const devtools = process.env.DEVTOOLS === "true";

  // Get password securely (keychain or interactive prompt only)
  // Set USE_KEYCHAIN=false to skip keychain and use prompt only
  const useKeychain = process.env.USE_KEYCHAIN !== "false";
  const emailPassword = await getEmailPassword(email, useKeychain);

  const config: Config = {
    email,
    emailPassword,
    loginUrl,
    fromEmail,
    headless,
    devtools,
    maxWaitTime: 60000, // 60 seconds
  };

  const autoLogin = new AutoLogin(config);

  try {
    await autoLogin.login();

    // Keep browser open for user interaction
    console.log("💡 Browser will remain open. Press Ctrl+C to exit.");
    console.log(
      "💡 You can call autoLogin.logout() or autoLogin.close() programmatically.\n"
    );

    // Keep process alive
    process.on("SIGINT", async () => {
      console.log("\n\n👋 Closing browser and exiting...");
      await autoLogin.close();
      process.exit(0);
    });

    // Wait indefinitely (or until user closes)
    await new Promise(() => {});
  } catch (error) {
    await autoLogin.close();
    process.exit(1);
  }
}

// Run if executed directly (Bun-specific check)
// @ts-ignore - Bun-specific property
if (import.meta.main) {
  main();
}
