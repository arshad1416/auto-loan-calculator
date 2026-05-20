# Vehicle Listing Scraper Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the reverse auto loan calculator to live AutoTrader/CarGurus listings via a FastAPI backend on the Pi.

**Architecture:** FastAPI on Pi 5 with three-tier resolution (SQLite cache → Playwright scrape → static JSON fallback). React `VehicleListings` component behind a user-click gate in reverse mode.

**Tech Stack:** Python 3.11+ FastAPI + uvicorn + sqlite3 + httpx · TypeScript React 19 · Playwright (existing) · Vitest 4

---

### Task 1: Install FastAPI on Pi

**Files:**
- Create: `/home/arshad14/listings_api/requirements.txt`
- Modify: Pi system packages

- [ ] **Step 1: Create venv and install FastAPI + uvicorn + httpx**

```bash
ssh pi-lan "python3 -m venv /home/arshad14/listings_api_venv && /home/arshad14/listings_api_venv/bin/pip install fastapi uvicorn[standard] httpx aiosqlite"
```

Expected: Packages install successfully. Verify:
```bash
ssh pi-lan "/home/arshad14/listings_api_venv/bin/python -c 'import fastapi, uvicorn, httpx, aiosqlite; print(\"OK\")'"
```
Expected output: `OK`

- [ ] **Step 2: Create project directory**

```bash
ssh pi-lan "mkdir -p /home/arshad14/listings_api"
```

- [ ] **Step 3: Commit the requirements file**

```bash
git add requirements-pi-listings.txt  # if added to repo
git commit -m "chore: add Pi listings API dependencies"
```

---

### Task 2: Create FastAPI app with SQLite cache

**Files:**
- Create: `/Users/arshadkazi/Documents/ShiftLogic_HQ/src/api/listing_api.py`
- Test: `/Users/arshadkazi/Documents/ShiftLogic_HQ/tests/test_listing_api.py`

- [ ] **Step 1: Write the failing test for cache get/put**

```python
# tests/test_listing_api.py
import sys, os, json, time, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src', 'api'))

import pytest
from listing_api import cache_get, cache_put, cache_init, build_cache_key

def test_cache_key_is_deterministic():
    k1 = build_cache_key(maxPrice=35000, province="ON", condition="used", minYear=2019, maxYear=2026)
    k2 = build_cache_key(maxPrice=35000, province="ON", condition="used", minYear=2019, maxYear=2026)
    k3 = build_cache_key(maxPrice=35000, province="BC", condition="used", minYear=2019, maxYear=2026)
    assert k1 == k2
    assert k1 != k3

def test_cache_put_and_get(tmp_path):
    db_path = tmp_path / "test.db"
    cache_init(db_path)
    key = "abc123"
    sample = {"count": 1, "results": [{"year": 2021, "make": "Hyundai"}]}
    cache_put(db_path, key, sample)
    result = cache_get(db_path, key)
    assert result is not None
    assert result["data"]["results"][0]["make"] == "Hyundai"
    assert result["ts"] > time.time() - 5

def test_cache_miss(tmp_path):
    db_path = tmp_path / "test.db"
    cache_init(db_path)
    assert cache_get(db_path, "nonexistent") is None

def test_cache_expiry(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    cache_init(db_path)
    key = "expired_key"
    cache_put(db_path, key, {"count": 0, "results": []})
    # Simulate time passing 2 hours
    monkeypatch.setattr(time, 'time', lambda: time.time() + 7200)
    result = cache_get(db_path, key, ttl=3600)
    assert result is None
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd /Users/arshadkazi/Documents/ShiftLogic_HQ && source hq_venv/bin/activate && python -m pytest tests/test_listing_api.py -v
```
Expected: All 4 tests FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write the FastAPI app with cache layer**

