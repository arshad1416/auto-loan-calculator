# ShiftLogic HQ — Auto Loan Calculator

A dual-mode Canadian auto loan payment calculator built with React, TypeScript, and Vite. Available to users across Canada, it automatically calculates bi-weekly and monthly payments using province/territory-specific taxes, registration fees, and lender rules. Reverse mode helps you find the maximum affordable vehicle price.

**[Live Demo](https://auto-loan-calculator.pages.dev)**

## ⚠️ Disclaimer

**The payments calculated by this tool are estimates only.** Actual payments, interest rates, loan terms, and down payment requirements are subject to lender approval and depend on your creditworthiness, credit history, and other factors. This calculator is for informational purposes only and should not be considered financial advice. Please consult with your lender for accurate loan terms and payments.

## Overview

This calculator is **available to all users across Canada** and automatically adjusts calculations based on your province or territory of residence. It accounts for:
- **Provincial/Territorial Sales Taxes**: GST, HST, PST, QST, and combined rates
- **Registration Fees**: Automatically calculated based on province/territory
- **Lender Rules**: Year-based APR, term, and down payment requirements vary by region

## Modes

### Payment Mode (Forward)
Enter a vehicle price and loan details to calculate bi-weekly and monthly payments, taxes, total interest, and a full amortization schedule. Calculations automatically adjust based on your selected province or territory.

### Max Price Mode (Reverse)
Enter a target bi-weekly or monthly payment to find the maximum vehicle price you can afford. Changing the vehicle year automatically adjusts the APR, term, and down payment minimum to match regional lender rules.

## Screenshots

### Payment Mode
![Payment Mode](screenshots/payment-mode.png)

### Max Price Mode
![Max Price Mode](screenshots/max-price-mode.png)

## Provincial & Territorial Lending Rules

Vehicle year determines the maximum loan term and minimum APR. Rules vary by province/territory:

| Vehicle Year | Max Term | Min APR | Min Down Payment | Bank Financeable |
|---|---|---|---|---|
| 2023+ | 84 months (7 yr) | 6.99% | None | Yes |
| 2021–2022 | 72 months (6 yr) | 7.99% | None | Yes |
| 2016–2020 | 60 months (5 yr) | 8.99% | None | Yes |
| 2010–2015 | 66 months (5.5 yr) | 14.99% | 10% of vehicle price | Yes |
| Pre-2010 | 48 months (4 yr) | 19.99% | 25% of vehicle price | No |

## Taxes & Fees (Province/Territory-Specific)

The calculator automatically computes:
- **Sales Tax**: GST (5%), HST (13-15%), PST (7%), QST (9.975%), or combinations based on your province
- **Registration & Licensing Fees**: Varies by province/territory
- **Admin & Processing Fees**: Region-specific charges

Trade-in value is applied pre-tax and reduces the taxable amount.

## Features

- **Province/Territory Selector** automatically adjusts taxes and registration fees
- **Segmented pill toggle** switches between Payment and Max Price modes
- **Bi-weekly amortization schedule** with period-by-period principal, interest, and balance
- **Year change notifications** showing auto-adjusted APR, term, and down payment
- **Dynamic down payment floor** — minimum dollar and percentage displayed, enforced with validation
- **Thousand separators** on dollar inputs for readability
- **Linked target payment inputs** — changing bi-weekly auto-calculates monthly and vice versa
- **Editable loan term slider** in both modes (12-month steps, capped at year-rule maximum)
- **URL state persistence** — shareable links that restore all inputs including province, mode, and target payments

## Tech Stack

- **React 19** with `useReducer` for state management
- **TypeScript 6** with strict linting
- **Vite 8** for dev server and production builds
- **Vitest** for unit testing (22 tests)
- **Cloudflare Pages** for deployment

## Development

```bash
npm install        # Install dependencies
npm run dev        # Start dev server (localhost:5173)
npm test           # Run tests (vitest)
npm run build      # Type-check and production build
```

## URL Parameters

All inputs sync to the URL for bookmarking and sharing:

```
?province=ON&mode=reverse&year=2024&price=45000&trade=0&down=5000&apr=6.99&term=84&licensing=59&targetBiWeekly=500&targetMonthly=1083
```

Omitting `mode` (or setting it to anything other than `reverse`) defaults to Payment mode.

## How the Reverse Calculation Works

The reverse calculator solves the standard loan payment formula for principal and works backward through provincial/territorial taxes and fees:

1. **Loan principal** from target payment: `L = P × ((1+r)ⁿ − 1) / (r(1+r)ⁿ)`
2. **Taxable amount:** `(L + downPayment − licensingFee) / (1 + taxRate)`
3. **Max vehicle price:** `taxableAmount + tradeInValue − adminFee − processingFee`

When a minimum down payment percentage applies (varies by region), a circular dependency arises — the down payment floor depends on the vehicle price, but the vehicle price is the unknown. The solution uses algebraic manipulation to solve for the maximum affordable vehicle price.

## Supported Provinces & Territories

- Alberta (AB)
- British Columbia (BC)
- Manitoba (MB)
- New Brunswick (NB)
- Newfoundland and Labrador (NL)
- Northwest Territories (NT)
- Nova Scotia (NS)
- Nunavut (NU)
- Ontario (ON)
- Prince Edward Island (PE)
- Quebec (QC)
- Saskatchewan (SK)
- Yukon (YT)

## License

MIT
