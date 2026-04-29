from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import jwt as pyjwt
import httpx
import numpy as np
import pandas as pd
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from sklearn.ensemble import RandomForestClassifier

# ============================================================
# Config
# ============================================================
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
JWT_ALGO = "HS256"
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("crypto-ai")

app = FastAPI(title="CryptoAI Trading Assistant")
api = APIRouter(prefix="/api")

# ============================================================
# Auth helpers
# ============================================================
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False

def create_access_token(uid: str, email: str) -> str:
    payload = {"sub": uid, "email": email, "type": "access",
               "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user

# ============================================================
# Models
# ============================================================
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class HoldingIn(BaseModel):
    coin_id: str
    symbol: str
    quantity: float
    buy_price: float
    note: Optional[str] = ""

class PaperTradeIn(BaseModel):
    coin_id: str
    symbol: str
    side: Literal["BUY", "SELL"]
    quantity: float
    price: float

class AlertIn(BaseModel):
    coin_id: str
    symbol: str
    type: Literal["price_above", "price_below", "signal"]
    value: float = 0.0  # price target; ignored for signal

class RiskIn(BaseModel):
    account_size: float
    risk_percent: float          # 0-100
    entry_price: float
    stop_loss: float
    take_profit: float

# ============================================================
# CoinGecko service (cached)
# ============================================================
COINGECKO = "https://api.coingecko.com/api/v3"
_cache: dict = {}
_cache_ttl: dict = {}

async def _cg_get(path: str, params: Optional[dict] = None, ttl: int = 30):
    key = f"{path}:{str(params)}"
    now = datetime.now(timezone.utc).timestamp()
    if key in _cache and _cache_ttl.get(key, 0) > now:
        return _cache[key]
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{COINGECKO}{path}", params=params)
        if r.status_code != 200:
            # serve stale on failure
            if key in _cache:
                return _cache[key]
            raise HTTPException(502, f"CoinGecko error: {r.status_code}")
        data = r.json()
    _cache[key] = data
    _cache_ttl[key] = now + ttl
    return data

# ============================================================
# Indicators (pandas / numpy)
# ============================================================
def ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()

def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1/period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return (100 - (100 / (1 + rs))).fillna(50)

def macd(series: pd.Series, fast=12, slow=26, signal=9):
    ema_fast = ema(series, fast)
    ema_slow = ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = ema(macd_line, signal)
    hist = macd_line - signal_line
    return macd_line, signal_line, hist

def compute_signal(closes: pd.Series) -> dict:
    if len(closes) < 30:
        return {"signal": "HOLD", "confidence": 0.0,
                "reasons": ["Not enough data for analysis"],
                "indicators": {}}
    rsi_v = float(rsi(closes).iloc[-1])
    macd_l, sig_l, hist = macd(closes)
    macd_v = float(macd_l.iloc[-1]); sig_v = float(sig_l.iloc[-1]); hist_v = float(hist.iloc[-1])
    ema20 = float(ema(closes, 20).iloc[-1])
    ema50 = float(ema(closes, 50).iloc[-1]) if len(closes) >= 50 else float(ema(closes, len(closes)//2).iloc[-1])
    price = float(closes.iloc[-1])

    score = 0
    reasons = []
    # RSI
    if rsi_v < 30:
        score += 2; reasons.append(f"RSI {rsi_v:.1f} – oversold (bullish)")
    elif rsi_v > 70:
        score -= 2; reasons.append(f"RSI {rsi_v:.1f} – overbought (bearish)")
    else:
        reasons.append(f"RSI {rsi_v:.1f} – neutral")
    # MACD
    if macd_v > sig_v and hist_v > 0:
        score += 1; reasons.append("MACD above signal line (bullish momentum)")
    elif macd_v < sig_v and hist_v < 0:
        score -= 1; reasons.append("MACD below signal line (bearish momentum)")
    # EMA
    if ema20 > ema50 and price > ema20:
        score += 1; reasons.append("Price above EMA20 > EMA50 (uptrend)")
    elif ema20 < ema50 and price < ema20:
        score -= 1; reasons.append("Price below EMA20 < EMA50 (downtrend)")

    if score >= 2:
        signal = "BUY"
    elif score <= -2:
        signal = "SELL"
    else:
        signal = "HOLD"
    confidence = min(abs(score) / 4.0, 1.0)

    return {
        "signal": signal,
        "confidence": round(confidence, 2),
        "reasons": reasons,
        "indicators": {
            "rsi": round(rsi_v, 2),
            "macd": round(macd_v, 4),
            "macd_signal": round(sig_v, 4),
            "macd_hist": round(hist_v, 4),
            "ema20": round(ema20, 4),
            "ema50": round(ema50, 4),
            "price": round(price, 4)
        }
    }

# ============================================================
# ML prediction
# ============================================================
def ml_predict(closes: pd.Series) -> dict:
    if len(closes) < 40:
        return {"direction": "neutral", "confidence": 0.0, "model": "insufficient_data"}
    df = pd.DataFrame({"close": closes.values})
    df["ret1"] = df["close"].pct_change()
    df["ret3"] = df["close"].pct_change(3)
    df["ret7"] = df["close"].pct_change(7)
    df["rsi"] = rsi(df["close"])
    macd_l, sig_l, hist = macd(df["close"])
    df["macd_hist"] = hist
    df["ema_diff"] = (ema(df["close"], 20) - ema(df["close"], 50)) / df["close"]
    df["target"] = (df["close"].shift(-1) > df["close"]).astype(int)
    df = df.dropna()
    if len(df) < 30:
        return {"direction": "neutral", "confidence": 0.0, "model": "insufficient_data"}
    feats = ["ret1", "ret3", "ret7", "rsi", "macd_hist", "ema_diff"]
    X = df[feats].iloc[:-1].values
    y = df["target"].iloc[:-1].values
    if len(np.unique(y)) < 2:
        return {"direction": "neutral", "confidence": 0.5, "model": "monoclass"}
    model = RandomForestClassifier(n_estimators=120, max_depth=6, random_state=42)
    model.fit(X, y)
    last_X = df[feats].iloc[[-1]].values
    proba = model.predict_proba(last_X)[0]
    up_idx = list(model.classes_).index(1) if 1 in model.classes_ else 0
    up_prob = float(proba[up_idx])
    direction = "up" if up_prob >= 0.5 else "down"
    confidence = up_prob if direction == "up" else 1 - up_prob
    return {"direction": direction, "confidence": round(confidence, 3),
            "up_probability": round(up_prob, 3), "model": "RandomForest(120)"}

# ============================================================
# Auth endpoints
# ============================================================
@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    uid = str(uuid.uuid4())
    user_doc = {
        "id": uid, "email": email, "name": body.name,
        "password_hash": hash_password(body.password),
        "role": "user", "paper_balance": 10000.0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(uid, email)
    response.set_cookie("access_token", token, httponly=True, samesite="lax",
                        max_age=7*24*3600, path="/")
    return {"token": token, "user": {"id": uid, "email": email, "name": body.name,
                                     "paper_balance": 10000.0}}

@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    token = create_access_token(user["id"], email)
    response.set_cookie("access_token", token, httponly=True, samesite="lax",
                        max_age=7*24*3600, path="/")
    return {"token": token, "user": {"id": user["id"], "email": email,
                                     "name": user["name"],
                                     "paper_balance": user.get("paper_balance", 10000.0)}}

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

# ============================================================
# Market data endpoints
# ============================================================
@api.get("/market/coins")
async def market_coins(per_page: int = 25):
    data = await _cg_get("/coins/markets", {
        "vs_currency": "usd", "order": "market_cap_desc",
        "per_page": per_page, "page": 1,
        "price_change_percentage": "1h,24h,7d"
    }, ttl=30)
    return data

@api.get("/market/coin/{coin_id}")
async def market_coin(coin_id: str):
    data = await _cg_get(f"/coins/{coin_id}", {
        "localization": "false", "tickers": "false",
        "market_data": "true", "community_data": "false",
        "developer_data": "false"
    }, ttl=60)
    return {
        "id": data.get("id"), "symbol": data.get("symbol"),
        "name": data.get("name"),
        "image": data.get("image", {}).get("large"),
        "market_data": data.get("market_data", {}),
        "description": (data.get("description", {}).get("en", "") or "")[:500]
    }

@api.get("/market/ohlc/{coin_id}")
async def market_ohlc(coin_id: str, days: int = 30):
    # CoinGecko free OHLC endpoint allows: 1, 7, 14, 30, 90, 180, 365, max
    valid = [1, 7, 14, 30, 90, 180, 365]
    if days not in valid:
        days = 30
    raw = await _cg_get(f"/coins/{coin_id}/ohlc",
                        {"vs_currency": "usd", "days": days}, ttl=120)
    return [{"time": int(r[0]), "open": r[1], "high": r[2],
             "low": r[3], "close": r[4]} for r in raw]

@api.get("/market/chart/{coin_id}")
async def market_chart(coin_id: str, days: int = 30):
    raw = await _cg_get(f"/coins/{coin_id}/market_chart",
                        {"vs_currency": "usd", "days": days}, ttl=120)
    prices = raw.get("prices", [])
    return [{"time": int(p[0]), "price": float(p[1])} for p in prices]

# ============================================================
# Analysis endpoints
# ============================================================
async def _get_closes(coin_id: str, days: int = 90) -> pd.Series:
    raw = await _cg_get(f"/coins/{coin_id}/market_chart",
                        {"vs_currency": "usd", "days": days}, ttl=120)
    prices = raw.get("prices", [])
    if not prices:
        raise HTTPException(404, "No price data")
    return pd.Series([float(p[1]) for p in prices])

@api.get("/analysis/signal/{coin_id}")
async def analysis_signal(coin_id: str):
    closes = await _get_closes(coin_id, 90)
    sig = compute_signal(closes)
    pred = ml_predict(closes)
    sig["ml_prediction"] = pred
    sig["coin_id"] = coin_id
    return sig

@api.post("/analysis/explain/{coin_id}")
async def analysis_explain(coin_id: str, user: dict = Depends(get_current_user)):
    closes = await _get_closes(coin_id, 90)
    sig = compute_signal(closes)
    pred = ml_predict(closes)
    # Use Gemini via emergentintegrations
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=GEMINI_API_KEY,
            session_id=f"explain-{coin_id}-{user['id']}",
            system_message=(
                "You are an expert crypto trading analyst. "
                "Given technical indicator values and an ML prediction, write a clear, concise "
                "2-3 sentence rationale for retail traders. Avoid hype. Mention the key drivers."
            )
        ).with_model("gemini", "gemini-2.5-flash")
        prompt = (
            f"Coin: {coin_id}\n"
            f"Signal: {sig['signal']} (confidence {sig['confidence']})\n"
            f"Indicators: {sig['indicators']}\n"
            f"Reasons: {'; '.join(sig['reasons'])}\n"
            f"ML next-period direction: {pred.get('direction')} "
            f"(confidence {pred.get('confidence')})\n"
            "Write a short trader-friendly explanation."
        )
        text = await chat.send_message(UserMessage(text=prompt))
        explanation = str(text).strip()
    except Exception as e:
        logger.exception("Gemini explain failed")
        explanation = (
            f"Signal {sig['signal']} based on: " + "; ".join(sig['reasons'])
            + f". ML model leans {pred.get('direction')} with "
            f"confidence {pred.get('confidence')}."
        )
    return {**sig, "ml_prediction": pred, "ai_explanation": explanation}

@api.post("/analysis/risk")
async def analysis_risk(body: RiskIn):
    risk_amount = body.account_size * (body.risk_percent / 100.0)
    per_unit_risk = abs(body.entry_price - body.stop_loss)
    if per_unit_risk <= 0:
        raise HTTPException(400, "Stop loss must differ from entry price")
    position_size = risk_amount / per_unit_risk
    reward = abs(body.take_profit - body.entry_price)
    rr = reward / per_unit_risk if per_unit_risk else 0
    notional = position_size * body.entry_price
    return {
        "risk_amount": round(risk_amount, 2),
        "per_unit_risk": round(per_unit_risk, 4),
        "position_size_units": round(position_size, 6),
        "notional_usd": round(notional, 2),
        "risk_reward_ratio": round(rr, 2),
        "max_loss": round(risk_amount, 2),
        "potential_profit": round(position_size * reward, 2)
    }

# ============================================================
# Portfolio
# ============================================================
@api.get("/portfolio/holdings")
async def list_holdings(user: dict = Depends(get_current_user)):
    items = await db.holdings.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    # Enrich with current price
    if not items:
        return {"holdings": [], "total_invested": 0, "total_current": 0, "total_pl": 0}
    coin_ids = list({i["coin_id"] for i in items})
    prices_data = await _cg_get("/simple/price",
                                {"ids": ",".join(coin_ids), "vs_currencies": "usd"},
                                ttl=20)
    total_inv = 0.0; total_cur = 0.0
    for h in items:
        cur = float(prices_data.get(h["coin_id"], {}).get("usd", 0))
        h["current_price"] = cur
        h["invested"] = round(h["quantity"] * h["buy_price"], 2)
        h["current_value"] = round(h["quantity"] * cur, 2)
        h["pl"] = round(h["current_value"] - h["invested"], 2)
        h["pl_percent"] = round(((cur - h["buy_price"]) / h["buy_price"] * 100)
                                if h["buy_price"] else 0, 2)
        total_inv += h["invested"]; total_cur += h["current_value"]
    return {"holdings": items, "total_invested": round(total_inv, 2),
            "total_current": round(total_cur, 2),
            "total_pl": round(total_cur - total_inv, 2)}

@api.post("/portfolio/holdings")
async def add_holding(body: HoldingIn, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"],
           **body.model_dump(),
           "created_at": datetime.now(timezone.utc).isoformat(),
           "source": "manual"}
    await db.holdings.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.delete("/portfolio/holdings/{hid}")
async def del_holding(hid: str, user: dict = Depends(get_current_user)):
    res = await db.holdings.delete_one({"id": hid, "user_id": user["id"]})
    return {"deleted": res.deleted_count}

@api.post("/portfolio/paper-trade")
async def paper_trade(body: PaperTradeIn, user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]})
    balance = float(u.get("paper_balance", 10000.0))
    cost = body.quantity * body.price
    if body.side == "BUY":
        if cost > balance:
            raise HTTPException(400, "Insufficient paper balance")
        # Add or merge holding
        existing = await db.holdings.find_one(
            {"user_id": user["id"], "coin_id": body.coin_id, "source": "paper"}
        )
        if existing:
            new_qty = existing["quantity"] + body.quantity
            new_avg = ((existing["quantity"] * existing["buy_price"]) +
                       (body.quantity * body.price)) / new_qty
            await db.holdings.update_one({"id": existing["id"]},
                {"$set": {"quantity": new_qty, "buy_price": new_avg}})
        else:
            await db.holdings.insert_one({
                "id": str(uuid.uuid4()), "user_id": user["id"],
                "coin_id": body.coin_id, "symbol": body.symbol,
                "quantity": body.quantity, "buy_price": body.price,
                "note": "paper trade",
                "source": "paper",
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        balance -= cost
    else:  # SELL
        existing = await db.holdings.find_one(
            {"user_id": user["id"], "coin_id": body.coin_id, "source": "paper"}
        )
        if not existing or existing["quantity"] < body.quantity:
            raise HTTPException(400, "Not enough paper holdings to sell")
        new_qty = existing["quantity"] - body.quantity
        if new_qty <= 1e-9:
            await db.holdings.delete_one({"id": existing["id"]})
        else:
            await db.holdings.update_one({"id": existing["id"]},
                                         {"$set": {"quantity": new_qty}})
        balance += cost
    await db.users.update_one({"id": user["id"]},
                              {"$set": {"paper_balance": balance}})
    await db.trades.insert_one({
        "id": str(uuid.uuid4()), "user_id": user["id"],
        **body.model_dump(),
        "executed_at": datetime.now(timezone.utc).isoformat()
    })
    return {"ok": True, "paper_balance": round(balance, 2)}

@api.get("/portfolio/trades")
async def list_trades(user: dict = Depends(get_current_user)):
    items = await db.trades.find({"user_id": user["id"]},
                                 {"_id": 0}).sort("executed_at", -1).to_list(200)
    return items

# ============================================================
# Alerts
# ============================================================
@api.get("/alerts")
async def list_alerts(user: dict = Depends(get_current_user)):
    items = await db.alerts.find({"user_id": user["id"]},
                                 {"_id": 0}).sort("created_at", -1).to_list(200)
    return items

@api.post("/alerts")
async def create_alert(body: AlertIn, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"],
           **body.model_dump(),
           "triggered": False,
           "triggered_at": None,
           "message": None,
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.alerts.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.delete("/alerts/{aid}")
async def delete_alert(aid: str, user: dict = Depends(get_current_user)):
    res = await db.alerts.delete_one({"id": aid, "user_id": user["id"]})
    return {"deleted": res.deleted_count}

@api.post("/alerts/check")
async def check_alerts(user: dict = Depends(get_current_user)):
    """Evaluate the user's active alerts. Returns list of newly triggered alerts."""
    active = await db.alerts.find(
        {"user_id": user["id"], "triggered": False}, {"_id": 0}
    ).to_list(200)
    if not active:
        return {"triggered": []}
    coin_ids = list({a["coin_id"] for a in active})
    prices = await _cg_get("/simple/price",
                           {"ids": ",".join(coin_ids), "vs_currencies": "usd"},
                           ttl=20)
    triggered_now = []
    for a in active:
        price = float(prices.get(a["coin_id"], {}).get("usd", 0))
        hit = False; msg = None
        if a["type"] == "price_above" and price >= a["value"]:
            hit = True; msg = f"{a['symbol'].upper()} crossed above ${a['value']:.4f} (now ${price:.4f})"
        elif a["type"] == "price_below" and price <= a["value"]:
            hit = True; msg = f"{a['symbol'].upper()} dropped below ${a['value']:.4f} (now ${price:.4f})"
        elif a["type"] == "signal":
            try:
                closes = await _get_closes(a["coin_id"], 90)
                sig = compute_signal(closes)
                if sig["signal"] in ("BUY", "SELL"):
                    hit = True
                    msg = (f"{a['symbol'].upper()} signal: {sig['signal']} "
                           f"(confidence {sig['confidence']})")
            except Exception:
                pass
        if hit:
            await db.alerts.update_one(
                {"id": a["id"]},
                {"$set": {"triggered": True,
                          "triggered_at": datetime.now(timezone.utc).isoformat(),
                          "message": msg}}
            )
            a["triggered"] = True; a["message"] = msg
            triggered_now.append(a)
    return {"triggered": triggered_now}

# ============================================================
# App wiring
# ============================================================
@api.get("/")
async def root():
    return {"app": "CryptoAI", "status": "ok"}

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("id", unique=True)
        await db.holdings.create_index([("user_id", 1)])
        await db.alerts.create_index([("user_id", 1)])
        # Seed admin
        admin_email = os.environ.get("ADMIN_EMAIL", "admin@cryptoai.com")
        admin_pw = os.environ.get("ADMIN_PASSWORD", "admin123")
        existing = await db.users.find_one({"email": admin_email})
        if not existing:
            await db.users.insert_one({
                "id": str(uuid.uuid4()), "email": admin_email,
                "name": "Admin", "role": "admin",
                "password_hash": hash_password(admin_pw),
                "paper_balance": 10000.0,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            logger.info(f"Seeded admin: {admin_email}")
    except Exception as e:
        logger.exception("Startup error: %s", e)

@app.on_event("shutdown")
async def shutdown():
    client.close()
