import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, formatErr } from "../lib/auth";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      await register(name, email, password);
      navigate("/dashboard");
    } catch (e) {
      setErr(formatErr(e.response?.data?.detail) || e.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2" data-testid="register-page">
      <div className="hidden lg:flex relative overflow-hidden border-r border-white/10">
        <img src="https://images.unsplash.com/photo-1763888450809-4125d93fa56b" className="absolute inset-0 w-full h-full object-cover opacity-70" alt="" />
        <div className="absolute inset-0 bg-black/70" />
        <div className="relative z-10 p-12 flex flex-col justify-between w-full">
          <div className="font-display font-black text-2xl tracking-tight">CRYPTO/AI · TERMINAL</div>
          <div>
            <div className="label-overline mb-2 text-[#0066FF]">[ join ]</div>
            <h1 className="font-display text-5xl xl:text-6xl font-black tracking-tight leading-[1.05]">
              Start trading<br/>with signal.
            </h1>
            <p className="mt-6 text-sm text-[#8A8A93] max-w-md">
              Free paper-trading wallet of $10,000 to test strategies. Track holdings, run risk math, and get AI rationale.
            </p>
          </div>
          <div className="text-xs text-[#5C5C66]">No credit card · Cancel anytime · Built for retail quants.</div>
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm" data-testid="register-form">
          <div className="label-overline mb-3">access · register</div>
          <h2 className="font-display text-3xl font-black tracking-tight mb-8">Create account.</h2>

          <label className="label-overline">name</label>
          <input className="input-base mb-4 mt-1" value={name}
                 onChange={(e) => setName(e.target.value)} required
                 data-testid="register-name-input" />

          <label className="label-overline">email</label>
          <input className="input-base mb-4 mt-1" type="email" value={email}
                 onChange={(e) => setEmail(e.target.value)} required
                 data-testid="register-email-input" />

          <label className="label-overline">password</label>
          <input className="input-base mb-2 mt-1" type="password" value={password}
                 onChange={(e) => setPassword(e.target.value)} required minLength={6}
                 data-testid="register-password-input" />

          {err && <div className="text-sell text-xs mt-3" data-testid="register-error">{err}</div>}

          <button className="btn-primary w-full mt-6" disabled={loading}
                  data-testid="register-submit-btn">
            {loading ? "Creating account..." : "Open Account"}
          </button>

          <div className="mt-6 text-xs text-[#8A8A93]">
            Already registered? <Link to="/login" className="text-white underline" data-testid="goto-login">Sign in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