```python
# src/api/listing_api.py
import hashlib, json, sqlite3, time
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ShiftLogic Listings API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://auto-loan-calculator.pages.dev", "http://localhost:*"],
    allow_methods=["GET"],
)

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
CURRENT_DIR = DATA_DIR / "current"
CURRENT_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "listings_cache.db"
FALLBACK_PATH = CURRENT_DIR / "listings_fallback.json"
CACHE_TTL = 3600  # 1 hour


def build_cache_key(**params) -> str:
    raw = "|".join(str(v) for v in params.values())
    return hashlib.sha256(raw.encode()).hexdigest()


def cache_init(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(str(db_path)) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS listings_cache (
                cache_key TEXT PRIMARY KEY,
                timestamp REAL NOT NULL,
                results_json TEXT NOT NULL
            )
        """)


def cache_put(db_path: Path, cache_key: str, data: dict) -> None:
    cache_init(db_path)
    with sqlite3.connect(str(db_path)) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO listings_cache (cache_key, timestamp, results_json) VALUES (?, ?, ?)",
            (cache_key, time.time(), json.dumps(data)),
        )


def cache_get(db_path: Path, cache_key: str, ttl: int = CACHE_TTL) -> Optional[dict]:
    if not db_path.exists():
        return None
    with sqlite3.connect(str(db_path)) as conn:
        row = conn.execute(
            "SELECT timestamp, results_json FROM listings_cache WHERE cache_key = ?",
            (cache_key,),
        ).fetchone()
    if row is None:
        return None
    if time.time() - row[0] > ttl:
        return None
    return {"ts": row[0], "data": json.loads(row[1])}


@app.get("/api/listings")
async def get_listings(
    maxPrice: int = Query(..., ge=0),
    province: str = Query(..., min_length=2, max_length=2),
    condition: str = Query(..., pattern="^(new|used)$"),
    minYear: int = Query(..., ge=1990),
    maxYear: int = Query(..., ge=1990),
):
    cache_key = build_cache_key(
        maxPrice=maxPrice, province=province,
        condition=condition, minYear=minYear, maxYear=maxYear,
    )

    # Tier 1: SQLite cache
    cached = cache_get(DB_PATH, cache_key)
    if cached is not None:
        return {**cached["data"], "cached": True, "fallback": False}

    # Tier 2: Live scrape (placeholder — wired in Task 6)
    from datetime import datetime, timezone
    results = []
    scrape_error = None

    try:
        results = await run_live_scrapes(maxPrice, province, condition, minYear, maxYear)
    except Exception as e:
        scrape_error = str(e)

    if results and not scrape_error:
        response_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "count": len(results),
            "results": results,
        }
        cache_put(DB_PATH, cache_key, response_data)
        return {**response_data, "cached": False, "fallback": False}

    # Tier 3: Static fallback
    if FALLBACK_PATH.exists():
        try:
            all_listings = json.loads(FALLBACK_PATH.read_text())
            filtered = [
                v for v in all_listings
                if v["price"] <= maxPrice
                and minYear <= v["year"] <= maxYear
                and v.get("condition", "used") == condition
                and v.get("province", "ON") == province
            ]
            return {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "count": len(filtered),
                "results": filtered,
                "cached": True,
                "fallback": True,
            }
        except Exception:
            pass

    raise HTTPException(status_code=503, detail="No listings available")


async def run_live_scrapes(maxPrice: int, province: str, condition: str, minYear: int, maxYear: int) -> list:
    """Stub — wired in Task 6."""
    return []
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd /Users/arshadkazi/Documents/ShiftLogic_HQ && source hq_venv/bin/activate && python -m pytest tests/test_listing_api.py -v
```
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/listing_api.py tests/test_listing_api.py
git commit -m "feat: add FastAPI listings endpoint with SQLite cache and fallback stub"
```

---

### Task 3: Parameterize AutoTrader scraper

**Files:**
- Modify: `src/scrapers/shiftlogic_autotrader_sniper.py`
- Test: `tests/test_autotrader_url.py`

- [ ] **Step 1: Write failing test for URL builder**

```python
# tests/test_autotrader_url.py
from src.scrapers.shiftlogic_autotrader_sniper import build_autotrader_url

def test_build_url_ontario_used():
    url = build_autotrader_url(province="ON", max_price=35000, min_year=2019, max_year=2026, condition="used")
    assert "autotrader.ca" in url
    assert "prv=Ontario" in url or "on/" in url.lower()
    assert "Used" in url or "used" in url
    assert "35000" in url or "prx=35000" in url

