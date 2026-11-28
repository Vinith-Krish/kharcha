# Kharcha — Indian Expense Tracker

Kharcha is a responsive, privacy-friendly salary and expense tracker built for Indian households. It supports monthly salary planning, automatic carry-forward, category analytics, cash/UPI tracking, and voice-assisted expense entry.

## Features

- Monthly salary and automatic balance carry-forward
- Indian rupee formatting and India-focused categories
- Voice input such as “450 groceries via UPI”
- Category and payment-mode analytics
- CSV export
- Edit saved expenses to correct the amount, details, payment method, or date
- Offline-capable progressive web app
- Private account sync across devices

## Run locally

Serve the `dist` directory with any static web server, for example:

```powershell
npx serve dist
```

## Privacy

Expense records require sign-in. Sign-in ends when the browser session closes. Data access is enforced by the database rules, which must be deployed separately from the website. Sign out before leaving a shared device; doing so clears its local copy.

