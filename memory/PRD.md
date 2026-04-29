# CryptoAI Trading Assistant — PRD

## Original Problem Statement
Build a full-stack AI-powered crypto trading assistant web app with:
real-time CoinGecko data, candlestick charts (BTC, ETH, top coins),
technical indicators (RSI, MACD, EMA), buy/sell/hold signals based on
combined indicators with explanations, ML model for short-term price
movement, risk management (stop-loss, position sizing, risk-reward),
portfolio tracking with P/L analytics (manual + paper trading), and
alerts for trade signals and price changes. Tech: React + FastAPI +
MongoDB + scikit-learn + Gemini. Looks like a professional trading
terminal.

## Architecture (implemented)
- **Backend** (`/app/backend/server.py`)
  - FastAPI single-module API under `/api`
  - JWT auth (bcrypt + PyJWT, Bearer token + httpOnly cookie)
  - CoinGecko proxy with in-process TTL cache (30–120s)
  - Indicators (pandas/numpy): RSI(14), MACD(12,26,9), EMA(20,50)
  - Signal engine combining indicators → BUY/SELL/HOLD + reasons
  - ML: scikit-learn `RandomForestClassifier` re-trained on-the-fly
    using last ~90 days of returns + indicator features
  - Risk calculator (position sizing, R:R)
  - Portfolio: holdings CRUD + paper trading (virtual $10k wallet)
  - Alerts: price_above / price_below / signal types + manual `check`
  - Gemini explanations via `emergentintegrations.llm.chat` (model
    `gemini-2.5-flash`) using user-provided GEMINI_API_KEY
- **Frontend** (`/app/frontend/src`)
  - React Router 7, AuthContext (`/lib/auth.jsx`), axios client
    (`/lib/api.js`) with token from `localStorage.ca_token`
  - Pages: LoginPage, RegisterPage, DashboardPage, PortfolioPage,
    AlertsPage; protected routes
  - Components: TopNav, CandlestickChart (Recharts ComposedChart),
    RiskCalculator
  - Custom design tokens (Chivo + JetBrains Mono, sharp 1px borders,
    dark control-room palette) in `index.css`

## User Personas
- Retail crypto trader who wants quant-style signals with
  human-readable AI explanations
- Beginner who wants to paper-trade before risking real funds
- Active trader needing risk math + portfolio P/L on one screen

## Core Requirements (status)
- [x] Real-time crypto data (CoinGecko)
- [x] Candlestick charts (Recharts)
- [x] Indicators: RSI / MACD / EMA
- [x] Combined buy/sell/hold signal engine
- [x] ML short-term direction prediction (RandomForest)
- [x] Risk management calculator
- [x] Portfolio (manual + paper trading) with P/L
- [x] Alerts (price + signal) with manual check
- [x] AI explanations (Gemini)
- [x] JWT auth (register, login, logout, /me)
- [x] Trading-platform UI (dark, sharp, mono numerics)

## Implemented (2026-04-29)
- Initial MVP: full backend + full UI + Gemini integration
- 16/16 backend pytest passing; full frontend e2e verified

## Backlog
- **P1**: Email alert delivery (SendGrid/Resend) — user deferred
- **P1**: WebSocket-based live tickers (replace 30s polling)
- **P1**: Cache CoinGecko more aggressively / use API key tier to
  remove rate-limit 502s under load
- **P2**: ML model persistence + scheduled retraining
- **P2**: More indicators (Bollinger, Stoch, Volume profile)
- **P2**: Custom alert webhooks / Telegram / Discord
- **P2**: Trade journal & exportable P/L statements
- **P2**: Watchlist persistence per user
- **P3**: Multi-currency (EUR/GBP), multi-language

## Next Tasks
1. Add email alert provider once user picks one
2. Consider live WebSocket pricing
3. Persist ML models, add periodic retraining job

## Test Credentials
See `/app/memory/test_credentials.md`.
