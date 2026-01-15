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
    maxWaitTime: number = 60000,
    sinceTime?: Date
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
          const code = await this.findCode(fromEmail, sinceTime);
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

  private async findCode(
    fromEmail: string,
    sinceTime?: Date
  ): Promise<string | null> {
    return new Promise((resolve, reject) => {
      // Search for unread emails from Expensify
      console.log(
        `\n🔍 Searching for emails from: ${fromEmail}${
          sinceTime ? ` (after ${sinceTime.toISOString()})` : ""
        }`
      );
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

          // Fetch all matching emails to find one with valid timestamp
          const fetch = this.imap.fetch(results, { bodies: "" });
          let resolved = false;
          const validEmails: { uid: number; code: string; date: Date }[] = [];
          let pendingCount = results.length;

          fetch.on("message", (msg, seqno) => {
            // Wait for attributes to get UID, then process body
            const uidPromise = new Promise<number | undefined>((resolveUid) => {
              msg.once("attributes", (attrs) => {
                resolveUid(attrs.uid);
              });
              
              // Fallback: if attributes never fires, resolve with undefined after timeout
              setTimeout(() => resolveUid(undefined), 1000);
            });
            
            msg.on("body", async (stream) => {
              // Wait for UID from attributes event
              const uid = await uidPromise;
              
              // If no UID, skip this message
              if (!uid || typeof uid !== 'number') {
                console.warn(`⚠️  Could not get UID for message ${seqno}, skipping`);
                pendingCount--;
                if (pendingCount === 0 && !resolved) {
                  if (validEmails.length > 0) {
                    validEmails.sort(
                      (a, b) => b.date.getTime() - a.date.getTime()
                    );
                    const best = validEmails[0];
                    if (best.uid) {
                      this.imap.addFlags(best.uid, "\\Seen", (flagErr) => {
                        if (flagErr)
                          console.warn(
                            "Warning: Could not mark email as read",
                            flagErr
                          );
                      });
                    }
                    resolved = true;
                    resolve(best.code);
                  } else {
                    resolved = true;
                    resolve(null);
                  }
                }
                return;
              }
              
              try {
                const parsed = await simpleParser(stream);
                const subject = parsed.subject || "";
                const emailDate = parsed.date;
                console.log(
                  `📧 Processing email: "${subject}" (date: ${
                    emailDate?.toISOString() || "unknown"
                  })`
                );

                // Check if email was sent after sinceTime
                if (sinceTime && emailDate && emailDate < sinceTime) {
                  console.log(`⏭️  Skipping old email (before login started)`);
                  pendingCount--;
                  if (pendingCount === 0 && !resolved) {
                    // All emails processed, return the most recent valid one
                    if (validEmails.length > 0) {
                      validEmails.sort(
                        (a, b) => b.date.getTime() - a.date.getTime()
                      );
                      const best = validEmails[0];
                      // Mark email as read
                      if (best.uid) {
                        this.imap.addFlags(best.uid, "\\Seen", (flagErr) => {
                          if (flagErr)
                            console.warn(
                              "Warning: Could not mark email as read",
                              flagErr
                            );
                        });
                      }
                      resolved = true;
                      resolve(best.code);
                    } else {
                      resolved = true;
                      resolve(null);
                    }
                  }
                  return;
                }

                // Extract code from subject line: "Expensify magic code: 147826"
                const codeMatch = subject.match(
                  /Expensify magic code:\s*(\d+)/
                );

                let code: string | null = null;
                if (codeMatch && codeMatch[1]) {
                  code = codeMatch[1];
                  console.log(`✅ Extracted code: ${code}`);
                } else {
                  // Fallback: try to extract from email body
                  const text = parsed.text || parsed.html || "";
                  const bodyCodeMatch = text.match(/(\d{6})/); // 6-digit code
                  if (bodyCodeMatch && bodyCodeMatch[1]) {
                    code = bodyCodeMatch[1];
                    console.log(`✅ Extracted code from body: ${code}`);
                  }
                }

                if (code && emailDate && uid) {
                  validEmails.push({ uid, code, date: emailDate });
                }

                pendingCount--;
                if (pendingCount === 0 && !resolved) {
                  // All emails processed, return the most recent valid one
                  if (validEmails.length > 0) {
                    validEmails.sort(
                      (a, b) => b.date.getTime() - a.date.getTime()
                    );
                    const best = validEmails[0];
                    // Mark email as read
                    if (best.uid) {
                      this.imap.addFlags(best.uid, "\\Seen", (flagErr) => {
                        if (flagErr)
                          console.warn(
                            "Warning: Could not mark email as read",
                            flagErr
                          );
                      });
                    }
                    resolved = true;
                    resolve(best.code);
                  } else {
                    console.log(`❌ No valid code found in emails`);
                    resolved = true;
                    resolve(null);
                  }
                }
              } catch (parseError) {
                console.error("Error parsing email:", parseError);
                pendingCount--;
                if (pendingCount === 0 && !resolved) {
                  if (validEmails.length > 0) {
                    validEmails.sort(
                      (a, b) => b.date.getTime() - a.date.getTime()
                    );
                    const best = validEmails[0];
                    if (best.uid) {
                      this.imap.addFlags(best.uid, "\\Seen", (flagErr) => {
                        if (flagErr)
                          console.warn(
                            "Warning: Could not mark email as read",
                            flagErr
                          );
                      });
                    }
                    resolved = true;
                    resolve(best.code);
                  } else {
                    resolved = true;
                    resolve(null);
                  }
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
