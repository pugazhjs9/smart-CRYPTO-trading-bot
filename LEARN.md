# CryptoAI Trading Assistant — Learn Lesson-by-Lesson

> **Goal of this guide:** take you from *"I have never seen this repo"* to *"I can explain every layer, modify it, and defend it in a system-design interview"* — specifically tuned for a CoinDCX-style evaluation.
>
> Each lesson = **30–60 min**. Open the referenced files side-by-side and run the suggested experiments.

---

## Big Picture (read this first — 5 min)

```
┌──────────────┐   REST /api   ┌──────────────┐   motor   ┌─────────┐
│  React (3000)│ ───────────▶ │ FastAPI (8001)│ ───────▶ │ MongoDB │
│  TailwindCSS │ ◀────────── │  /api router  │          └─────────┘
│  Recharts    │    JWT cookie └──────┬───────┘
└──────────────┘                      │ httpx
                                      ▼
                               CoinGecko API  (prices, OHLC)
                                      │
                                      ▼
                          pandas/numpy → RSI / MACD / EMA
                                      │
                                      ▼
                 scikit-learn RandomForest (short-term direction)
                                      │
                                      ▼
                 Gemini 2.5 Flash (plain-English explanation)
```

**Three things to remember forever:**
1. Frontend **only** talks to backend via `REACT_APP_BACKEND_URL + /api/...`.
2. Backend is **one file**: `/app/backend/server.py` (~630 lines).
3. Every piece of state lives in **MongoDB** (users, holdings, trades, alerts) — no SQL, UUIDs only.

---

## Lesson 1 — Environment & Run
**File focus:** `backend/.env`, `frontend/.env`, `run.sh`