def test_build_url_bc_new():
    url = build_autotrader_url(province="BC", max_price=50000, min_year=2024, max_year=2026, condition="new")
    assert "autotrader.ca" in url
    assert "New" in url or "new" in url
    assert "50000" in url or "prx=50000" in url
```

- [ ] **Step 2: Run test — verify failure**

```bash
cd /Users/arshadkazi/Documents/ShiftLogic_HQ && source hq_venv/bin/activate && python -m pytest tests/test_autotrader_url.py -v
```
Expected: FAIL — `build_autotrader_url` not defined

- [ ] **Step 3: Extract URL builder and parameterize the scrape function**

Add this to `src/scrapers/shiftlogic_autotrader_sniper.py` above the existing `scrape_autotrader` function:

```python
# Province code → Autotrader province name and default city
PROVINCE_MAP = {
    "ON": ("Ontario", "Hamilton"),
    "QC": ("Quebec", "Montreal"),
    "BC": ("British-Columbia", "Vancouver"),
    "AB": ("Alberta", "Calgary"),
    "SK": ("Saskatchewan", "Saskatoon"),
    "MB": ("Manitoba", "Winnipeg"),
    "NB": ("New-Brunswick", "Fredericton"),
    "NS": ("Nova-Scotia", "Halifax"),
    "PE": ("PEI", "Charlottetown"),
    "NL": ("Newfoundland-and-Labrador", "St-Johns"),
    "YT": ("Yukon", "Whitehorse"),
    "NT": ("NWT", "Yellowknife"),
    "NU": ("Nunavut", "Iqaluit"),
}


def build_autotrader_url(province: str, max_price: int, min_year: int, max_year: int, condition: str) -> str:
    prov_name, city = PROVINCE_MAP.get(province, ("Ontario", "Hamilton"))
    wbt = "New" if condition == "new" else "Used"
    # Autotrader formats province slug as lowercase with hyphens for multi-word
    prov_slug = prov_name.lower().replace(" ", "-")
    city_slug = city.lower().replace(" ", "-")
    price_param = f"prx={max_price}" if max_price > 0 else "prx=-1"
    base = f"https://www.autotrader.ca/cars/{prov_slug}/{city_slug}/"
    params = f"?rcp=15&rcs=0&srt=3&{price_param}&prv={prov_name.replace('-', ' ')}&loc={city}%2C%20{province}&hprc=True&wbt={wbt}"
    if min_year and max_year:
        params += f"&yRng={min_year}%2C{max_year}"
    return base + params
```

Modify `scrape_autotrader` to accept parameters and use the builder:

```python
async def scrape_autotrader(province: str = "ON", max_price: int = 0, min_year: int = 1990, max_year: int = 2026, condition: str = "used"):
    url = build_autotrader_url(province, max_price, min_year, max_year, condition)
    logger.info(f"Launching ShiftLogic Aggregator Engine (Autotrader Next.js Sniper)...")
    # ... rest of function uses `url` instead of hardcoded AUTOTRADER_URL
```

Also restructure the output format to match the API contract — replace the old dict with:

```python
results.append({
    "year": car.get("year"),
    "make": car.get("make", "Unknown"),
    "model": car.get("model", ""),
    "price": int(car.get("price", 0)),
    "mileage": car.get("odometer", 0),
    "condition": condition,
    "dealership": car.get("dealerName", "Unknown"),
    "city": car.get("city", city),
    "province": province,
    "url": car.get("url", ""),
    "source": "autotrader",
})
```

Remove the `clean_with_openrouter` call (the OpenRouter round-trip adds 2-3s per listing; we can skip it since the Next.js data already has structured fields).

- [ ] **Step 4: Run tests — verify pass**

```bash
cd /Users/arshadkazi/Documents/ShiftLogic_HQ && source hq_venv/bin/activate && python -m pytest tests/test_autotrader_url.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/scrapers/shiftlogic_autotrader_sniper.py tests/test_autotrader_url.py
git commit -m "refactor: parameterize AutoTrader scraper URL and output format"
```

---

### Task 4: Parameterize CarGurus scraper

**Files:**
- Modify: `src/scrapers/shiftlogic_cargurus.py`
- Test: `tests/test_cargurus_url.py`

- [ ] **Step 1: Write failing test for URL builder**

```python
# tests/test_cargurus_url.py
from src.scrapers.shiftlogic_cargurus import build_cargurus_url

