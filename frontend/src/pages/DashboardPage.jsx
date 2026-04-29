import { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import TopNav from "../components/TopNav";
import CandlestickChart from "../components/CandlestickChart";
import RiskCalculator from "../components/RiskCalculator";
import { Sparkles, TrendingUp, TrendingDown, Activity, Cpu } from "lucide-react";

const RANGES = [
  { label: "1D", days: 1 },
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
];

function fmtPct(n) {
  if (n == null || isNaN(n)) return "—";
  const v = Number(n);
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function fmtUsd(n) {
  if (n == null) return "—";
  const v = Number(n);
  if (v >= 1) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${v.toFixed(6)}`;
}

export default function DashboardPage() {
  const [coins, setCoins] = useState([]);
  const [active, setActive] = useState("bitcoin");
  const [days, setDays] = useState(30);
  const [ohlc, setOhlc] = useState([]);
  const [signal, setSignal] = useState(null);
  const [aiExplain, setAiExplain] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);

  // Load market list
  useEffect(() => {
    api.get("/market/coins?per_page=20").then(({ data }) => setCoins(data));
    const id = setInterval(() => {
      api.get("/market/coins?per_page=20").then(({ data }) => setCoins(data)).catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, []);

  // Load OHLC + signal when coin/days change
  useEffect(() => {
    setChartLoading(true);
    setAiExplain(null);
    Promise.all([
      api.get(`/market/ohlc/${active}?days=${days}`),
      api.get(`/analysis/signal/${active}`),
    ])
      .then(([o, s]) => { setOhlc(o.data); setSignal(s.data); })
      .catch(() => {})
      .finally(() => setChartLoading(false));
  }, [active, days]);

  const askAI = useCallback(async () => {
    setAiLoading(true);
    try {
      const { data } = await api.post(`/analysis/explain/${active}`);
      setAiExplain(data);
    } catch (e) {
      setAiExplain({ ai_explanation: "AI explanation unavailable. " + (e.response?.data?.detail || "") });
    } finally { setAiLoading(false); }
  }, [active]);

  const activeCoin = coins.find((c) => c.id === active);
  const indicators = signal?.indicators;

  return (
    <div data-testid="dashboard-page">
      <TopNav />
      <div className="max-w-[1600px] mx-auto px-6 py-5 space-y-5">

        {/* Top ticker */}
        <div className="panel overflow-x-auto" data-testid="top-ticker">
          <div className="flex divide-x divide-white/10 min-w-max">
            {coins.slice(0, 8).map((c) => {
              const up = (c.price_change_percentage_24h ?? 0) >= 0;
              return (
                <button
                  key={c.id} onClick={() => setActive(c.id)}
                  className={`px-5 py-3 text-left min-w-[180px] hover:bg-white/5 transition-colors ${active === c.id ? "bg-white/5" : ""}`}
                  data-testid={`ticker-${c.id}`}
                >
                  <div className="flex items-center gap-2">
                    <img src={c.image} alt="" className="w-4 h-4" />
                    <span className="text-xs uppercase tracking-[0.15em] text-[#8A8A93]">{c.symbol}</span>
                  </div>
                  <div className="font-mono text-sm mt-1">{fmtUsd(c.current_price)}</div>
                  <div className={`text-xs font-mono ${up ? "text-buy" : "text-sell"}`}>{fmtPct(c.price_change_percentage_24h)}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Header row */}
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="label-overline">{activeCoin?.symbol || "—"} / USD · spot</div>
            <div className="flex items-baseline gap-4 mt-1">
              <h1 className="font-display text-4xl font-black tracking-tight" data-testid="active-price">
                {fmtUsd(activeCoin?.current_price)}
              </h1>
              <span className={`font-mono text-sm ${activeCoin?.price_change_percentage_24h >= 0 ? "text-buy" : "text-sell"}`}>
                {fmtPct(activeCoin?.price_change_percentage_24h)} · 24h
              </span>
            </div>
          </div>
          <div className="flex gap-1" data-testid="range-selector">
            {RANGES.map((r) => (
              <button key={r.days}
                      className={`btn-ghost ${days === r.days ? "border-white text-white bg-[#1A1A1D]" : ""}`}
                      onClick={() => setDays(r.days)}
                      data-testid={`range-${r.label}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Chart + indicators */}
          <div className="lg:col-span-2 panel p-5" data-testid="chart-panel">
            <div className="flex items-center justify-between mb-3">
              <div className="label-overline">candlestick · {RANGES.find(r=>r.days===days)?.label}</div>
              <div className="flex items-center gap-1 text-xs text-[#5C5C66]">
                <Activity size={12}/> Live · CoinGecko
              </div>
            </div>
            {chartLoading ? (
              <div className="text-[#5C5C66] text-xs term-loading h-[360px] flex items-center justify-center">Loading market data</div>
            ) : (
              <CandlestickChart data={ohlc} />
            )}

            {/* Indicators row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5" data-testid="indicators-row">
              <Indicator label="RSI(14)" value={indicators?.rsi}
                cls={indicators?.rsi > 70 ? "text-sell" : indicators?.rsi < 30 ? "text-buy" : ""} />
              <Indicator label="MACD" value={indicators?.macd?.toFixed(3)} />
              <Indicator label="MACD Signal" value={indicators?.macd_signal?.toFixed(3)} />
              <Indicator label="EMA20" value={indicators?.ema20 && fmtUsd(indicators.ema20)} />
              <Indicator label="EMA50" value={indicators?.ema50 && fmtUsd(indicators.ema50)} />
            </div>
          </div>

          {/* Signal panel */}
          <div className="space-y-4">
            <SignalPanel signal={signal} onAsk={askAI} loading={aiLoading} explain={aiExplain} />
            <MLPanel ml={signal?.ml_prediction} />
          </div>
        </div>

        {/* Bottom row: market list + risk calc */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="panel lg:col-span-2 overflow-x-auto" data-testid="market-table">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="label-overline">market · top 20</div>
              <div className="text-xs text-[#5C5C66]">click row to load</div>
            </div>
            <table className="tbl">
              <thead>
                <tr><th>#</th><th>asset</th><th className="num">price</th><th className="num">1h</th>
                    <th className="num">24h</th><th className="num">7d</th><th className="num">market cap</th></tr>
              </thead>
              <tbody>
                {coins.map((c, i) => (
                  <tr key={c.id} onClick={() => setActive(c.id)}
                      className="cursor-pointer" data-testid={`market-row-${c.id}`}>
                    <td className="text-[#5C5C66]">{i + 1}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <img src={c.image} alt="" className="w-4 h-4" />
                        <span className="font-medium">{c.name}</span>
                        <span className="text-[#5C5C66] text-xs uppercase">{c.symbol}</span>
                      </div>
                    </td>
                    <td className="num">{fmtUsd(c.current_price)}</td>
                    <PctCell v={c.price_change_percentage_1h_in_currency} />
                    <PctCell v={c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h} />
                    <PctCell v={c.price_change_percentage_7d_in_currency} />
                    <td className="num">{c.market_cap ? `$${(c.market_cap/1e9).toFixed(2)}B` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <RiskCalculator defaultPrice={activeCoin?.current_price || 100} />
        </div>
      </div>
    </div>
  );
}

function PctCell({ v }) {
  const cls = (v ?? 0) >= 0 ? "text-buy" : "text-sell";
  return <td className={`num ${cls}`}>{fmtPct(v)}</td>;
}

function Indicator({ label, value, cls = "" }) {
  return (
    <div className="border border-white/10 p-3">
      <div className="label-overline">{label}</div>
      <div className={`font-mono mt-1 text-sm ${cls}`}>{value ?? "—"}</div>
    </div>
  );
}

function SignalPanel({ signal, onAsk, loading, explain }) {
  if (!signal) {
    return <div className="panel p-5 term-loading">Computing signal</div>;
  }
  const isBuy = signal.signal === "BUY";
  const isSell = signal.signal === "SELL";
  const badgeCls = isBuy ? "bg-buy-soft text-buy" : isSell ? "bg-sell-soft text-sell" : "bg-white/5 text-white";
  return (
    <div className="panel p-5" data-testid="signal-panel">
      <div className="flex items-center justify-between mb-3">
        <div className="label-overline">signal engine</div>
        <div className="flex items-center gap-1 text-xs text-[#5C5C66]"><Activity size={12}/> live</div>
      </div>
      <div className={`px-3 py-2 inline-flex items-center gap-2 ${badgeCls}`} data-testid="signal-badge">
        {isBuy && <TrendingUp size={16}/>}
        {isSell && <TrendingDown size={16}/>}
        <span className="font-display font-black text-2xl tracking-tight">{signal.signal}</span>
        <span className="label-overline ml-2">conf {Math.round(signal.confidence*100)}%</span>
      </div>
      <ul className="mt-4 space-y-1.5 text-xs text-[#8A8A93]">
        {signal.reasons?.map((r, i) => (
          <li key={i} className="flex gap-2"><span className="text-white">·</span>{r}</li>
        ))}
      </ul>

      <button onClick={onAsk} disabled={loading}
              className="mt-4 w-full px-3 py-2.5 border border-ai bg-ai-soft text-ai
                         text-xs uppercase tracking-[0.18em] flex items-center justify-center gap-2
                         hover:bg-[#0066FF]/15"
              data-testid="ai-explain-btn">
        <Sparkles size={14}/> {loading ? "Gemini analyzing..." : "Ask Gemini · Why?"}
      </button>

      {explain?.ai_explanation && (
        <div className="mt-3 p-3 border border-ai bg-ai-soft text-xs leading-relaxed" data-testid="ai-explanation">
          <div className="label-overline mb-1 text-ai">[ gemini · ai rationale ]</div>
          {explain.ai_explanation}
        </div>
      )}
    </div>
  );
}

function MLPanel({ ml }) {
  if (!ml) return null;
  const up = ml.direction === "up";
  return (
    <div className="panel p-5" data-testid="ml-panel">
      <div className="flex items-center justify-between mb-3">
        <div className="label-overline">ml · next-period forecast</div>
        <div className="flex items-center gap-1 text-xs text-[#5C5C66]"><Cpu size={12}/> {ml.model}</div>
      </div>
      <div className="flex items-baseline gap-3">
        <div className={`font-display font-black text-3xl tracking-tight ${up ? "text-buy" : "text-sell"}`} data-testid="ml-direction">
          {ml.direction.toUpperCase()}
        </div>
        <div className="text-xs text-[#8A8A93]">
          probability up {ml.up_probability != null ? `${(ml.up_probability*100).toFixed(1)}%` : "—"}
        </div>
      </div>
      <div className="mt-3 h-1 bg-white/5 relative">
        <div className={`absolute top-0 left-0 h-full ${up ? "bg-[#00E559]" : "bg-[#FF3333]"}`}
             style={{ width: `${(ml.confidence ?? 0)*100}%` }} />
      </div>
      <div className="label-overline mt-1">model confidence {Math.round((ml.confidence ?? 0)*100)}%</div>
    </div>
  );
}
