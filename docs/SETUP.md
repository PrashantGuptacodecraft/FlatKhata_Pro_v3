# Setup guide

## 1. Install

```bash
cd backend
npm install
```

Requires Node.js 18.18+. Check with `node -v`.

## 2. Check the flatmates

Open `backend/config/members.json` and check each person's name, email and UPI ID. The file is read only on the first run. Each person's temporary password is printed once when you start the server for the first time. Passwords are never stored in this file.

To add or rename people later, you would need to start with a fresh database, so set this file up before the first start.

## 3. Configure

```bash
cp .env.example .env
```

The important settings:

| Setting | What to put | Why |
| --- | --- | --- |
| `APP_URL` | Your Wi-Fi address, e.g. `http://192.168.1.20:3000` | Phones must be able to open it. Emails link to it. |
| `HOST` | `0.0.0.0` (default) | Lets phones on the same Wi-Fi connect |
| `TIMEZONE` | `Asia/Kolkata` (default) | Decides which day is "the last day of the month" |
| `JWT_SECRET` | Leave blank | A secret is generated and saved in `backend/data/secret.key` |
| `SMTP_*`, `MAIL_FROM` | Your email settings (see section 5) | Needed for real emails. Leave blank to test. |

Find your computer's Wi-Fi address with `ipconfig` (Windows, look for IPv4 Address) or `ip a` / `hostname -I` (Linux and Mac). Then allow the port through your firewall.

## 4. Run

```bash
npm start
```

You will see the temporary passwords, then the addresses. Keep this window open. The server must be running for anyone to use the app.

Each flatmate:

1. Opens the address on their phone.
2. Taps their name, enters the temporary password.
3. Chooses their own password (8+ characters, letters and numbers, not used by anyone else, must not contain their name).

On iPhone: Safari, Share, Add to Home Screen. On Android: Chrome, menu, Add to Home screen.

## 5. Email (set this up later if you like)

With no SMTP settings, nothing is sent. Reports and welcome emails are saved as HTML files in `backend/data/outbox/`, and the app says so. You can test everything this way.

To send real email with Gmail:

1. Turn on 2-Step Verification on the Google account you want to send from.
2. Create an App Password at https://myaccount.google.com/apppasswords. Use the 16-character code. Do **not** use your normal Google password.
3. In `.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your.address@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
MAIL_FROM="FlatKhata Pro <your.address@gmail.com>"
```

Spaces in the App Password are removed automatically. Restart the server.

Other providers work the same way. Use their SMTP host, port and credentials.

**Month-end schedule:** `REPORT_CRON=0 20 * * *` checks every night at 8:00 pm (in `TIMEZONE`, Asia/Kolkata) and sends only on the last day of the month. Set `AUTO_REPORT_ENABLED=false` to turn off the automatic email and send manually from the Hisab tab.

**Missed report:** if the server was off on the last night, it sends the missed report during the first 7 days of the next month.

## 6. Backups

Everything lives in `backend/data/`:

- `db.json`: all members, purchases, leave, payments, email log
- `secret.key`: signing key. Keep it, or everyone is signed out.
- `outbox/`: test emails, if SMTP is off

Copy the `data` folder regularly, for example weekly to a cloud drive. To restore, stop the server, replace the folder, and start again.

## 7. Resetting a password

**In the app (normal way):** Prashant, in the Me tab, taps **Reset** next to the person. They get a new temporary password (shown once to Prashant, and emailed if email is set up). They must choose their own at the next sign-in.

**From the command line:** stop the server first, then run:

```bash
npm run reset-password -- aditya
```

Start the server again afterwards. Don't run this while the server is running, because the running server would overwrite the change.

## 8. Running it all the time

The app needs a computer or small device that stays on, like an old laptop, a Raspberry Pi, or a cloud VM. Run it under a process manager so it restarts after reboots (for example `pm2 start server.js` after `npm install -g pm2`, then `pm2 startup` and `pm2 save`).

To use it away from home, put it behind HTTPS, either a reverse proxy with a certificate or a tunnel service. Set `APP_URL` to the public HTTPS address. Passwords travel over the connection, so do not expose plain HTTP to the internet.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Phone says it cannot reach the server | Check `APP_URL` is the computer's Wi-Fi address, the server is running, and the firewall allows the port. Phone and computer must be on the same network. |
| "Too many wrong attempts" | Wait 15 minutes, or restart the server (this clears the counter). |
| Emails not arriving | Check the server log. Use the App Password, not the normal one. Check spam. Try `AUTO_REPORT_ENABLED` and the Hisab "Email report" button. |
| Forgot a password and no admin access | Use the command-line reset above with the server stopped. |
| Server says db.json could not be read | Restore `backend/data/db.json` from your backup. The server stops rather than overwrite a damaged file. |
| Changed a name or UPI in members.json | Only read on first run. Change it in the app instead (Me tab for your own details). |
