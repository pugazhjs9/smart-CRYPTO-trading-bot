import os, time, pytest, requests, uuid

BASE = os.environ.get('REACT_APP_BACKEND_URL', 'https://smart-trading-bot-47.preview.emergentagent.com').rstrip('/')
API = f"{BASE}/api"

@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@cryptoai.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]

@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}

# ---- Auth ----
def test_register_new_user():
    email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"name":"T","email":email,"password":"pw12345"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert "token" in j and j["user"]["email"] == email.lower()

def test_login_admin(admin_token):
    assert isinstance(admin_token, str) and len(admin_token) > 10

def test_me(admin_headers):
    r = requests.get(f"{API}/auth/me", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["email"] == "admin@cryptoai.com"

def test_me_no_token():
    r = requests.get(f"{API}/auth/me")
    assert r.status_code == 401

# ---- Market ----
def test_market_coins():
    r = requests.get(f"{API}/market/coins?per_page=10", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list) and len(data) > 0
    assert "id" in data[0] and "current_price" in data[0]

def test_market_ohlc():
    r = requests.get(f"{API}/market/ohlc/bitcoin?days=30", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list) and len(data) > 0
    assert {"time","open","high","low","close"} <= set(data[0].keys())

def test_market_chart():
    r = requests.get(f"{API}/market/chart/bitcoin?days=30", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and "price" in data[0]

# ---- Analysis ----
def test_signal():
    r = requests.get(f"{API}/analysis/signal/bitcoin", timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["signal"] in ("BUY","SELL","HOLD")
    assert "rsi" in j["indicators"]
    assert "ml_prediction" in j and "direction" in j["ml_prediction"]

def test_explain(admin_headers):
    r = requests.post(f"{API}/analysis/explain/bitcoin", headers=admin_headers, timeout=60)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "ai_explanation" in j and len(j["ai_explanation"]) > 5

def test_risk():
    r = requests.post(f"{API}/analysis/risk", json={
        "account_size":10000,"risk_percent":2,"entry_price":100,"stop_loss":95,"take_profit":115
    })
    assert r.status_code == 200
    j = r.json()
    assert j["position_size_units"] > 0
    assert j["risk_reward_ratio"] == 3.0
    assert j["max_loss"] == 200.0

def test_risk_invalid():
    r = requests.post(f"{API}/analysis/risk", json={
        "account_size":10000,"risk_percent":2,"entry_price":100,"stop_loss":100,"take_profit":120
    })
    assert r.status_code == 400

# ---- Portfolio ----
def test_holding_crud(admin_headers):
    r = requests.post(f"{API}/portfolio/holdings", headers=admin_headers, json={
        "coin_id":"bitcoin","symbol":"btc","quantity":0.1,"buy_price":50000,"note":"TEST"
    })
    assert r.status_code == 200, r.text
    hid = r.json()["id"]
    r2 = requests.get(f"{API}/portfolio/holdings", headers=admin_headers, timeout=30)
    assert r2.status_code == 200
    j = r2.json()
    assert any(h["id"]==hid for h in j["holdings"])
    found = next(h for h in j["holdings"] if h["id"]==hid)
    assert "pl" in found and "current_price" in found
    rd = requests.delete(f"{API}/portfolio/holdings/{hid}", headers=admin_headers)
    assert rd.status_code == 200 and rd.json()["deleted"] == 1

def test_paper_trade_buy_sell(admin_headers):
    # BUY
    r = requests.post(f"{API}/portfolio/paper-trade", headers=admin_headers, json={
        "coin_id":"ethereum","symbol":"eth","side":"BUY","quantity":0.01,"price":2000
    })
    assert r.status_code == 200, r.text
    bal_after_buy = r.json()["paper_balance"]
    # SELL
    r2 = requests.post(f"{API}/portfolio/paper-trade", headers=admin_headers, json={
        "coin_id":"ethereum","symbol":"eth","side":"SELL","quantity":0.01,"price":2100
    })
    assert r2.status_code == 200, r2.text
    bal_after_sell = r2.json()["paper_balance"]
    assert bal_after_sell > bal_after_buy
    # trades
    r3 = requests.get(f"{API}/portfolio/trades", headers=admin_headers)
    assert r3.status_code == 200
    trades = r3.json()
    assert len(trades) >= 2

def test_paper_trade_insufficient(admin_headers):
    r = requests.post(f"{API}/portfolio/paper-trade", headers=admin_headers, json={
        "coin_id":"bitcoin","symbol":"btc","side":"BUY","quantity":1000,"price":100000
    })
    assert r.status_code == 400

# ---- Alerts ----
def test_alerts_flow(admin_headers):
    # create
    r = requests.post(f"{API}/alerts", headers=admin_headers, json={
        "coin_id":"bitcoin","symbol":"btc","type":"price_above","value":1.0
    })
    assert r.status_code == 200, r.text
    aid = r.json()["id"]
    # list
    r2 = requests.get(f"{API}/alerts", headers=admin_headers)
    assert r2.status_code == 200 and any(a["id"]==aid for a in r2.json())
    # check (price_above 1.0 will trigger)
    r3 = requests.post(f"{API}/alerts/check", headers=admin_headers, timeout=30)
    assert r3.status_code == 200
    triggered = r3.json()["triggered"]
    assert any(a["id"]==aid for a in triggered)
    # delete
    rd = requests.delete(f"{API}/alerts/{aid}", headers=admin_headers)
    assert rd.status_code == 200 and rd.json()["deleted"] == 1

def test_signal_alert(admin_headers):
    r = requests.post(f"{API}/alerts", headers=admin_headers, json={
        "coin_id":"bitcoin","symbol":"btc","type":"signal","value":0
    })
    assert r.status_code == 200
    aid = r.json()["id"]
    requests.delete(f"{API}/alerts/{aid}", headers=admin_headers)
