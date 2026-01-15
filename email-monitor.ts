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
  private connected: boolean = false;

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
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      this.imap.once("ready", () => {
        this.connected = true;
        console.log("✅ Connected to email server");
        resolve();
      });
      this.imap.once("error", (err: Error) => {
        const errorMessage = err.message || err.toString();

        // Check for specific Gmail App Password error
        if (
          errorMessage.includes("Application-specific password required") ||
          (errorMessage.includes("ALERT") && errorMessage.includes("185833"))
        ) {
          console.error("\n❌ Gmail App Password Required");
          console.error("\n📋 To fix this:");
          console.error("1. Enable 2-Step Verification:");
          console.error("   https://myaccount.google.com/security");
          console.error("2. Create an App Password:");
          console.error("   https://myaccount.google.com/apppasswords");
          console.error("3. Make sure IMAP is enabled in Gmail:");
          console.error(
            "   Gmail → Settings → Forwarding and POP/IMAP → Enable IMAP"
          );
          console.error("\n💡 App Passwords are 16 characters (no spaces)");
          console.error("   Example: abcd efgh ijkl mnop");
          console.error("\n🔐 Store it in Keychain:");
          console.error(
            `   security add-generic-password -s "expensify-auto-login" -a "${this.config.user}" -w "YOUR_16_CHAR_APP_PASSWORD"`
          );
          reject(
            new Error("Gmail App Password required. See instructions above.")
          );
          return;
        }

        // Check for authentication failure
        if (
          errorMessage.includes("Invalid credentials") ||
          errorMessage.includes("AUTHENTICATIONFAILED") ||
          errorMessage.includes("authentication")
        ) {
          console.error("\n❌ Gmail Authentication Failed");
          console.error("\n📋 Possible causes:");
          console.error(
            "1. APP_PASSWORD in .env is incorrect or not a valid App Password"
          );
          console.error("2. App Password has expired or been revoked");
          console.error("3. Password contains extra spaces or characters");
          console.error("\n💡 To fix:");
          console.error(
            "1. Verify your App Password is correct (16 characters, no spaces)"
          );
          console.error(
            "2. Create a new App Password: https://myaccount.google.com/apppasswords"
          );
          console.error(
            "3. Update .env file: APP_PASSWORD=your-16-char-password"
          );
          console.error(
            "4. Make sure there are no quotes or extra spaces around the password"
          );
          console.error("\n🔍 Debug info:");
          const passwordLength = this.config.password
            ? this.config.password.length
            : 0;
          console.error(`   Password length: ${passwordLength} characters`);
          console.error(`   Email: ${this.config.user}`);
          reject(
            new Error(
              "Gmail authentication failed. Check your APP_PASSWORD in .env file."
            )
          );
          return;
        }

        console.error("❌ IMAP connection error:", err);
        reject(err);
      });
      this.imap.connect();
    });
  }

  /**
   * Waits for Expensify magic code email
   * Email subject format: "Expensify magic code: 147826"
   */
  async waitForCode(
    fromEmail: string = "noreply@expensify.com",
    maxWaitTime: number = 60000
  ): Promise<string> {
    if (!this.connected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkEmail = async () => {
        if (Date.now() - startTime > maxWaitTime) {
          reject(new Error("⏱️  Timeout waiting for email"));
          return;
        }

        try {
          await this.openInbox();
          const code = await this.findCode(fromEmail);
          if (code) {
            console.log(`📧 Code found in email: ${code}`);
            resolve(code);
          } else {
            // Poll every 2 seconds
            process.stdout.write(".");
            setTimeout(checkEmail, 2000);
          }
        } catch (error) {
          reject(error);
        }
      };

      console.log("⏳ Waiting for Expensify magic code email...");
      checkEmail();
    });
  }

  private async openInbox(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.imap.openBox("INBOX", false, (err, box) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private async findCode(fromEmail: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      // Search for unread emails from Expensify
      console.log(`\n🔍 Searching for emails from: ${fromEmail}`);
      this.imap.search(
        ["UNSEEN", ["FROM", fromEmail], ["SUBJECT", "Expensify magic code"]],
        (err, results) => {
          if (err) {
            reject(err);
            return;
          }

          console.log(`🔍 Found ${results?.length || 0} matching emails`);

          if (!results || results.length === 0) {
            resolve(null);
            return;
          }

          // Get the most recent email
          const fetch = this.imap.fetch(results.slice(-1), { bodies: "" });
          let resolved = false;

          fetch.on("message", (msg) => {
            msg.on("body", async (stream) => {
              try {
                const parsed = await simpleParser(stream);
                const subject = parsed.subject || "";
                console.log(`📧 Processing email: "${subject}"`);

                // Extract code from subject line: "Expensify magic code: 147826"
                const codeMatch = subject.match(
                  /Expensify magic code:\s*(\d+)/
                );

                if (codeMatch && codeMatch[1]) {
                  const code = codeMatch[1];
                  console.log(`✅ Extracted code: ${code}`);

                  // Mark email as read
                  this.imap.addFlags(
                    results[results.length - 1],
                    "\\Seen",
                    (flagErr) => {
                      if (flagErr)
                        console.warn(
                          "Warning: Could not mark email as read",
                          flagErr
                        );
                    }
                  );

                  if (!resolved) {
                    resolved = true;
                    resolve(code);
                  }
                } else {
                  // Fallback: try to extract from email body
                  const text = parsed.text || parsed.html || "";
                  const bodyCodeMatch = text.match(/(\d{6})/); // 6-digit code
                  if (bodyCodeMatch && bodyCodeMatch[1]) {
                    console.log(`✅ Extracted code from body: ${bodyCodeMatch[1]}`);
                    if (!resolved) {
                      resolved = true;
                      resolve(bodyCodeMatch[1]);
                    }
                  } else {
                    console.log(`❌ No code found in email`);
                    if (!resolved) {
                      resolved = true;
                      resolve(null);
                    }
                  }
                }
              } catch (parseError) {
                console.error("Error parsing email:", parseError);
                if (!resolved) {
                  resolved = true;
                  resolve(null);
                }
              }
            });
          });

          fetch.once("error", (err) => {
            if (!resolved) {
              resolved = true;
              reject(err);
            }
          });
        }
      );
    });
  }

  disconnect(): void {
    if (this.connected) {
      this.imap.end();
      this.connected = false;
      console.log("📧 Disconnected from email server");
    }
  }
}
