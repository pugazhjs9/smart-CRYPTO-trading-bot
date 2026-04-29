import { useEffect, useState } from "react";
import api from "../lib/api";
import TopNav from "../components/TopNav";
import { useAuth } from "../lib/auth";
import { Trash2, Plus } from "lucide-react";

function fmt(n) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function PortfolioPage() {
  const { user, refresh } = useAuth();
  const [data, setData] = useState({ holdings: [], total_invested: 0, total_current: 0, total_pl: 0 });
  const [trades, setTrades] = useState([]);
  const [coins, setCoins] = useState([]);
  const [tab, setTab] = useState("holdings");

  // Manual add form
  const [m, setM] = useState({ coin_id: "bitcoin", symbol: "btc", quantity: 0.01, buy_price: 50000 });
  // Paper trade form
  const [p, setP] = useState({ coin_id: "bitcoin", symbol: "btc", side: "BUY", quantity: 0.01 });

  const load = () => {
    api.get("/portfolio/holdings").then(({ data }) => setData(data));
    api.get("/portfolio/trades").then(({ data }) => setTrades(data));
  };

  useEffect(() => {
    load();
    api.get("/market/coins?per_page=20").then(({ data }) => setCoins(data));
  }, []);

  const addManual = async (e) => {
    e.preventDefault();
    await api.post("/portfolio/holdings", m);
    load();
  };

  const removeHolding = async (id) => {
    await api.delete(`/portfolio/holdings/${id}`);
    load();
  };

  const tradePaper = async (e) => {
    e.preventDefault();
    const coin = coins.find((c) => c.id === p.coin_id);
    const price = coin?.current_price || 0;
    try {
      await api.post("/portfolio/paper-trade", {
        ...p, price, symbol: coin?.symbol || p.symbol,
      });
      load(); refresh();
    } catch (e) {
      alert(e.response?.data?.detail || "Trade failed");
    }
  };

  const plClass = data.total_pl >= 0 ? "text-buy" : "text-sell";

  return (
    <div data-testid="portfolio-page">
      <TopNav />
      <div className="max-w-[1600px] mx-auto px-6 py-5 space-y-5">

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="paper balance" value={`$${fmt(user?.paper_balance)}`} mono />
          <Stat label="total invested" value={`$${fmt(data.total_invested)}`} mono />
          <Stat label="current value" value={`$${fmt(data.total_current)}`} mono />
          <Stat label="unrealized p/l" value={`$${fmt(data.total_pl)}`} mono cls={plClass} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/10">
          {["holdings", "manual_add", "paper_trade", "trades"].map((t) => (
            <button key={t}
                    className={`px-4 py-2 text-xs uppercase tracking-[0.18em] ${tab === t ? "text-white border-b-2 border-white -mb-px" : "text-[#8A8A93]"}`}
                    onClick={() => setTab(t)}
                    data-testid={`tab-${t}`}>
              {t.replace("_", " ")}
            </button>
          ))}
        </div>

        {tab === "holdings" && (
          <div className="panel overflow-x-auto" data-testid="holdings-table">
            <table className="tbl">
              <thead><tr>
                <th>asset</th><th>source</th><th className="num">qty</th>
                <th className="num">avg buy</th><th className="num">current</th>
                <th className="num">value</th><th className="num">p/l</th><th></th>
              </tr></thead>
              <tbody>
                {data.holdings.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-[#5C5C66] py-6">No holdings yet. Add one or use paper trading.</td></tr>
                )}
                {data.holdings.map((h) => (
                  <tr key={h.id}>
                    <td className="uppercase font-medium">{h.symbol}</td>
                    <td className="text-[#5C5C66] uppercase text-xs">{h.source || "manual"}</td>
                    <td className="num">{h.quantity}</td>
                    <td className="num">${fmt(h.buy_price)}</td>
                    <td className="num">${fmt(h.current_price)}</td>
                    <td className="num">${fmt(h.current_value)}</td>
                    <td className={`num ${h.pl >= 0 ? "text-buy" : "text-sell"}`}>${fmt(h.pl)} ({fmt(h.pl_percent)}%)</td>
                    <td>
                      <button onClick={() => removeHolding(h.id)} className="text-[#5C5C66] hover:text-sell" data-testid={`del-holding-${h.id}`}>
                        <Trash2 size={14}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "manual_add" && (
          <form onSubmit={addManual} className="panel p-5 grid grid-cols-1 md:grid-cols-5 gap-3" data-testid="manual-add-form">
            <div>
              <label className="label-overline">coin</label>
              <select className="input-base mt-1" value={m.coin_id}
                      onChange={(e) => {
                        const id = e.target.value;
                        const c = coins.find(c => c.id === id);
                        setM({ ...m, coin_id: id, symbol: c?.symbol || id });
                      }} data-testid="manual-coin-select">
                {coins.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.symbol.toUpperCase()})</option>)}
              </select>
            </div>
            <div>
              <label className="label-overline">quantity</label>
              <input type="number" step="any" className="input-base mt-1" value={m.quantity}
                     onChange={(e) => setM({ ...m, quantity: parseFloat(e.target.value) })}
                     data-testid="manual-qty-input" />
            </div>
            <div>
              <label className="label-overline">buy price ($)</label>
              <input type="number" step="any" className="input-base mt-1" value={m.buy_price}
                     onChange={(e) => setM({ ...m, buy_price: parseFloat(e.target.value) })}
                     data-testid="manual-price-input" />
            </div>
            <div className="md:col-span-2 flex items-end">
              <button className="btn-primary w-full" data-testid="manual-add-btn"><Plus size={12} className="inline mr-1"/> Add Holding</button>
            </div>
          </form>
        )}

        {tab === "paper_trade" && (
          <form onSubmit={tradePaper} className="panel p-5 grid grid-cols-1 md:grid-cols-5 gap-3" data-testid="paper-trade-form">
            <div>
              <label className="label-overline">coin</label>
              <select className="input-base mt-1" value={p.coin_id}
                      onChange={(e) => {
                        const id = e.target.value;
                        const c = coins.find(c => c.id === id);
                        setP({ ...p, coin_id: id, symbol: c?.symbol || id });
                      }} data-testid="paper-coin-select">
                {coins.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.symbol.toUpperCase()}) · ${fmt(c.current_price)}</option>)}
              </select>
            </div>
            <div>
              <label className="label-overline">side</label>
              <select className="input-base mt-1" value={p.side}
                      onChange={(e) => setP({ ...p, side: e.target.value })}
                      data-testid="paper-side-select">
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </div>
            <div>
              <label className="label-overline">quantity</label>
              <input type="number" step="any" className="input-base mt-1" value={p.quantity}
                     onChange={(e) => setP({ ...p, quantity: parseFloat(e.target.value) })}
                     data-testid="paper-qty-input" />
            </div>
            <div className="md:col-span-2 flex items-end">
              <button className={p.side === "BUY" ? "btn-buy w-full" : "btn-sell w-full"} data-testid="paper-submit-btn">
                {p.side} at market
              </button>
            </div>
            <div className="md:col-span-5 text-xs text-[#5C5C66]">
              Trade is executed at the latest CoinGecko market price using your paper balance (${fmt(user?.paper_balance)}).
            </div>
          </form>
        )}

        {tab === "trades" && (
          <div className="panel overflow-x-auto" data-testid="trades-table">
            <table className="tbl">
              <thead><tr>
                <th>time</th><th>side</th><th>asset</th>
                <th className="num">qty</th><th className="num">price</th><th className="num">value</th>
              </tr></thead>
              <tbody>
                {trades.length === 0 && <tr><td colSpan={6} className="text-center text-[#5C5C66] py-6">No trades yet.</td></tr>}
                {trades.map((t) => (
                  <tr key={t.id}>
                    <td className="text-[#8A8A93] text-xs">{new Date(t.executed_at).toLocaleString()}</td>
                    <td className={t.side === "BUY" ? "text-buy" : "text-sell"}>{t.side}</td>
                    <td className="uppercase">{t.symbol}</td>
                    <td className="num">{t.quantity}</td>
                    <td className="num">${fmt(t.price)}</td>
                    <td className="num">${fmt(t.quantity * t.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, mono, cls = "" }) {
  return (
    <div className="panel p-4">
      <div className="label-overline">{label}</div>
      <div className={`mt-1 ${mono ? "font-mono" : ""} text-2xl ${cls}`}>{value}</div>
    </div>
  );
}
