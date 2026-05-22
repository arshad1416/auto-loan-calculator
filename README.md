# ShiftLogic HQ — Auto Loan Calculator

A dual-mode Canadian auto loan payment calculator built with React, TypeScript, and Vite. Calculates bi-weekly and monthly payments using province/territory-specific taxes, registration fees, and lender rules. Reverse mode finds the maximum affordable vehicle price from a target payment.

**[Live Demo](https://auto-loan-calculator.pages.dev)**

## ⚠️ Disclaimer

**The payments calculated by this tool are estimates only.** Actual payments, interest rates, loan terms, and down payment requirements are subject to lender approval and depend on your creditworthiness, credit history, and other factors. This calculator is for informational purposes only and should not be considered financial advice. Please consult with your lender for accurate loan terms and payments.

## Overview

This calculator works **across all Canadian provinces and territories** and automatically adjusts for:

- **Sales Taxes**: HST (ON, NB, NS, PE, NL), GST+PST (QC, BC, SK, MB), or GST-only (AB, YT, NT, NU)
- **BC Progressive PST**: 7%–20% across 5 price tiers
- **Registration & Licensing Fees**: Province-specific defaults, manually adjustable
- **Regulatory Fees**: OMVIC ($22 ON), AMVIC ($10 AB), VSA Levy ($10 BC)
- **Lender Admin Fee**: $2,000 default in Ontario, $0 elsewhere (user-editable)
- **Dealer Admin Fee**: User-editable, distinct from the lender fee
- **Additional Fees & Products**: Warranty, Safety Certification, and Other Fees — all user-editable and taxable
- **Federal Luxury Tax**: Applies to new vehicles over $100,000 (lesser of 10% of price or 20% of excess)
- **Negative Equity Cap**: Lien minus trade-in capped at 40% of vehicle price — excess added to minimum down payment
- **Year-Based Lending Rules**: APR, max term, and down payment floor determined by vehicle year

## Modes

### Payment Mode (Forward)
Enter a vehicle price and loan details to calculate bi-weekly and monthly payments, taxes, total interest, and a full amortization schedule. Select province, vehicle year, and condition (new/used) — calculations automatically adjust.

### Max Price Mode (Reverse)
Enter a target bi-weekly or monthly payment to find the maximum vehicle price you can afford. The binary search algorithm correctly handles non-linear BC PST rates and Federal Luxury Tax. Changing the vehicle year auto-adjusts APR, term, and down payment minimums.

## Screenshots

### Payment Mode
![Payment Mode](screenshots/payment-mode.png)

### Max Price Mode
![Max Price Mode](screenshots/max-price-mode.png)

## Provincial & Territorial Lending Rules

Vehicle year determines the maximum loan term, minimum APR, and down payment floor:

| Vehicle Year | Max Term | Min APR | Min Down Payment | Bank Financeable |
|---|---|---|---|---|
| 2023+ | 84 months (7 yr) | 6.99% | None | Yes |
| 2021–2022 | 72 months (6 yr) | 7.99% | None | Yes |
| 2016–2020 | 60 months (5 yr) | 8.99% | None | Yes |
| 2010–2015 | 66 months (5.5 yr) | 14.99% | 10% of vehicle price | Yes |
| Pre-2010 | 48 months (4 yr) | 19.99% | 50% of vehicle price | No |

## Taxes & Fees (Province/Territory-Specific)

| Province | Code | Tax Type | Rate | Regulating Fee | Licensing |
|---|---|---|---|---|---|
| Ontario | ON | HST | 13% | $22 OMVIC | $59 |
| Quebec | QC | GST + QST | 5% + 9.975% | — | $120 |
| British Columbia | BC | GST + PST | 5% + 7%–20%¹ | $10 VSA | $150 |
| Alberta | AB | GST | 5% | $10 AMVIC | $95 |
| Saskatchewan | SK | GST + PST | 5% + 6% | — | $100 |
| Manitoba | MB | GST + PST | 5% + 7% | — | $150 |
| New Brunswick | NB | HST | 15% | — | $100 |
| Nova Scotia | NS | HST | 15%² | — | $150 |
| Prince Edward Island | PE | HST | 15% | — | $100 |
| Newfoundland & Labrador | NL | HST | 15% | — | $180 |
| Yukon | YT | GST | 5% | — | $100 |
| Northwest Territories | NT | GST | 5% | — | $100 |
| Nunavut | NU | GST | 5% | — | $100 |

¹ BC PST is progressive: 7% under $55K, 8% $55K–$56K, 9% $56K–$57K, 10% $57K–$125K, 15% $125K–$150K, 20% over $150K
² NS HST was 14% before April 2025, now 15%

Trade-in value is applied pre-tax and reduces the taxable amount. Licensing fee syncs to the province default when switching provinces.

## Features

- **Province/Territory Selector** — auto-adjusts taxes, fees, licensing, and lender admin fee
- **Vehicle Condition** — new vs used; Federal Luxury Tax applies to new vehicles over $100K
- **Segmented Pill Toggle** — switches between Payment and Max Price modes
- **User-Editable Additional Fees** — Lender Admin Fee, Dealer Admin Fee, Warranty, Safety Certification, Other Fees; all taxable per CRA rules
- **Bi-Weekly Amortization Schedule** — period-by-period principal, interest, and balance with thousand separators
- **Per-Period Lump-Sum Extra Payments** — editable column on each amortization row; recalculates subsequent periods and shows periods/interest saved
- **Responsive Design** — CSS breakpoints at 1024px, 768px, and 480px for desktop, tablet, and mobile
- **Auto-Adjustment Banner** — shows when year change clamps APR, term, or down payment (auto-dismiss 6s)
- **Dynamic Down Payment Floor** — minimum dollar and percentage displayed, enforced with validation
- **Negative Equity Display** — shows financed vs excess amounts when lien exceeds trade-in
- **Luxury Tax Callout** — highlighted in metrics when applicable (new vehicles only)
- **Thousand Separators** on dollar inputs for readability
- **Linked Target Payment Inputs** — changing bi-weekly auto-calculates monthly and vice versa
- **Editable Loan Term Slider** — 12-month steps, capped at year-rule maximum
- **URL State Persistence** — shareable links restoring all inputs including province, condition, mode, target payments, and all fee fields

## Tech Stack

- **React 19** with `useReducer` for state management
- **TypeScript 6** with strict type-checking
- **Vite 8** for dev server and production builds
- **Vitest 4** for unit testing (47 tests)
- **Cloudflare Pages** for deployment

## Development

```bash
npm install        # Install dependencies
npm run dev        # Start dev server
npm test           # Run tests (vitest)
npm run build      # Type-check and production build
```

## URL Parameters

All inputs sync to the URL for bookmarking and sharing:

```
?prov=ON&cond=used&year=2024&price=45000&trade=0&lien=0&down=5000&apr=6.99&term=84&licensing=59&lender=2000&admin=0&warranty=0&safety=0&otherFees=0&mode=reverse&targetBiWeekly=500&targetMonthly=1083
```

Omitting `mode` (or setting it to anything other than `reverse`) defaults to Payment mode.

## How the Reverse Calculation Works

The reverse calculator uses binary search (30 iterations over a $0–$2M range) to find the maximum vehicle price matching a target payment. Unlike algebraic inversion, this correctly handles:

- **BC Progressive PST** — rate depends on vehicle price (the unknown)
- **Federal Luxury Tax** — triggers above $100K, changing the tax curve
- **Negative Equity Cap** — 40% cap creates a floor that varies with price
- **Year-Based Down Payment** — percentage floor that depends on the unknown price

Each iteration runs the full forward calculation, so all taxes, fees, caps, and rules are respected exactly.

## License

MIT
