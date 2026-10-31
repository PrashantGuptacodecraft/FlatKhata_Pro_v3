# How it works

## The money rules

**1. Days in the month.** The real calendar length: 30 for November, 31 for December, 28 or 29 for February. Nothing is typed in by hand.

**2. The 7-day rule.** A person is exempt only when away **more than 7 days**.

| Days away | Deducted | Active days (in a 30-day month) |
| --- | --- | --- |
| 0 | 0 | 30 |
| 5 | 0 (not more than 7) | 30 |
| 7 | 0 (not more than 7) | 30 |
| 8 | 8 | 22 |
| 10 | 10 | 20 |

Away days are capped at the length of the month, and can't be negative.

**3. Per-day rate.** Total spend divided by total active person-days across all five.

```
rate = total spend / (sum of active days for all five)
```

**4. Fair share.** Each person's active days × rate.

**5. Net balance.** Paid minus fair share. Positive means you get money back. Negative means you owe.

**6. Who pays whom.** The biggest debtor pays the biggest creditor, then the next, until everyone is square. This keeps the number of transfers low. Amounts are rounded to whole rupees.

## Worked example (November, 30 days)

Purchases: Prashant ₹2,600, Aditya ₹1,900, Abhishek ₹1,200, Tanishq ₹800, Pranjil ₹500. Total ₹7,000.

Away: Aditya 5 days (no deduction), Abhishek 10 days (deducted).

- Active days: 30 + 30 + 20 + 30 + 30 = **140**
- Rate: 7,000 ÷ 140 = **₹50 per day**

| Person | Paid | Active days | Share | Net |
| --- | --- | --- | --- | --- |
| Prashant | 2,600 | 30 | 1,500 | **+1,100** |
| Aditya | 1,900 | 30 | 1,500 | **+400** |
| Abhishek | 1,200 | 20 | 1,000 | **+200** |
| Tanishq | 800 | 30 | 1,500 | **−700** |
| Pranjil | 500 | 30 | 1,500 | **−1,000** |

Who pays whom:

1. Pranjil pays ₹1,000 to Prashant
2. Tanishq pays ₹100 to Prashant
3. Tanishq pays ₹400 to Aditya
4. Tanishq pays ₹200 to Abhishek

## Leave

Leave is per month. Each person sets their own days away for each month in the Leave tab. Only the person themselves can change their number. The note is free text, for example "Home trip 12 to 18 Nov".

## Rounding

Shares are shown rounded to the rupee. Transfers are rounded to the rupee, so the totals can differ by ₹1 from the exact figures. Everything is still correct to within a few rupees.

## Who can do what

| Action | Who |
| --- | --- |
| See all purchases, shares, transfers | Everyone signed in |
| Add a purchase | Everyone (it is recorded under your name) |
| Edit or delete a purchase | Only the person who added it |
| Set your own leave days | Only you |
| Mark a payment as paid | The payer, the receiver, or the admin |
| Send the report to everyone now | Admin |
| Reset someone else's password | Admin |

## The month-end email

Every night at 11:55 pm (flat timezone), the server checks whether today is the last day of the month. If it is, and the report hasn't already been sent this month, it sends one email to each flatmate with an email address.

Each email contains:

- A personal line at the top: "You get back ₹400", "You pay ₹1,000 to Prashant (UPI …)", or "You are settled up".
- The purchase totals.
- The full table: paid, days, share and net for all five.
- Who pays whom, with UPI IDs.

The send is recorded in the month's log, and the Hisab tab shows when it went out and how many delivered. The admin can also send it manually from the Hisab tab at any time. A manual send does not block the automatic one.

Purchases added after 11:55 pm on the last day are not in the emailed report. Use the manual send after that if you need them.
