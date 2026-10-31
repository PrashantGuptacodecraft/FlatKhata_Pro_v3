# What changed from the original single-file app

## What the original got right (kept)

- The 7-day rule is strict: more than 7 days is deducted, 7 or fewer is not.
- The pro-rata formula and the greedy who-pays-whom matching are correct, and produce the same answers here (₹50/day, 140 active days, the same four transfers).
- Each person's purchases are locked to them.
- UPI deep links for paying.
- The five-person roster and the five UPI IDs.

## Problems found in the original

| # | Problem | Impact | Fix |
| --- | --- | --- | --- |
| 1 | "Email report to all 5" only opened a mail link or logged a line. The month-end email setting was a checkbox with no scheduler behind it. | No email was ever sent. | Real SMTP email (nodemailer), a daily scheduler that fires on the last day, personal emails, a send log, and a catch-up after restarts. |
| 2 | Passwords were stored in plain text in the browser. The login screen displayed every member's password as a quick-fill button. | Anyone at the phone could read all five passwords. | bcrypt hashes on the server. No password is ever displayed. |
| 3 | Each person's data lived in their own browser's localStorage. | Flatmates never saw each other's purchases. The "shared" khata wasn't shared. | One server holds the data. Every phone reads and writes it. |
| 4 | No password change for real, no admin, and nobody could change someone else's password. | Lockouts could not be fixed. | Change own password, a forced first change, admin reset for everyone, and unique passwords across the flat. |
| 5 | Anyone could switch to anyone, because passwords were visible. | No real protection. | Sign-in per person, with rate limiting and token revocation. |
| 6 | Item names were inserted into the page as raw HTML. | Cross-site scripting: an item name like `<img onerror=…>` would run code. | Every value is escaped before display. Tested. |
| 7 | Leave was one number per member, never reset. | Last month's trip counted this month. | Leave is stored per month. |
| 8 | The month length was a dropdown (30, 31, 28) with hard-coded labels. | The wrong length was easy to pick. | The real calendar length is used automatically. |
| 9 | The default purchase date was hard-coded to 24 Nov 2026. | Purchases were added to the wrong day. | The date comes from the server's clock in the flat's timezone. |
| 10 | "Reset demo data" deleted everything with no backup. | Data could be lost by one tap. | Removed. Backups are a folder copy (see SETUP). |
| 11 | `maximum-scale=1.0, user-scalable=no` in the viewport. | People with low vision could not zoom. | Zoom allowed. Input text is 16px, so iOS does not zoom in on fields. |
| 12 | Relied on Tailwind and Font Awesome from CDNs. | Broke offline or when a CDN was blocked. | Own stylesheet. Only Google Fonts is loaded, and the app falls back to system fonts. |
| 13 | Email addresses in the file differed from the reference spec (for example `aditya.flatkhata@gmail.com` vs `aditya.kitchen@gmail.com`). | Unclear which were correct. | Used the reference spec's addresses. Check `members.json` before the first start. |

## Design changes

- **Look:** the original was a dark slate and indigo SaaS-style app. This version is a warm ink-and-paper ledger style, with one saffron accent, a serif for amounts, and ledger-style rows instead of stacked cards. Phone-first, with 48px touch targets, a bottom tab bar and safe-area support.
- **Navigation:** the five tabs are the same (Home, Khata, Hisab, Leave, Me). Sign-in is per person, so there's no separate "guest" view. Anyone who can see the numbers must sign in.
- **Presets:** the six one-tap sabzi and ration presets are kept.
- **Receipts:** bill photos are shrunk in the browser before upload, so a phone photo is a few hundred KB.

## Not carried over

- The November demo purchases and leave days. The app starts empty, as you asked for a fresh start.
- Guest view (signing in is now required).
- The "Recalculate" button. Figures update live from the server, so there is nothing to recalculate.
