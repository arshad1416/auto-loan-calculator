# Vehicle Listing Scraper Integration — Design Spec

**Date:** 2026-05-20
**Status:** Design approved, awaiting implementation plan

## Overview

Integrate the reverse auto loan calculator with live vehicle listings from AutoTrader.ca and CarGurus.ca. When a user finds their max affordable price in reverse mode, they can click a button to see matching vehicles for sale in their selected province.

## Architecture

```
Browser (Cloudflare Pages)
    │  fetch()
    ▼
FastAPI on Pi 5 (:8000)  ←── Tailscale Funnel or Cloudflare Tunnel
    │
    ├─ 1. SQLite cache (1hr TTL, hash-keyed on params)
    │
    ├─ 2. Live Playwright scrapers (cache miss)
    │      ├─ shiftlogic_autotrader_sniper.py (parameterized)
    │      └─ shiftlogic_cargurus.py (parameterized)
    │
    └─ 3. Static JSON fallback (scrape blocked / Pi unreachable)
           └─ listings_fallback.json (cron every 4hr)
```

**Key design decisions:**
- Pi 5 hosts the API — it already runs 24/7 with Playwright, OpenRouter, and the scrapers
- SQLite for cache — zero dependencies, single file, fast key-value lookup
- Three-tier fallback: cache → live scrape → static dump
- User must click a button to trigger the search — no automatic scraping

## API Contract

### `GET /api/listings`

**Query parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `maxPrice` | int | yes | Max vehicle price from reverse calculator |
| `province` | string | yes | Two-letter province code (ON, BC, etc.) |
| `condition` | string | yes | `new` or `used` |
| `minYear` | int | yes | `vehicleYear - 5` |
| `maxYear` | int | yes | `vehicleYear + 5` |

**Response (200):**

```json
{
  "cached": true,
  "fallback": false,
  "timestamp": "2026-05-20T14:30:00Z",
  "count": 23,
  "results": [
    {
      "year": 2021,
      "make": "Hyundai",
      "model": "Tucson Preferred",
      "price": 28995,
      "mileage": 62000,
      "condition": "used",
      "dealership": "Mountain Hyundai",
      "city": "Hamilton",
      "province": "ON",
      "url": "https://www.autotrader.ca/...",
      "source": "autotrader"
    }
  ]
}
```

- `cached: true` — served from SQLite cache (≤ 1hr old)
- `fallback: true` — served from static JSON dump (live scrape failed, data may be stale)
- `source` — `"autotrader"` or `"cargurus"`

**Error responses:**
- `503` — Pi unreachable or all sources exhausted

## Backend Components

### 1. FastAPI App (`src/api/listing_api.py`)

New file. CORS restricted to `https://auto-loan-calculator.pages.dev` and `http://localhost:*` for dev. Three-tier resolution:
1. Check SQLite cache by hash of query params
2. On miss, run both scrapers concurrently with `asyncio.gather`
3. On scrape failure, filter the static fallback JSON

### 2. Parameterized Scrapers

Existing `shiftlogic_autotrader_sniper.py` and `shiftlogic_cargurus.py` currently use hardcoded search URLs. Refactor: extract URL construction into functions that accept `province`, `max_price`, `min_year`, `max_year`, `condition`.

AutoTrader URL parameters: `prv` (province name), `prx` (max price), `wbt` (condition), year range filters.
CarGurus URL: `zip` (postal code for region), `maxPrice`, `minYear`, `maxYear`, `newUsed` filters.

### 3. SQLite Cache (`data/listings_cache.db`)

```sql
CREATE TABLE IF NOT EXISTS listings_cache (
    cache_key TEXT PRIMARY KEY,
    timestamp REAL NOT NULL,
    results_json TEXT NOT NULL
);
```

Cache key: SHA-256 hash of the concatenated query params. TTL: 3600 seconds.

### 4. Fallback Dump Script (`src/scrapers/shiftlogic_listings_dump.py`)

New file. Scrapes broad Ontario queries (all prices, all years) and writes to `data/current/listings_fallback.json`. Runs via cron every 4 hours. The API filters this file client-side when live scrape fails.

### 5. Cron Configuration (Pi)

```
0 */4 * * * /home/arshad14/hq_venv/bin/python /home/arshad14/shiftlogic/src/scrapers/shiftlogic_listings_dump.py
```

## Frontend Components

### `VehicleListings.tsx` — New component

Rendered only in reverse mode, below `LoanResults`.

**Props:**
```typescript
interface Props {
  maxPrice: number;
  provinceCode: string;
  vehicleCondition: VehicleCondition;
  vehicleYear: number;
}
```

**States:**

| State | UI |
|-------|-----|
| `idle` | "Find Matching Vehicles" button |
| `loading` | Spinner + "Searching AutoTrader & CarGurus..." |
| `loaded` | Listing cards + "N matching vehicles · from cache / live" |
| `empty` | "No matching vehicles found — try expanding your year range or increasing your budget" |
| `error` | Fallback: "Showing recent listings · live search unavailable". Full error: "Could not reach listing service. Try again later." |

**Listing card:** Year Make Model, mileage, dealership, city, price, "below max" delta, external link.

**Config:** `piApiUrl` defaults to `http://pi-lan:8000` (LAN-only). For production, configure a Tailscale Funnel URL.

### Changes to existing files

| File | Change |
|------|--------|
| `src/App.tsx` | Conditionally render `VehicleListings` below `LoanResults` when `reverseMode` is true |

## Data Flow

1. User enters budget → reverse calculator shows max price
2. User clicks "Find Matching Vehicles"
3. `VehicleListings` sets `loading`, fetches from Pi API
4. Pi API checks SQLite → live scrape → static fallback (in order)
5. Pi API returns JSON
6. `VehicleListings` renders results or appropriate state

## Error Handling

- **Pi unreachable:** Show error message, no fallback possible (browser can't reach Pi)
- **Live scrape blocked:** Use static fallback JSON from last cron run, show "live search unavailable" banner
- **Empty results:** Suggest expanding year range or budget
- **Timeout:** 20s fetch timeout, fall back to error state

## Security

- CORS restricted to the Cloudflare Pages domain
- No user input passed to shell — all scraper params are URL query string values injected into Playwright navigation URLs
- Pi exposed only via Tailscale Funnel (HTTPS, Tailscale auth) or Cloudflare Tunnel

## Testing

- **Unit:** Parameterized URL construction functions
- **Integration:** FastAPI endpoint with mocked scrapers, cache hit/miss, fallback
- **Frontend:** Component states (idle → loading → loaded/empty/error)
- **Manual:** End-to-end with real AutoTrader/CarGurus queries

## Open Questions

- Tailscale Funnel vs Cloudflare Tunnel for Pi exposure — Tailscale Funnel is simpler but requires Tailscale on the client; Cloudflare Tunnel works for anyone
- How many listing results to return (initial: 5, expandable to all)
