# Expensify Auto Login

Automated login for Expensify that handles the email verification code flow automatically.

## Features

- ✅ Automatically enters your email
- ✅ Monitors Gmail for the magic code email
- ✅ Extracts code from email subject: "Expensify magic code: 147826"
- ✅ Auto-fills code into the login form
- ✅ Completes the login process

## Prerequisites

1. **Bun** installed ([bun.sh](https://bun.sh))
2. **Gmail account** with App Password enabled
3. **Playwright browsers** installed

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Install Playwright Browsers

```bash
bunx playwright install chromium
```

### 3. Enable Gmail IMAP and Create App Password

**Important:** Gmail requires an App Password (not your regular password) for IMAP access.

#### Step 1: Enable 2-Step Verification

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** (required for App Passwords)

#### Step 2: Enable IMAP in Gmail

1. Open [Gmail Settings](https://mail.google.com/mail/u/0/#settings/general)
2. Go to **Forwarding and POP/IMAP** tab
3. Enable **IMAP access**
4. Click **Save Changes**

#### Step 3: Create App Password

1. Go to [App Passwords](https://myaccount.google.com/apppasswords)
2. Select **Mail** as the app
3. Select **Other (Custom name)** as device
4. Enter name: "Expensify Auto Login"
5. Click **Generate**
6. Copy the 16-character password (format: `abcd efgh ijkl mnop`)

**Note:**

- App Passwords only appear if 2-Step Verification is enabled
- Some Google Workspace accounts may have this disabled by admin
- Advanced Protection accounts may not support App Passwords

### 4. Configure Credentials

**🔒 Security:** Passwords can be stored in environment variables (`APP_PASSWORD`) or macOS Keychain.

#### Option A: Environment Variable (Easiest)

Add `APP_PASSWORD` to your `.env` file:

```bash
# Copy the example file
cp env.example .env

# Edit .env and add your App Password
APP_PASSWORD=your-16-char-app-password
```

The script will use `APP_PASSWORD` from environment if available.

#### Option B: macOS Keychain (Recommended for macOS)

Store your password securely in macOS Keychain:

```bash
security add-generic-password \
  -s "expensify-auto-login" \
  -a "your-email@gmail.com" \
  -w "your-16-char-app-password"
```

The script will automatically use the keychain password if `APP_PASSWORD` is not set.

#### Option C: Interactive Prompt (Fallback)

If neither `APP_PASSWORD` nor Keychain is available, the script will prompt you:

```bash
bun run auto-login.ts
```

The password is only kept in memory during execution.

### Environment Variables

You can set configuration in environment variables or a `.env` file:

```bash
# Copy the example file
cp env.example .env

# Then edit .env with your values
```

Example `.env` file:

```env
# Your Gmail address (optional - will prompt if not set)
EMAIL=your-email@gmail.com

# Gmail App Password (16 characters, no spaces)
APP_PASSWORD=your-16-char-app-password

# Expensify login URL
LOGIN_URL=https://dev.new.expensify.com:8082/

# Email sender address (usually Expensify)
FROM_EMAIL=noreply@expensify.com

# Run browser in headless mode (true/false)
HEADLESS=false
```

**Note:** The script checks for password in this order:

1. `APP_PASSWORD` environment variable
2. macOS Keychain (if on macOS)
3. Interactive prompt

## Usage

### Basic Login

```bash
bun run auto-login.ts
```

Or using the npm script:

```bash
bun start
```

### Programmatic Usage

```typescript
import { AutoLogin } from "./auto-login";

const autoLogin = new AutoLogin({
  email: "your-email@gmail.com",
  emailPassword: "your-app-password",
  loginUrl: "https://dev.new.expensify.com:8082/",
  headless: false,
});

await autoLogin.login();
// Browser stays open for interaction
// await autoLogin.logout();
// await autoLogin.close();
```

## How It Works

1. **Email Monitoring**: Connects to Gmail via IMAP and polls for unread emails with subject "Expensify magic code:"
2. **Code Extraction**: Extracts the numeric code from the email subject line
3. **Browser Automation**: Uses Playwright to:
   - Navigate to the login page
   - Enter your email address
   - Wait for the code input field
   - Enter the extracted code
   - Complete the login

## Troubleshooting

### "Application-specific password required"

This error means you're using a regular Gmail password instead of an App Password.

**Solution:**

1. Verify your password is an App Password (16 characters):

   ```bash
   bun run verify-password your-email@gmail.com
   ```

2. If it's not an App Password, create one:

   - Enable 2-Step Verification: https://myaccount.google.com/security
   - Create App Password: https://myaccount.google.com/apppasswords
   - Update Keychain:
     ```bash
     security add-generic-password -U -s "expensify-auto-login" -a "your-email@gmail.com" -w "NEW_16_CHAR_PASSWORD"
     ```

3. Make sure IMAP is enabled in Gmail:
   - Gmail → Settings → Forwarding and POP/IMAP → Enable IMAP

**Note:** Some accounts (Google Workspace, Advanced Protection) may not support App Passwords.

### "Could not find email input field"

The login page structure might have changed. You can:

1. Run with `HEADLESS=false` to see what's happening
2. Check the console output for available selectors
3. Update selectors in `web-automation.ts`

### "Timeout waiting for email"

- Check that your Gmail App Password is correct
- Verify 2-Step Verification is enabled
- Check if the email went to spam
- Increase `maxWaitTime` in the config

### "IMAP connection error"

- Verify your Gmail App Password (not your regular password)
- Check that IMAP is enabled in Gmail settings
- Ensure you're using the correct IMAP settings:
  - Host: `imap.gmail.com`
  - Port: `993`
  - TLS: `true`

### Email Not Detected

- Make sure the email subject matches exactly: "Expensify magic code:"
- Check that the email is unread
- Verify the `FROM_EMAIL` matches the sender

## Customization

### Adjusting Selectors

If the Expensify login page changes, update the selectors in `web-automation.ts`:

```typescript
// Email input selectors
const emailSelectors = [
  'input[type="email"]',
  'input[name="email"]',
  // Add more selectors as needed
];

// Code input selectors
const codeSelectors = [
  'input[type="text"][name*="code" i]',
  // Add more selectors as needed
];
```

### Changing Email Pattern

If the email format changes, update the regex in `email-monitor.ts`:

```typescript
// Current pattern: "Expensify magic code: 147826"
const codeMatch = subject.match(/Expensify magic code:\s*(\d+)/);
```

## Security Best Practices

### Password Storage Methods

The script only uses secure credential storage:

1. **macOS Keychain** (encrypted, OS-managed) ✅ Recommended on macOS
2. **Interactive Prompt** (memory only, never stored) ✅ Always available

### Security Features

- ✅ **No `.env` password storage** - passwords are never read from environment variables
- ✅ **macOS Keychain integration** - encrypted storage managed by the OS
- ✅ **Interactive prompts** - passwords only exist in memory during execution
- ✅ **App Passwords required** - use Gmail App Passwords, not your main password

### Disable Keychain

To skip keychain and always use interactive prompt:

```bash
USE_KEYCHAIN=false bun run auto-login.ts
```

## Project Structure

```
expensify-auto-login/
├── auto-login.ts          # Main script
├── email-monitor.ts       # Gmail IMAP email monitoring
├── web-automation.ts      # Playwright browser automation
├── package.json           # Dependencies
├── .env.example          # Example environment variables
├── .env                  # Your actual credentials (not in git)
├── README.md             # This file
└── IMPLEMENTATION_GUIDE.md # Detailed implementation guide
```

## License

MIT
