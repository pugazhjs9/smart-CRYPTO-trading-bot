import { useState } from "react";
import api from "../lib/api";

export default function RiskCalculator({ defaultPrice = 100 }) {
  const [form, setForm] = useState({
    account_size: 10000,
    risk_percent: 1,
    entry_price: defaultPrice,
    stop_loss: defaultPrice * 0.95,
    take_profit: defaultPrice * 1.1,
  });
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  const update = (k) => (e) => setForm({ ...form, [k]: parseFloat(e.target.value) || 0 });

  const calc = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      const { data } = await api.post("/analysis/risk", form);
      setResult(data);
    } catch (e) {
      setErr(e.response?.data?.detail || "Calculation failed");
    }
  };

  return (
    <div className="panel p-5" data-testid="risk-calc">
      <div className="flex items-center justify-between mb-4">
        <div className="label-overline">risk · position calculator</div>
      </div>
      <form onSubmit={calc} className="grid grid-cols-2 gap-3">
        <div>
          <label className="label-overline">account ($)</label>
          <input type="number" className="input-base mt-1" value={form.account_size}
                 onChange={update("account_size")} data-testid="risk-account-input" step="any" />
        </div>
        <div>
          <label className="label-overline">risk %</label>
          <input type="number" className="input-base mt-1" value={form.risk_percent}
                 onChange={update("risk_percent")} step="0.1" data-testid="risk-percent-input" />
        </div>
        <div>
          <label className="label-overline">entry</label>
          <input type="number" className="input-base mt-1" value={form.entry_price}
                 onChange={update("entry_price")} step="any" data-testid="risk-entry-input" />
        </div>
        <div>
          <label className="label-overline">stop loss</label>
          <input type="number" className="input-base mt-1" value={form.stop_loss}
                 onChange={update("stop_loss")} step="any" data-testid="risk-sl-input" />
        </div>
        <div className="col-span-2">
          <label className="label-overline">take profit</label>
          <input type="number" className="input-base mt-1" value={form.take_profit}
                 onChange={update("take_profit")} step="any" data-testid="risk-tp-input" />
        </div>
        <button className="btn-primary col-span-2 mt-2" data-testid="risk-calc-btn">Calculate</button>
      </form>
      {err && <div className="text-sell text-xs mt-3">{err}</div>}
      {result && (
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs" data-testid="risk-result">
          <Stat label="position size" value={`${result.position_size_units} units`} />
          <Stat label="notional" value={`$${result.notional_usd}`} />
          <Stat label="max loss" value={`$${result.max_loss}`} cls="text-sell" />
          <Stat label="potential profit" value={`$${result.potential_profit}`} cls="text-buy" />
          <Stat label="r:r ratio" value={`${result.risk_reward_ratio} : 1`} cls="text-ai" />
          <Stat label="risk amount" value={`$${result.risk_amount}`} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, cls = "" }) {
  return (
    <div className="border border-white/10 p-2.5">
      <div className="label-overline">{label}</div>
      <div className={`font-mono mt-1 ${cls}`}>{value}</div>
    </div>
  );
}
