import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardPage from "@/pages/DashboardPage";
import PortfolioPage from "@/pages/PortfolioPage";
import AlertsPage from "@/pages/AlertsPage";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading || user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050505]">
        <div className="label-overline term-loading">initializing terminal</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading || user === undefined) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
            <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
            <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
            <Route path="/portfolio" element={<Protected><PortfolioPage /></Protected>} />
            <Route path="/alerts" element={<Protected><AlertsPage /></Protected>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
