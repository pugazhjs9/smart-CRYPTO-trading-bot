import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { LogOut, BarChart3, Briefcase, BellRing } from "lucide-react";

export default function TopNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const linkClass = ({ isActive }) =>
    `px-4 py-2 text-xs uppercase tracking-[0.18em] flex items-center gap-2 transition-colors ` +
    (isActive ? "text-white border-b border-white" : "text-[#8A8A93] hover:text-white");

  return (
    <header className="glass-nav sticky top-0 z-50" data-testid="top-nav">
      <div className="max-w-[1600px] mx-auto px-6 flex items-center justify-between h-14">
        <Link to="/dashboard" className="flex items-center gap-3" data-testid="brand-link">
          <div className="w-7 h-7 bg-white text-black flex items-center justify-center font-display font-black text-sm">C</div>
          <span className="font-display font-black tracking-tight text-base">CRYPTO/AI</span>
          <span className="label-overline ml-2 text-[#5C5C66]">terminal</span>
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink to="/dashboard" className={linkClass} data-testid="nav-dashboard">
            <BarChart3 size={14} /> Dashboard
          </NavLink>
          <NavLink to="/portfolio" className={linkClass} data-testid="nav-portfolio">
            <Briefcase size={14} /> Portfolio
          </NavLink>
          <NavLink to="/alerts" className={linkClass} data-testid="nav-alerts">
            <BellRing size={14} /> Alerts
          </NavLink>
        </nav>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex flex-col items-end">
            <span className="label-overline">user</span>
            <span className="text-xs text-white" data-testid="nav-user-email">{user?.email}</span>
          </div>
          <button className="btn-ghost flex items-center gap-2" onClick={handleLogout} data-testid="logout-btn">
            <LogOut size={12} /> Logout
          </button>
        </div>
      </div>
    </header>
  );
}
