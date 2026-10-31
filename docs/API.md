# API reference

Base URL: the server address, for example `http://localhost:3000`. All request and response bodies are JSON. Signed-in requests send `Authorization: Bearer <token>`.

Errors return `{ "error": "message", "code": "optional" }`. Common codes:

- `401`: sign in again (no token, bad token, or the session was ended by a password change)
- `403`, `code: PASSWORD_CHANGE_REQUIRED`: the person must set their own password first
- `403`: not allowed (for example, editing someone else's purchase)
- `400`: validation failed, and the message says what to fix
- `404`: not found
- `429`: too many wrong sign-in attempts

## Public

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, timezone, email: "smtp" \| "dry-run" }` |
| GET | `/api/members` | `[{ id, name, color }]` for the sign-in screen. No emails. |
| POST | `/api/auth/login` | Body `{ memberId, password }`. Returns `{ token, user }`. |

## Own account (signed in)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/me` | Allowed even when a password change is pending. |
| POST | `/api/me/password` | Body `{ currentPassword, newPassword }`. Returns a new `token`, which keeps this device signed in. Allowed even when a change is pending. |
| PUT | `/api/me/profile` | Body `{ email, upi, phone }`. |
| PUT | `/api/me/avatar` | Body `{ avatar }` as a JPEG/PNG/WebP/GIF data URL, or `null` to remove. |

## Month dashboard

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/dashboard?month=YYYY-MM` | Everything the app needs for one month: members with totals and shares, purchases (no bill photos), summary, transfers with UPI links, email status, recent activity, and `today` in the flat's timezone. Omit `month` for the current month. |

## Purchases

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/expenses` | Body `{ item, amount, date, category, receipt? }`. `amount` is whole rupees, 1 to 100000. `date` is `YYYY-MM-DD`. `category` must be one of the five categories. Returns `201 { expense }`. |
| PUT | `/api/expenses/:id` | Author only. Same body. Omit `receipt` to keep the current bill. Send `null` to remove it. |
| DELETE | `/api/expenses/:id` | Author only. |
| GET | `/api/expenses/:id/receipt` | Returns `{ dataUrl }` for the bill photo. |

Categories: `Sabzi & Vegetables`, `Ration & Staples`, `Oil & Spices`, `Dairy & Morning`, `LPG Gas & Utility`.

## Leave and payments

| Method | Path | Notes |
| --- | --- | --- |
| PUT | `/api/leave` | Body `{ month, days, note }`. Sets your own days away for that month (0 to the month length). |
| PUT | `/api/settlement/:ym/paid` | Body `{ key, settled }`. `key` comes from a transfer in the dashboard. Payer, receiver or admin only. |

## Admin only

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/admin/members/:id/reset-password` | Body `{ newPassword? }`. Leave blank to generate. Returns `{ temporaryPassword, emailed, emailMode }`. The person must choose their own at next sign-in. |
| POST | `/api/admin/reports/:ym/send` | Sends the month-end report to all five now. Returns `{ record }` with `delivered`, `failed`, `mode` and per-person results. |

## Example: sign in and add a purchase

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"memberId":"aditya","password":"YOUR-PASSWORD"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

curl -s -X POST http://localhost:3000/api/expenses \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"item":"Aloo, pyaz, tamatar","amount":180,"date":"2026-11-05","category":"Sabzi & Vegetables"}'
```
