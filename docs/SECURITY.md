# Security

## Passwords

- Stored as bcrypt hashes (cost 10). The plain password is never saved and never shown after it is set.
- Rules: 8 to 72 characters, at least one letter and one number, must not contain the person's name.
- Unique across the flat. When anyone sets a password, the server checks it against everyone else's. If it matches, it is refused.
- First-run temporary passwords are random, use no confusing characters, and are shown only once in the server window (and in the welcome email if SMTP is set). Each person must replace them at their first sign-in.
- Changing a password, or an admin reset, signs out every other device for that person.

## Sign-in

- Sessions use signed tokens (JWT), valid for 7 days (`TOKEN_TTL`).
- Each token carries a version number. Changing or resetting a password increases it, so older tokens stop working immediately.
- After 8 wrong passwords for one person from one address within 15 minutes, further attempts are blocked for the rest of that window. This is kept in memory and resets on a server restart.

## Access rules (enforced on the server)

- The app does not trust the browser for permissions. Every write is checked on the server.
- A person who has not yet set their own password can only read their own profile and change the password. Everything else returns "Set your own password to continue".
- Editing or deleting a purchase requires being its author.
- Only the admin can reset passwords or send the report to everyone.

## Data

- All text shown in the app is escaped before display. Item names containing HTML are shown as plain text.
- Uploads are checked: receipts and profile photos must be JPEG, PNG, WebP or GIF, under about 1 MB and 300 KB. The photos are shrunk in the browser before upload.
- Dates, months, amounts and categories are validated on the server.

## What is not protected

- **Traffic is not encrypted** unless you put the app behind HTTPS. On a home Wi-Fi this is usually acceptable. Over the internet it is not.
- **Whoever has the server computer can read `backend/data/db.json`.** Password hashes are there, but treat the folder as private.
- **The admin can read every purchase and email address,** as everyone in the flat can. This is by design for a shared khata.
- **Lockout counters reset when the server restarts.**
- **Temporary passwords reach people by email (if set up) and can be seen in the server window.** Change them at first sign-in. In test mode, reset emails are saved to `backend/data/outbox/` in plain text, so delete that folder when you're done testing.

## Keep it safe

- Keep `backend/data/secret.key` private.
- Don't commit `.env` or `data/` to Git. The included `.gitignore` already covers these.
- Use an App Password for Gmail, never your normal password.
