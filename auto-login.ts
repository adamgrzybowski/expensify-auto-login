import { EmailMonitor } from "./email-monitor";
import { WebAutomation } from "./web-automation";

interface Config {
  email: string;
  emailPassword: string;
  loginUrl: string;
  fromEmail: string;
  headless: boolean;
  devtools: boolean;
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
      console.log("Starting login...\n");

      await this.emailMonitor.connect();
      await this.webAutomation.init(this.config.headless, this.config.devtools);
      await this.webAutomation.navigateToLogin(this.config.loginUrl);
      await this.webAutomation.enterEmail(this.config.email);

      const code = await this.emailMonitor.waitForCode(this.config.fromEmail, 60000);
      console.log("");

      await this.webAutomation.enterCode(code);
      await this.webAutomation.waitForLoginSuccess();

      console.log("\nDone!\n");
    } catch (error) {
      console.error("\nLogin failed:", error);
      throw error;
    } finally {
      this.emailMonitor.disconnect();
    }
  }

  async close(): Promise<void> {
    await this.webAutomation.close();
  }
}

async function loadEnv() {
  // @ts-ignore
  if (typeof Bun !== "undefined") {
    // @ts-ignore
    const envFile = Bun.file(".env");
    if (await envFile.exists()) {
      const text = await envFile.text();
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
          const [key, ...valueParts] = trimmed.split("=");
          const value = valueParts.join("=").trim();
          if (key && value) {
            process.env[key] = value;
          }
        }
      }
    }
  }
}

async function main() {
  await loadEnv();

  const email = process.env.EMAIL;
  const password = process.env.APP_PASSWORD?.replace(/\s/g, "");
  const loginUrl = process.env.LOGIN_URL || "https://new.expensify.com/";
  const fromEmail = process.env.FROM_EMAIL || "concierge@expensify.com";
  const headless = process.env.HEADLESS === "true";
  const devtools = process.env.DEVTOOLS === "true";

  if (!email || !password) {
    console.error("Missing EMAIL or APP_PASSWORD in .env");
    process.exit(1);
  }

  const autoLogin = new AutoLogin({
    email,
    emailPassword: password,
    loginUrl,
    fromEmail,
    headless,
    devtools,
  });

  try {
    await autoLogin.login();

    console.log("Browser open. Press Ctrl+C to exit.\n");

    process.on("SIGINT", async () => {
      console.log("\nClosing...");
      await autoLogin.close();
      process.exit(0);
    });

    await new Promise(() => {});
  } catch {
    await autoLogin.close();
    process.exit(1);
  }
}

// @ts-ignore
if (import.meta.main) {
  main();
}