### What you learn
- Why URLs/ports are **never hardcoded** (Kubernetes ingress routes `/api/*` → backend:8001, everything else → frontend:3000).
- The protected env vars:
  - `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `GEMINI_API_KEY` (backend)
  - `REACT_APP_BACKEND_URL` (frontend)

### Do
```bash
chmod +x /app/run.sh
/app/run.sh        # supervisor mode inside Emergent; local mode on your laptop
curl -s $(cat /app/frontend/.env | grep REACT_APP_BACKEND_URL | cut -d= -f2)/api/ | jq
```

### Check-yourself questions
1. Why does the backend read `MONGO_URL` from env instead of a config file?
2. If `REACT_APP_BACKEND_URL` is missing, which exact line of `frontend/src/lib/api.js` breaks?

---

## Lesson 2 — FastAPI Skeleton & The `/api` Prefix Rule
**File:** `backend/server.py` (lines 1–45, 589–600)

### What you learn
- `APIRouter(prefix="/api")` — every route is mounted under `/api` so Kubernetes ingress can dispatch it.
- CORS middleware, `motor` (async Mongo), `Pydantic` models as the contract between FE and BE.

### Do
```bash
grep -n '^@api\.' /app/backend/server.py   # list every endpoint
```
You will count ~25 endpoints grouped as: auth, market, analysis, portfolio, alerts.

### Check-yourself
- Draw a table: *route → method → auth required? → collection written to*.

---

## Lesson 3 — Authentication (JWT + bcrypt + httpOnly cookie)
**Lines:** 47–78, 258–300

### What you learn
- Password hashing with `bcrypt.gensalt()` (random salt baked into the hash).
- JWT payload: `{sub: user_id, email, exp: now+7d}`, signed with `HS256`.
- **Dual delivery:** token returned as JSON *and* set as httpOnly cookie → mobile/postman can use header, browser gets cookie automatically.
- `get_current_user` dependency is the single gatekeeper used by every protected route.

### Do
```bash
BASE=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)
curl -s -X POST $BASE/api/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"A","email":"a@b.com","password":"pw12345"}' | jq
```

### Check-yourself
1. What happens if `JWT_SECRET` changes while users are logged in?
2. Why is `password_hash` projected out with `{"_id":0,"password_hash":0}` in `get_current_user`?

---

## Lesson 4 — CoinGecko Proxy + TTL Cache
**Lines:** 120–145

### What you learn
- Why we proxy instead of letting the browser hit CoinGecko directly:
  1. Hide rate limits / API keys.
  2. Cache responses server-side (TTL 30–120s) — fewer 429s.
  3. Uniform error shape.
- In-process `dict` cache keyed by `(path, params)` with timestamp — **good enough** for a single-instance MVP; Lesson 10 discusses how you'd move to Redis.

### Do
- Hit `/api/market/coins` twice and time it. Second call should be instant (cache hit).

### Check-yourself
- Draw the cache's memory lifecycle across two concurrent users. When is it unsafe?

---

## Lesson 5 — Technical Indicators (the maths)
**Lines:** 146–223

### What you learn
- **EMA** = exponential weighting; `pandas.ewm(span=n, adjust=False).mean()`.
- **RSI(14)** = 100 − 100/(1+RS) where RS = avg_gain / avg_loss over 14 periods.
- **MACD** = EMA(12) − EMA(26); signal = EMA(9) of MACD; histogram = MACD − signal.
- **`compute_signal`** turns numeric indicators into a discrete **BUY/SELL/HOLD** with a human-readable `reasons` list and a `score` in [-3, +3].

### Do
Open a Python REPL:
```python
import pandas as pd, numpy as np
from backend.server import rsi, macd, compute_signal
s = pd.Series(np.random.randn(200).cumsum()+100)
print(compute_signal(s))
```

### Check-yourself
- If all three indicators disagree, which one wins in `compute_signal`? (Hint: it's a *scored vote*, not a hierarchy.)

---

## Lesson 6 — ML Predictor (RandomForest on-the-fly)
**Lines:** 224–257

### What you learn
- **Features per row:** lagged returns (1,2,3,5,10), RSI, MACD, MACD-signal diff, EMA20-EMA50 ratio.
- **Label:** `1` if next-day return > 0 else `0`.
- Trained **every request** on ~90 days of data. Simple, honest, no stale-model risk — but CPU-bound.
- `ml_predict` returns `{direction: UP|DOWN, probability: 0..1}`.

### Interview-ready trade-off story
> *"We chose on-the-fly training because the universe is small (top-25 coins) and the window is short. It costs ~50ms per call and guarantees the model sees the latest bar. The production upgrade is to pickle models per coin and refresh hourly via a cron — see Lesson 10."*

---

## Lesson 7 — Risk Calculator, Portfolio, Paper Trading
**Lines:** 401–520

### What you learn
- **Risk formula:** `position_size = (account * risk%) / |entry − stop|` and `R:R = (tp-entry)/(entry-stop)`.
- **Holdings** collection: manual entries with quantity & buy price → live P/L vs. CoinGecko price.
- **Paper trading:** every new user is seeded with `virtual_cash = 10,000`. BUY decrements cash + increments virtual quantity; SELL does the opposite, records realised P/L.
- All writes use **UUID strings**, never `ObjectId` → JSON-serialisable, fork-safe.

### Do
- Create a holding, change the coin's price manually in a mock, verify P/L re-computes.

---

## Lesson 8 — Alerts Engine
**Lines:** 522–588

### What you learn
- Three alert types: `price_above`, `price_below`, `signal` (fires when BUY or SELL flips).
- `/api/alerts/check` is a **manual pull** — the frontend hits it on a timer. (Deferred: email/Telegram delivery — see PRD backlog.)
- Fired alerts are marked `triggered=true, triggered_at=...` so they don't re-fire.

### Interview angle
> *"We intentionally picked a pull-based check over a cron for the MVP. It removes infra and lets the user's session drive compute. Once we have >100 alerts/user, we'd flip to a Celery beat + webhook fan-out."*

---

## Lesson 9 — React Frontend Tour
**Files:**
- `src/App.js` — router + `<AuthProvider>`
- `src/lib/auth.jsx` — context, `login/register/logout`, reads `ca_token` from `localStorage`
- `src/lib/api.js` — axios instance with `baseURL = REACT_APP_BACKEND_URL + '/api'` and a request interceptor that attaches `Authorization: Bearer`
- `src/pages/DashboardPage.jsx` — coin list, live chart, signal card, AI explain button
- `src/components/CandlestickChart.jsx` — Recharts `ComposedChart` with wicks drawn via `Bar` + custom shape
- `src/components/RiskCalculator.jsx` — pure form, posts to `/api/analysis/risk`

### What you learn
- **Design tokens** (Chivo font, mono numerics, 1px sharp borders, dark control-room palette) live in `src/index.css` — a real trading terminal look.
- Protected routes pattern: `<RequireAuth>{children}</RequireAuth>` reads AuthContext.
- All data fetching uses simple `useEffect + axios`; no redux, no react-query — MVP pragmatism.

### Do
Open the Network tab. Log in, watch: `POST /auth/login` sets `access_token` cookie **and** stores `ca_token` in localStorage. Refresh → `GET /auth/me` proves the session sticks.

---

## Lesson 10 — Production Hardening (the interview gold-mine)

This is what senior interviewers want to hear: *"what would break at scale and how would you fix it?"*

| Concern | Today (MVP) | Production fix |
|---|---|---|
| Cache | In-process dict | Redis w/ pub-sub invalidation |
| Prices | 30s polling | WebSocket fan-out from a single upstream subscriber |
| ML | Train-per-request | Pickled models, nightly retrain, MLflow registry |
| Alerts | Manual pull | Celery-beat cron + provider adapters (Email/Telegram/Webhook) |
| Auth | JWT 7-day | Refresh-token rotation + device list + 2FA |
| DB  | Single Mongo | Mongo replica set + read-preference=secondary for analytics |
| Obs | print logs | Structured logs → Loki, metrics → Prometheus, traces → OTel |
| Cost | Free CoinGecko | CoinGecko Pro + exchange-native feeds (CoinDCX/Binance) |
| Security | Secret in .env | Vault / AWS Secrets Manager, rotating JWT keys (kid header) |
| Frontend | CRA | Vite + code-splitting, suspense for chart data |

### Final self-test
Answer out loud, no notes:
1. Draw the full request path for *"user clicks Explain on BTC"*.
2. How does the signal engine break a tie between bullish MACD and overbought RSI?
3. What changes in `server.py` if we swap CoinGecko for CoinDCX's public market API?
4. Where would you add rate-limiting, and why specifically there?
5. A user reports their P/L looks stale for 2 minutes — trace the cache chain and propose the fix.

When you can answer all five in under 90 seconds each, you're ready.
