#!/usr/bin/env bun
/**
 * Helper script to verify and update Gmail App Password in Keychain
 * 
 * Usage: bun run verify-app-password.ts
 */

import { spawn } from "child_process";

const service = "expensify-auto-login";

async function getFromKeychain(account: string): Promise<string | null> {
  return new Promise((resolve) => {
    const security = spawn("security", [
      "find-generic-password",
      "-s",
      service,
      "-a",
      account,
      "-w",
    ]);

    let password = "";
    security.stdout.on("data", (data) => {
      password += data.toString();
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

async function main() {
  const email = process.env.EMAIL || process.argv[2];
  
  if (!email) {
    console.error("❌ Please provide email:");
    console.error("   bun run verify-app-password.ts your-email@gmail.com");
    console.error("   or set EMAIL environment variable");
    process.exit(1);
  }

  console.log(`🔍 Checking Keychain for: ${email}\n`);

  const password = await getFromKeychain(email);
  
  if (!password) {
    console.log("❌ No password found in Keychain");
    console.log("\n💡 To add App Password to Keychain:");
    console.log(`   security add-generic-password -s "${service}" -a "${email}" -w "YOUR_16_CHAR_APP_PASSWORD"`);
    process.exit(1);
  }

  // Check format
  const cleanPassword = password.replace(/\s/g, '');
  const length = cleanPassword.length;

  console.log(`📏 Password length: ${length} characters`);
  
  if (length === 16) {
    console.log("✅ Password format is correct (16 characters)");
  } else {
    console.log(`⚠️  Warning: App Password should be 16 characters, got ${length}`);
    console.log("\n💡 This might be a regular password, not an App Password.");
    console.log("\n📋 To create a new App Password:");
    console.log("1. Enable 2-Step Verification: https://myaccount.google.com/security");
    console.log("2. Create App Password: https://myaccount.google.com/apppasswords");
    console.log("3. Update Keychain:");
    console.log(`   security add-generic-password -U -s "${service}" -a "${email}" -w "NEW_16_CHAR_PASSWORD"`);
    process.exit(1);
  }

  // Check if it contains spaces (might be formatted)
  if (password.includes(' ')) {
    console.log("ℹ️  Password contains spaces (will be cleaned automatically)");
  }

  console.log("\n✅ App Password in Keychain looks correct!");
  console.log("\n💡 If you still get 'Application-specific password required' error:");
  console.log("   1. Verify IMAP is enabled in Gmail settings");
  console.log("   2. Make sure 2-Step Verification is enabled");
  console.log("   3. Try creating a new App Password");
}

if (import.meta.main) {
  main();
}