def test_build_url_ontario_used():
    url = build_cargurus_url(province="ON", max_price=35000, min_year=2019, max_year=2026, condition="used")
    assert "cargurus.ca" in url
    assert "35000" in url or "maxPrice" in url

def test_build_url_multiple_provinces():
    for prov in ["ON", "BC", "QC", "AB"]:
        url = build_cargurus_url(province=prov, max_price=50000, min_year=2020, max_year=2025, condition="used")
        assert "cargurus.ca" in url
```

- [ ] **Step 2: Run test — verify failure**

```bash
cd /Users/arshadkazi/Documents/ShiftLogic_HQ && source hq_venv/bin/activate && python -m pytest tests/test_cargurus_url.py -v
```
Expected: FAIL

- [ ] **Step 3: Add URL builder and parameterize scrape function**

```python
# Province → CarGurus region (postal code + distance)
PROVINCE_ZIP_MAP = {
    "ON": "L8P 1A1",  # Hamilton
    "QC": "H2Y 1C6",  # Montreal
    "BC": "V6B 1A1",  # Vancouver
    "AB": "T2P 1J9",  # Calgary
    "SK": "S7K 0A5",  # Saskatoon
    "MB": "R3C 0A5",  # Winnipeg
    "NB": "E3B 1A1",  # Fredericton
    "NS": "B3J 1M4",  # Halifax
    "PE": "C1A 1A1",  # Charlottetown
    "NL": "A1C 1A1",  # St. John's
    "YT": "Y1A 1A1",  # Whitehorse
    "NT": "X1A 1A1",  # Yellowknife
    "NU": "X0A 0H0",  # Iqaluit
}


def build_cargurus_url(province: str, max_price: int, min_year: int, max_year: int, condition: str) -> str:
    zip_code = PROVINCE_ZIP_MAP.get(province, "L8P 1A1")
    base = "https://www.cargurus.ca/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action"
    params = (
        f"?zip={zip_code.replace(' ', '%20')}"
        f"&distance=100"
        f"&showNegotiable=true"
        f"&sortDir=ASC"
        f"&sortType=PRICE"
        f"&maxPrice={max_price}"
        f"&minYear={min_year}"
        f"&maxYear={max_year}"
        f"&newUsed={'NEW' if condition == 'new' else 'USED'}"
    )
    return base + params
```

Modify `scrape_cargurus` to accept parameters and restructure output like the AutoTrader scraper (year, make, model, price, mileage, condition, dealership, city, province, url, source).

- [ ] **Step 4: Run tests — verify pass**

```bash
cd /Users/arshadkazi/Documents/ShiftLogic_HQ && source hq_venv/bin/activate && python -m pytest tests/test_cargurus_url.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/scrapers/shiftlogic_cargurus.py tests/test_cargurus_url.py
git commit -m "refactor: parameterize CarGurus scraper URL and output format"
```

---

### Task 5: Wire scrapers into the FastAPI endpoint

**Files:**
- Modify: `src/api/listing_api.py` (`run_live_scrapes` stub)
- Test: `tests/test_listing_api.py` (add integration test)

- [ ] **Step 1: Write integration test with mocked scrapers**

Add to `tests/test_listing_api.py`:

```python
from unittest.mock import patch, AsyncMock
from listing_api import app
from fastapi.testclient import TestClient

client = TestClient(app)

def test_get_listings_cache_miss_calls_scrapers(tmp_path, monkeypatch):
    monkeypatch.setattr("listing_api.DB_PATH", tmp_path / "test.db")
    monkeypatch.setattr("listing_api.FALLBACK_PATH", tmp_path / "no_exist.json")

    mock_results = [
        {"year": 2021, "make": "Hyundai", "model": "Tucson", "price": 28995,
         "mileage": 62000, "condition": "used", "dealership": "Test Hyundai",
         "city": "Hamilton", "province": "ON", "url": "https://...", "source": "autotrader"},
    ]

    with patch("listing_api.run_live_scrapes", new=AsyncMock(return_value=mock_results)):
        resp = client.get("/api/listings?maxPrice=35000&province=ON&condition=used&minYear=2019&maxYear=2026")
    assert resp.status_code == 200
    data = resp.json()
    assert data["cached"] == False
    assert data["fallback"] == False
    assert len(data["results"]) == 1
    assert data["results"][0]["make"] == "Hyundai"


