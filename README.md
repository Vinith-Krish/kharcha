# Kharcha — Indian Expense Tracker

Kharcha is a responsive, privacy-friendly salary and expense tracker built for Indian households. It supports monthly salary planning, automatic carry-forward, category analytics, cash/UPI tracking, and voice-assisted expense entry.

## Features

- Monthly salary and automatic balance carry-forward
- Indian rupee formatting and India-focused categories
- Voice input such as “450 groceries via UPI”
- Category and payment-mode analytics
- CSV export
- Offline-capable progressive web app
- Browser-local storage; no account or backend required
- Optional Firebase account sync for the same private records across devices

## Run locally

Serve the `dist` directory with any static web server, for example:

```powershell
npx serve dist
```

## Deploy to GitHub Pages

This project is configured for the `Vinith-Krish/kharcha` repository and will be published at:

**https://vinith-krish.github.io/kharcha/**

The included workflow publishes `dist` whenever changes are pushed to `main`. In the GitHub repository settings, set Pages → Source to **GitHub Actions**.

## Cross-device sync

Create an account from the **Device only** button in the app, then sign in with the same email and password on every device. Records are cached locally for offline use and synchronized to the signed-in user's private Firestore document. Firebase security rules restrict each user to their own data.

