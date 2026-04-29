import { useEffect, useState } from "react";
import api from "../lib/api";
import TopNav from "../components/TopNav";
import { Trash2, Bell, BellOff, Plus, RefreshCw } from "lucide-react";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [coins, setCoins] = useState([]);
  const [form, setForm] = useState({ coin_id: "bitcoin", symbol: "btc", type: "price_above", value: 100000 });
  const [checkResult, setCheckResult] = useState(null);
  const [checking, setChecking] = useState(false);

  const load = () => api.get("/alerts").then(({ data }) => setAlerts(data));

  useEffect(() => {
    load();
    api.get("/market/coins?per_page=20").then(({ data }) => setCoins(data));
  }, []);

  const create = async (e) => {
    e.preventDefault();
    await api.post("/alerts", { ...form, value: parseFloat(form.value) || 0 });
    load();
  };

  const remove = async (id) => {
    await api.delete(`/alerts/${id}`);
    load();
  };

  const check = async () => {
    setChecking(true);
    try {
      const { data } = await api.post("/alerts/check");
      setCheckResult(data);
      load();
    } finally { setChecking(false); }
  };

  return (
    <div data-testid="alerts-page">
      <TopNav />
      <div className="max-w-[1600px] mx-auto px-6 py-5 space-y-5">

        <div className="flex items-end justify-between">
          <div>
            <div className="label-overline">notifications · alert center</div>
            <h1 className="font-display text-3xl font-black tracking-tight mt-1">Alerts.</h1>
          </div>
          <button onClick={check} disabled={checking} className="btn-ghost flex items-center gap-2" data-testid="check-alerts-btn">
            <RefreshCw size={12} className={checking ? "animate-spin" : ""} /> {checking ? "Checking..." : "Run Check"}
          </button>
        </div>

        {checkResult && (
          <div className="panel p-4" data-testid="check-result">
            <div className="label-overline mb-2">[ last check ]</div>
            {checkResult.triggered.length === 0 ? (
              <div className="text-xs text-[#5C5C66]">No alerts triggered.</div>
            ) : (
              <ul className="space-y-1 text-sm">
                {checkResult.triggered.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-warn">
                    <Bell size={14}/> {t.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* New alert */}
        <form onSubmit={create} className="panel p-5 grid grid-cols-1 md:grid-cols-5 gap-3" data-testid="new-alert-form">
          <div>
            <label className="label-overline">coin</label>
            <select className="input-base mt-1" value={form.coin_id}
                    onChange={(e) => {
                      const id = e.target.value;
                      const c = coins.find(c => c.id === id);
                      setForm({ ...form, coin_id: id, symbol: c?.symbol || id });
                    }} data-testid="alert-coin-select">
              {coins.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.symbol.toUpperCase()})</option>)}
            </select>
          </div>
          <div>
            <label className="label-overline">type</label>
            <select className="input-base mt-1" value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    data-testid="alert-type-select">
              <option value="price_above">Price Above</option>
              <option value="price_below">Price Below</option>
              <option value="signal">Trade Signal (BUY/SELL)</option>
            </select>
          </div>
          <div>
            <label className="label-overline">value (usd)</label>
            <input type="number" step="any" className="input-base mt-1"
                   value={form.value}
                   disabled={form.type === "signal"}
                   onChange={(e) => setForm({ ...form, value: e.target.value })}
                   data-testid="alert-value-input" />
          </div>
          <div className="md:col-span-2 flex items-end">
            <button className="btn-primary w-full" data-testid="alert-create-btn"><Plus size={12} className="inline mr-1"/> Create Alert</button>
          </div>
        </form>

        {/* Alerts list */}
        <div className="panel" data-testid="alerts-table">
          <table className="tbl">
            <thead><tr>
              <th>status</th><th>asset</th><th>type</th><th className="num">value</th>
              <th>message</th><th>created</th><th></th>
            </tr></thead>
            <tbody>
              {alerts.length === 0 && <tr><td colSpan={7} className="text-center text-[#5C5C66] py-6">No alerts yet.</td></tr>}
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.triggered ? <span className="text-warn flex items-center gap-1"><Bell size={12}/> triggered</span>
                                 : <span className="text-[#8A8A93] flex items-center gap-1"><BellOff size={12}/> waiting</span>}
                  </td>
                  <td className="uppercase">{a.symbol}</td>
                  <td className="text-xs uppercase tracking-wider">{a.type.replace("_", " ")}</td>
                  <td className="num">{a.type === "signal" ? "—" : `$${a.value}`}</td>
                  <td className="text-[#8A8A93] text-xs">{a.message || "—"}</td>
                  <td className="text-[#5C5C66] text-xs">{new Date(a.created_at).toLocaleString()}</td>
                  <td>
                    <button onClick={() => remove(a.id)} className="text-[#5C5C66] hover:text-sell" data-testid={`del-alert-${a.id}`}>
                      <Trash2 size={14}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
