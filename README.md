# Expensify Auto Login

Automates Expensify login by monitoring Gmail for magic codes.

## Setup

### 1. Install

```bash
bun install
bunx playwright install chromium
```

### 2. Create Gmail App Password

1. Enable 2-Step Verification: https://myaccount.google.com/security
2. Create App Password: https://myaccount.google.com/apppasswords

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```env
EMAIL=your-email@gmail.com
APP_PASSWORD=your16charpassword
LOGIN_URL=https://new.expensify.com/
FROM_EMAIL=concierge@expensify.com
HEADLESS=false
DEVTOOLS=false
```

## Usage

```bash
bun start
```

Press Ctrl+C to exit.

## Notes

- Supports email aliases (e.g., `user+tag@domain.com` logs in but receives codes at `user@domain.com`)
- Browser state persisted in `browser-data/`
- Set `DEVTOOLS=true` to open DevTools (undock manually on first run)
