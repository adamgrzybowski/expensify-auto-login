/**
 * Secure credential management
 * Only uses secure methods: macOS Keychain or interactive prompts
 */

import { spawn } from "child_process";

/**
 * Get password from macOS Keychain
 */
async function getFromKeychain(
  service: string,
  account: string
): Promise<string | null> {
  if (process.platform !== "darwin") {
    return null;
  }

  return new Promise((resolve) => {
    const security = spawn("security", [
      "find-generic-password",
      "-s",
      service,
      "-a",
      account,
      "-w", // Write password to stdout
    ]);

    let password = "";
    let error = "";

    security.stdout.on("data", (data) => {
      password += data.toString();
    });

    security.stderr.on("data", (data) => {
      error += data.toString();
    });

    security.on("close", (code) => {
      if (code === 0 && password.trim()) {
        resolve(password.trim());
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Store password in macOS Keychain
 */
async function storeInKeychain(
  service: string,
  account: string,
  password: string
): Promise<boolean> {
  if (process.platform !== "darwin") {
    return false;
  }

  return new Promise((resolve) => {
    const security = spawn("security", [
      "add-generic-password",
      "-U", // Update if exists
      "-s",
      service,
      "-a",
      account,
      "-w",
      password,
    ]);

    security.on("close", (code) => {
      resolve(code === 0);
    });
  });
}

/**
 * Prompt for password securely (hides input)
 */
async function promptPassword(message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const readline = require("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Hide input
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (!wasRaw) stdin.setRawMode(true);

    process.stdout.write(message);
    let password = "";

    stdin.on("data", (char: Buffer) => {
      const str = char.toString();
      const code = char[0];

      // Handle special characters
      if (code === 3 || code === 4) {
        // Ctrl+C or Ctrl+D
        stdin.setRawMode(wasRaw);
        rl.close();
        process.exit(1);
      } else if (code === 13 || code === 10) {
        // Enter
        stdin.setRawMode(wasRaw);
        rl.close();
        process.stdout.write("\n");
        resolve(password);
      } else if (code === 127 || code === 8) {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else {
        // Regular character
        password += str;
        process.stdout.write("*");
      }
    });
  });
}

/**
 * Get email password using secure methods in order:
 * 1. APP_PASSWORD environment variable
 * 2. System keychain (macOS) - if available
 * 3. Interactive prompt - always available as fallback
 */
export async function getEmailPassword(
  email: string,
  useKeychain: boolean = true
): Promise<string> {
  const service = "expensify-auto-login";
  const account = email;

  // Try APP_PASSWORD environment variable first (highest priority)
  const envPassword = process.env.APP_PASSWORD;
  if (envPassword && envPassword.trim()) {
    // Remove all spaces and quotes that might be around the password
    let cleanPassword = envPassword.trim();
    // Remove quotes if present
    if (
      (cleanPassword.startsWith('"') && cleanPassword.endsWith('"')) ||
      (cleanPassword.startsWith("'") && cleanPassword.endsWith("'"))
    ) {
      cleanPassword = cleanPassword.slice(1, -1).trim();
    }
    // Remove all spaces
    cleanPassword = cleanPassword.replace(/\s/g, "");

    if (cleanPassword.length === 16) {
      console.log("🔐 Using APP_PASSWORD from environment variable");
      return cleanPassword;
    } else {
      console.warn(
        `⚠️  APP_PASSWORD in environment is ${cleanPassword.length} characters (should be 16).`
      );
      console.warn(
        "   Gmail App Passwords must be exactly 16 characters with no spaces."
      );
      console.warn(
        "   Check your .env file - remove any quotes or spaces around the password."
      );
      // Still return it, but warn the user
      return cleanPassword;
    }
  }

  // Only check Keychain if APP_PASSWORD is not set
  console.log(
    "ℹ️  APP_PASSWORD not found in environment, checking Keychain..."
  );

  // Try keychain (macOS)
  if (useKeychain && process.platform === "darwin") {
    const keychainPassword = await getFromKeychain(service, account);
    if (keychainPassword) {
      // Validate App Password format (16 chars, typically no spaces when stored)
      const cleanPassword = keychainPassword.trim().replace(/\s/g, "");
      if (cleanPassword.length === 16) {
        console.log("🔐 Using password from macOS Keychain");
        return cleanPassword;
      } else {
        console.warn(
          `⚠️  Password in Keychain is ${cleanPassword.length} characters.`
        );
        console.warn("   Gmail App Passwords should be 16 characters.");
        console.warn(
          "   Please update the password in Keychain with a valid App Password."
        );
        // Still return it, but warn the user
        return cleanPassword;
      }
    }
  }

  // Interactive prompt (secure fallback)
  if (process.platform === "darwin") {
    console.log("🔒 Password not found in macOS Keychain.");
    console.log("💡 Tip: Store password in Keychain for convenience:");
    console.log(
      `   security add-generic-password -s "${service}" -a "${account}" -w "YOUR_PASSWORD"`
    );
    console.log("");
  }

  const password = await promptPassword(
    `Enter Gmail App Password for ${email}: `
  );

  // Optionally store in keychain
  if (useKeychain && process.platform === "darwin") {
    const store = await promptPassword(
      "Store password in macOS Keychain? (y/n): "
    );
    if (store.toLowerCase() === "y") {
      const stored = await storeInKeychain(service, account, password);
      if (stored) {
        console.log("✅ Password stored in Keychain");
      } else {
        console.warn("⚠️  Failed to store in Keychain");
      }
    }
  }

  return password;
}

/**
 * Get email from environment or prompt
 */
export async function getEmail(): Promise<string> {
  const email = process.env.EMAIL;
  if (email) {
    return email;
  }

  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("Enter your Gmail address: ", (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
