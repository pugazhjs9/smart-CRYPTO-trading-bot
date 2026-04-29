import { ResponsiveContainer, ComposedChart, XAxis, YAxis, Tooltip, Bar, Cell, Line, CartesianGrid } from "recharts";

// Simple candlestick using composed bars (high-low + body)
export default function CandlestickChart({ data }) {
  if (!data?.length) {
    return <div className="text-[#5C5C66] text-xs text-center py-12 term-loading">Loading chart</div>;
  }
  const formatted = data.map((c) => ({
    time: c.time,
    label: new Date(c.time).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    open: c.open,
    close: c.close,
    high: c.high,
    low: c.low,
    body: [Math.min(c.open, c.close), Math.max(c.open, c.close)],
    wick: [c.low, c.high],
    up: c.close >= c.open,
  }));

  return (
    <div className="w-full h-[360px]" data-testid="candle-chart">
      <ResponsiveContainer>
        <ComposedChart data={formatted} margin={{ top: 10, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="label" stroke="#5C5C66" fontSize={10}
                 tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis stroke="#5C5C66" fontSize={10} tickLine={false} axisLine={false}
                 domain={["auto", "auto"]} width={70}
                 tickFormatter={(v) => v >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${Number(v).toFixed(2)}`} />
          <Tooltip
            contentStyle={{ background: "#050505", border: "1px solid rgba(255,255,255,0.2)", fontFamily: "JetBrains Mono", fontSize: 12 }}
            labelStyle={{ color: "#8A8A93", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em" }}
            itemStyle={{ color: "#fff" }}
            formatter={(v, n) => {
              if (Array.isArray(v)) return [`$${v[0].toFixed(2)} - $${v[1].toFixed(2)}`, n];
              return [`$${Number(v).toFixed(2)}`, n];
            }}
          />
          {/* wick */}
          <Bar dataKey="wick" barSize={1} isAnimationActive={false}>
            {formatted.map((d, i) => (
              <Cell key={i} fill={d.up ? "#00E559" : "#FF3333"} />
            ))}
          </Bar>
          {/* body */}
          <Bar dataKey="body" barSize={6} isAnimationActive={false}>
            {formatted.map((d, i) => (
              <Cell key={i} fill={d.up ? "#00E559" : "#FF3333"} />
            ))}
          </Bar>
          <Line type="monotone" dataKey="close" stroke="rgba(255,255,255,0.25)" strokeWidth={1} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