def test_get_listings_fallback_on_scrape_error(tmp_path, monkeypatch):
    db = tmp_path / "cache.db"
    fallback = tmp_path / "fallback.json"
    fallback.write_text(json.dumps([
        {"year": 2020, "make": "Honda", "model": "Civic", "price": 22000,
         "mileage": 50000, "condition": "used", "dealership": "Test Honda",
         "city": "Toronto", "province": "ON", "url": "https://...", "source": "autotrader"},
    ]))
    monkeypatch.setattr("listing_api.DB_PATH", db)
    monkeypatch.setattr("listing_api.FALLBACK_PATH", fallback)

    with patch("listing_api.run_live_scrapes", new=AsyncMock(side_effect=Exception("blocked"))):
        resp = client.get("/api/listings?maxPrice=35000&province=ON&condition=used&minYear=2019&maxYear=2026")
    assert resp.status_code == 200
    data = resp.json()
    assert data["fallback"] == True
    assert data["results"][0]["make"] == "Honda"
```

- [ ] **Step 2: Run test — verify failure**

```bash
cd /Users/arshadkazi/Documents/ShiftLogic_HQ && source hq_venv/bin/activate && python -m pytest tests/test_listing_api.py::test_get_listings_cache_miss_calls_scrapers -v
```
Expected: FAIL — `run_live_scrapes` returns empty list

- [ ] **Step 3: Implement `run_live_scrapes`**

Replace the stub in `listing_api.py`:

```python
async def run_live_scrapes(maxPrice: int, province: str, condition: str, minYear: int, maxYear: int) -> list:
    import sys
    scrapers_dir = Path(__file__).resolve().parent.parent / "scrapers"
    sys.path.insert(0, str(scrapers_dir))

    from shiftlogic_autotrader_sniper import scrape_autotrader
    from shiftlogic_cargurus import scrape_cargurus

    # Run scrapers sequentially to avoid Playwright event loop contention
    results = []

    try:
        at_results = await scrape_autotrader(province, maxPrice, minYear, maxYear, condition)
        if isinstance(at_results, list):
            results.extend(at_results)
    except Exception:
        pass

    try:
        cg_results = await scrape_cargurus(province, maxPrice, minYear, maxYear, condition)
        if isinstance(cg_results, list):
            results.extend(cg_results)
    except Exception:
        pass

    # Deduplicate by year+make+model+price
    seen = set()
    deduped = []
    for r in results:
        key = (r.get("year"), r.get("make"), r.get("model"), r.get("price"))
        if key not in seen:
            seen.add(key)
            deduped.append(r)
    return deduped
```

- [ ] **Step 4: Run all API tests**

```bash
cd /Users/arshadkazi/Documents/ShiftLogic_HQ && source hq_venv/bin/activate && python -m pytest tests/test_listing_api.py -v
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/listing_api.py tests/test_listing_api.py
git commit -m "feat: wire parameterized scrapers into FastAPI with concurrent execution"
```

---

### Task 6: Create VehicleListings React component

**Files:**
- Create: `src/components/VehicleListings.tsx`
- Test: `src/lib/vehicleListings.test.tsx` (optional — component states tested manually first)

- [ ] **Step 1: Write the component**

```typescript
// src/components/VehicleListings.tsx
import { useState } from 'react';
import type { VehicleCondition } from '../lib/calculator';

interface Vehicle {
  year: number;
  make: string;
  model: string;
  price: number;
  mileage: number;
  condition: string;
  dealership: string;
  city: string;
  province: string;
  url: string;
  source: string;
}

interface ListingsResponse {
  cached: boolean;
  fallback: boolean;
  timestamp: string;
  count: number;
  results: Vehicle[];
}

