# FlatKhata Pro v3

A shared kitchen and sabzi khata for five flatmates. Everyone adds what they bought from their phone. The app works out the fair share, applies the **more than 7 days away** rule, shows exactly who pays whom with UPI links, and emails every flatmate a personal summary on the last day of each month.

- **Shared data:** one server holds the khata, so everyone sees the same numbers.
- **Private logins:** every person has their own password. Prashant (admin) can reset anyone's.
- **Ownership:** you can add anything, but only edit or delete what you added.
- **Month-end email:** automatic on the last day of the month, once only, with each person's own lines at the top.
- **Mobile first:** built for phones, works as a home-screen app, no build step.

## Quick start

You need Node.js 18.18 or newer (tested on Node 22).

```bash
cd backend
npm install
cp .env.example .env        # then edit it (see docs/SETUP.md)
npm start
```

The first run prints a temporary password for each flatmate. Each person signs in with theirs and is asked to choose their own. Open **http://localhost:3000** on this computer. To use phones, set `APP_URL` in `.env` to this computer's Wi-Fi address (see [docs/SETUP.md](docs/SETUP.md)).

## Before the first start

Check `backend/config/members.json`: names, emails, UPI IDs. These are read once, on the first run. Afterwards, people change their own email and UPI in the **Me** tab.

## Where to read next

| Document | What it covers |
| --- | --- |
| [docs/SETUP.md](docs/SETUP.md) | Install, configure, run on phones, email (Gmail/SMTP), backups, deployment, troubleshooting |
| [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) | The maths (with a worked example), the 7-day rule, settlement, month-end email |
| [docs/SECURITY.md](docs/SECURITY.md) | Passwords, sessions, ownership rules, what is and isn't protected |
| [docs/API.md](docs/API.md) | Every endpoint, for anyone extending the app |
| [docs/CHANGES_FROM_V2.md](docs/CHANGES_FROM_V2.md) | What was wrong with the original single-file app and what changed |

## Project layout

```
FlatKhata_Pro_v3/
├── README.md
├── docs/                    documentation
├── backend/
│   ├── server.js            API, auth gates, static web app, scheduler start
│   ├── config/members.json  the five flatmates (read on first run)
│   ├── src/
│   │   ├── settlement.js    pure maths: 7-day rule, pro-rata, who pays whom
│   │   ├── auth.js          passwords, uniqueness, tokens, login rate limit
│   │   ├── reports.js       month-end email content, sending, scheduler
│   │   ├── mailer.js        SMTP, plus outbox fallback when SMTP is not set
│   │   ├── store.js         JSON database with safe writes
│   │   ├── seed.js          first-run setup
│   │   ├── config.js        reads .env
│   │   └── util.js          dates in the flat's timezone, escaping, ₹ formatting
│   ├── scripts/reset-password.js
│   ├── test/settlement.test.js
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── index.html
    ├── css/styles.css
    ├── js/app.js
    ├── manifest.webmanifest
    └── icon.svg
```

## Tests

```bash
cd backend
npm test
```

The maths tests cover the 7-day boundary, the ₹50/day reference month, balances summing to zero, transfers, settled flags, and month boundaries.
