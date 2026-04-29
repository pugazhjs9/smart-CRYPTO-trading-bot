import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, formatErr } from "../lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@cryptoai.com");
  const [password, setPassword] = useState("admin123");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (e) {
      setErr(formatErr(e.response?.data?.detail) || e.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2" data-testid="login-page">
      {/* Left visual */}
      <div className="hidden lg:flex relative overflow-hidden border-r border-white/10">
        <img src="https://images.pexels.com/photos/3612932/pexels-photo-3612932.jpeg" className="absolute inset-0 w-full h-full object-cover" alt="" />
        <div className="absolute inset-0 bg-black/75" />
        <div className="relative z-10 p-12 flex flex-col justify-between w-full">
          <div className="font-display font-black text-2xl tracking-tight">CRYPTO/AI · TERMINAL</div>
          <div>
            <div className="label-overline mb-2 text-[#0066FF]">[ system ]</div>
            <h1 className="font-display text-5xl xl:text-6xl font-black tracking-tight leading-[1.05]">
              Quant-grade<br/>signals.<br/>
              <span className="text-[#00E559]">Built for traders.</span>
            </h1>
            <p className="mt-6 text-sm text-[#8A8A93] max-w-md">
              Real-time market data. Multi-indicator signal engine. Machine-learning forecasts.
              Gemini-powered explanations. One terminal.
            </p>
          </div>
          <div className="flex gap-8 text-xs">
            <div><div className="label-overline">indicators</div><div className="font-mono">RSI · MACD · EMA</div></div>
            <div><div className="label-overline">model</div><div className="font-mono">RandomForest</div></div>
            <div><div className="label-overline">data</div><div className="font-mono">CoinGecko · Live</div></div>
          </div>
        </div>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm" data-testid="login-form">
          <div className="label-overline mb-3">access · login</div>
          <h2 className="font-display text-3xl font-black tracking-tight mb-8">Sign in.</h2>

          <label className="label-overline">email</label>
          <input className="input-base mb-4 mt-1" type="email" value={email}
                 onChange={(e) => setEmail(e.target.value)} required
                 data-testid="login-email-input" />

          <label className="label-overline">password</label>
          <input className="input-base mb-2 mt-1" type="password" value={password}
                 onChange={(e) => setPassword(e.target.value)} required
                 data-testid="login-password-input" />

          {err && <div className="text-sell text-xs mt-3" data-testid="login-error">{err}</div>}

          <button className="btn-primary w-full mt-6" disabled={loading}
                  data-testid="login-submit-btn">
            {loading ? "Authenticating..." : "Enter Terminal"}
          </button>

          <div className="mt-6 text-xs text-[#8A8A93]">
            No account? <Link to="/register" className="text-white underline" data-testid="goto-register">Register</Link>
          </div>
          <div className="mt-8 p-3 border border-white/10 text-xs text-[#8A8A93]">
            <div className="label-overline mb-1">demo credentials</div>
            <div className="font-mono">admin@cryptoai.com / admin123</div>
          </div>
        </form>
      </div>
    </div>
  );
}