interface Props {
  maxPrice: number;
  provinceCode: string;
  vehicleCondition: VehicleCondition;
  vehicleYear: number;
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: ListingsResponse }
  | { status: 'empty' }
  | { status: 'error'; message: string; fallback?: ListingsResponse };

const API_BASE = import.meta.env.VITE_LISTINGS_API || 'http://pi-lan:8000';

const fmtMileage = (km: number) =>
  km ? `${km.toLocaleString()} km` : '—';

const VehicleListings: React.FC<Props> = ({ maxPrice, provinceCode, vehicleCondition, vehicleYear }) => {
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  const fetchListings = async () => {
    setState({ status: 'loading' });
    const minYear = Math.max(1990, vehicleYear - 5);
    const maxYear = vehicleYear + 5;
    const params = new URLSearchParams({
      maxPrice: String(maxPrice),
      province: provinceCode,
      condition: vehicleCondition || 'used',
      minYear: String(minYear),
      maxYear: String(maxYear),
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const resp = await fetch(`${API_BASE}/api/listings?${params}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!resp.ok) throw new Error(`Server responded ${resp.status}`);

      const data: ListingsResponse = await resp.json();

      if (data.count === 0) {
        setState({ status: 'empty' });
      } else if (data.fallback) {
        setState({ status: 'error', message: 'Live search unavailable — showing recent listings', fallback: data });
      } else {
        setState({ status: 'loaded', data });
      }
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        setState({ status: 'error', message: 'Search timed out. Try again or expand your criteria.' });
      } else {
        setState({ status: 'error', message: 'Could not reach listing service. Try again later.' });
      }
    }
  };

  return (
    <div className="glass-panel" style={{ marginTop: '2rem' }}>
      {state.status === 'idle' && (
        <div style={{ textAlign: 'center', padding: '1.5rem' }}>
          <button
            className="mode-toggle active"
            onClick={fetchListings}
            style={{ padding: '0.75rem 2rem', fontSize: '0.95rem', cursor: 'pointer' }}
          >
            Find Matching Vehicles
          </button>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
            Searches AutoTrader &amp; CarGurus for vehicles matching your budget
          </div>
        </div>
      )}

      {state.status === 'loading' && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div className="spinner" />
          <div style={{ color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
            Searching AutoTrader &amp; CarGurus...
          </div>
        </div>
      )}

      {(state.status === 'loaded' || (state.status === 'error' && state.fallback)) && (
        <>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '0.75rem 0', marginBottom: '0.75rem',
            borderBottom: '1px solid var(--panel-border)',
          }}>
            <div style={{ fontWeight: 700 }}>
              {state.status === 'loaded' ? state.data.count : state.fallback!.count} Matching Vehicles
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {state.status === 'loaded'
                ? state.data.cached ? 'From cache' : 'Live results'
                : 'From cache'}
            </div>
          </div>

          {state.status === 'error' && (
            <div style={{
              padding: '0.5rem 0.75rem', marginBottom: '0.75rem',
              background: 'rgba(255, 133, 0, 0.08)', borderRadius: '8px',
              fontSize: '0.8rem', color: '#f59e0b',
            }}>
              {state.message}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {(state.status === 'loaded' ? state.data.results : state.fallback!.results).slice(0, 5).map((v, i) => (
              <a
                key={i}
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.75rem 1rem', border: '1px solid var(--panel-border)',
                  borderRadius: '10px', textDecoration: 'none', color: 'inherit',
                  transition: 'border-color 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--panel-border)')}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {v.year} {v.make} {v.model}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {fmtMileage(v.mileage)} · {v.dealership}, {v.city}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: 'var(--success-color)' }}>
                    ${v.price.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    ${(maxPrice - v.price).toLocaleString()} below max
                  </div>
                </div>
              </a>
            ))}
          </div>

          {(state.status === 'loaded' ? state.data.count : state.fallback!.count) > 5 && (
            <div style={{ textAlign: 'center', padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              + {(state.status === 'loaded' ? state.data.count : state.fallback!.count) - 5} more results
              — refine criteria for more specific matches
            </div>
          )}
        </>
      )}

      {state.status === 'empty' && (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No matching vehicles found</div>
          <div style={{ fontSize: '0.85rem' }}>
            Try expanding your year range or increasing your budget.
          </div>
          <button
            className="mode-toggle"
            onClick={() => setState({ status: 'idle' })}
            style={{ marginTop: '1rem', padding: '0.5rem 1.5rem', cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      )}

      {state.status === 'error' && !state.fallback && (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--error-color)' }}>
            {state.message}
          </div>
          <button
            className="mode-toggle"
            onClick={() => setState({ status: 'idle' })}
            style={{ marginTop: '1rem', padding: '0.5rem 1.5rem', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

export default VehicleListings;
```

- [ ] **Step 2: Add spinner CSS to `index.css`**

```css
/* Spinner for vehicle listings loading state */
.spinner {
  width: 32px; height: 32px;
  border: 3px solid var(--panel-border);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto;
}
@keyframes spin { to { transform: rotate(360deg); } }
```

- [ ] **Step 3: Verify the component compiles**

```bash
cd /Users/arshadkazi/Documents/ShiftLogic_HQ/auto-loan-calculator && npx tsc --noEmit src/components/VehicleListings.tsx
```
Expected: No errors (may need `--skipLibCheck`)

- [ ] **Step 4: Commit**

```bash
cd /Users/arshadkazi/Documents/ShiftLogic_HQ/auto-loan-calculator
git add src/components/VehicleListings.tsx src/index.css
git commit -m "feat: add VehicleListings component with fetch, cache/fallback states, and listing cards"
```

---

### Task 7: Wire VehicleListings into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add VehicleListings below LoanResults when in reverse mode**

In `App.tsx`, import and render:

```tsx
import VehicleListings from './components/VehicleListings';

// Inside the return, after the closing </div> of app-grid:
{state.reverseMode && state.results.maxVehiclePrice > 0 && (
  <VehicleListings
    maxPrice={state.results.maxVehiclePrice}
    provinceCode={state.inputs.provinceCode || 'ON'}
    vehicleCondition={state.inputs.vehicleCondition || 'used'}
    vehicleYear={state.inputs.vehicleYear}
  />
)}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/arshadkazi/Documents/ShiftLogic_HQ/auto-loan-calculator && npm run build
```
Expected: Clean build, no errors

- [ ] **Step 3: Commit**

```bash
cd /Users/arshadkazi/Documents/ShiftLogic_HQ/auto-loan-calculator
git add src/App.tsx
git commit -m "feat: wire VehicleListings into reverse mode below results"
```

---

### Task 8: Create fallback dump script for cron

**Files:**
- Create: `src/scrapers/shiftlogic_listings_dump.py`

- [ ] **Step 1: Write the dump script**

```python
# src/scrapers/shiftlogic_listings_dump.py
"""Run via cron every 4 hours to refresh the static fallback JSON."""
import asyncio, json, logging, sys
from datetime import datetime
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("ListingsDump")

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
CURRENT_DIR = DATA_DIR / "current"
CURRENT_DIR.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(Path(__file__).resolve().parent))

PROVINCES_TO_DUMP = ["ON", "QC", "BC", "AB", "SK", "MB", "NS", "NB"]


async def main():
    from shiftlogic_autotrader_sniper import scrape_autotrader
    from shiftlogic_cargurus import scrape_cargurus

    all_results = []
    tasks = []

    for prov in PROVINCES_TO_DUMP:
        for cond in ("used", "new"):
            try:
                all_results.extend(await scrape_autotrader(prov, 0, 1990, 2026, cond) or [])
            except Exception:
                pass
            try:
                all_results.extend(await scrape_cargurus(prov, 0, 1990, 2026, cond) or [])
            except Exception:
                pass

    out_path = CURRENT_DIR / "listings_fallback.json"
    out_path.write_text(json.dumps(all_results, indent=2))
    logger.info(f"Wrote {len(all_results)} listings to {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Test the script locally**

```bash
cd /Users/arshadkazi/Documents/ShiftLogic_HQ && source hq_venv/bin/activate && python src/scrapers/shiftlogic_listings_dump.py
```
Expected: Scrapers run, `data/current/listings_fallback.json` is created (may take 30-60s)

- [ ] **Step 3: Commit**

```bash
git add src/scrapers/shiftlogic_listings_dump.py
git commit -m "feat: add cron-friendly listings dump script for fallback cache"
```

---

### Task 9: Deploy API to Pi

**Files:**
- Copy: API and scraper files to Pi
- Create: systemd service file

- [ ] **Step 1: Copy files to Pi**

```bash
ssh pi-lan "mkdir -p /home/arshad14/listings_api/scrapers"
scp src/api/listing_api.py pi-lan:/home/arshad14/listings_api/
scp src/scrapers/shiftlogic_autotrader_sniper.py pi-lan:/home/arshad14/listings_api/scrapers/
scp src/scrapers/shiftlogic_cargurus.py pi-lan:/home/arshad14/listings_api/scrapers/
scp src/scrapers/shiftlogic_listings_dump.py pi-lan:/home/arshad14/listings_api/scrapers/
```

- [ ] **Step 2: Install dependencies on Pi**

```bash
ssh pi-lan "/home/arshad14/listings_api_venv/bin/pip install playwright && /home/arshad14/listings_api_venv/bin/playwright install chromium"
```

- [ ] **Step 3: Start the API on Pi for testing**

```bash
ssh pi-lan "/home/arshad14/listings_api_venv/bin/python -m uvicorn listing_api:app --host 0.0.0.0 --port 8000" &
```

Test:
```bash
ssh pi-lan "curl -s 'http://localhost:8000/api/listings?maxPrice=50000&province=ON&condition=used&minYear=2020&maxYear=2026' | head -c 200"
```
Expected: JSON response (may be empty results if scrapers can't run headless on Pi)

- [ ] **Step 4: Create systemd service**

```bash
ssh pi-lan "cat <<'EOF' | sudo tee /etc/systemd/system/listings-api.service
[Unit]
Description=ShiftLogic Listings API
After=network.target

[Service]
Type=simple
User=arshad14
WorkingDirectory=/home/arshad14/listings_api
ExecStart=/home/arshad14/listings_api_venv/bin/uvicorn listing_api:app --host 0.0.0.0 --port 8000
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable listings-api && sudo systemctl start listings-api"
```

- [ ] **Step 5: Set up cron for fallback dumps**

```bash
ssh pi-lan "(crontab -l 2>/dev/null; echo '0 */4 * * * /home/arshad14/listings_api_venv/bin/python /home/arshad14/listings_api/scrapers/shiftlogic_listings_dump.py >> /home/arshad14/listings_api/cron.log 2>&1') | crontab -"
```

- [ ] **Step 6: Commit deployment configs (if stored in repo)**

```bash
git add deploy/listings-api.service  # if added to repo
git commit -m "deploy: add Pi systemd service and cron for listings API"
```

---

### Task 10: Manual end-to-end verification

- [ ] **Step 1: Verify API responds from Mac**

```bash
curl -s "http://pi-lan:8000/api/listings?maxPrice=50000&province=ON&condition=used&minYear=2020&maxYear=2026" | python -m json.tool | head -30
```
Expected: Valid JSON with `count` and `results` fields.

- [ ] **Step 2: Test via dev server**

```bash
cd /Users/arshadkazi/Documents/ShiftLogic_HQ/auto-loan-calculator && npm run dev
```

1. Open `http://localhost:5173`
2. Switch to Reverse mode
3. Enter a target bi-weekly payment (e.g., $400)
4. Click "Find Matching Vehicles"
5. Verify: spinner → listing cards or empty/error state
6. Verify listing cards are clickable and open external links

- [ ] **Step 3: Verify fallback on Pi API stop**

```bash
ssh pi-lan "sudo systemctl stop listings-api"
```

Refresh the calculator, click "Find Matching Vehicles".
Expected: Error state with "Could not reach listing service" and retry button.

```bash
ssh pi-lan "sudo systemctl start listings-api"
```

- [ ] **Step 4: Commit any final tweaks**

```bash
git add -A
git commit -m "chore: final end-to-end verification tweaks"
git push
```
