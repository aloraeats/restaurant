// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Layout from "./components/Layout";

import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import MenuManagement from "./pages/Menu";
import Branches from "./pages/Branches";
import BranchDetail from "./pages/BranchDetail";
import Kitchen from "./pages/Kitchen";
import Customer from "./pages/Customer";
import PaymentCallback from "./pages/PaymentCallback";

const basename = "/";

// ── Protected route — waits for auth to resolve ───────────────
function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-green-500
                                    border-t-transparent rounded-full animate-spin" />
                    <p className="text-gray-500 text-sm">Loading...</p>
                </div>
            </div>
        );
    }

    if (!user) return <Navigate to="/" replace />;
    return <>{children}</>;
}

// ── Auth route — redirects to dashboard if logged in ──────────
function AuthRoute() {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="w-10 h-10 border-4 border-green-500
                                border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    // Only redirect if we are CERTAIN user is logged in
    if (user) return <Navigate to="/dashboard" replace />;

    // Not logged in — show the login page
    return <Auth />;
}

export default function App() {
    return (
        <BrowserRouter basename={basename}>
            <Routes>
                {/*
                    ── Truly public routes ──────────────────────────────
                    These NEVER touch auth state for redirect decisions.
                    Customer page is 100% anonymous — no useAuth involved
                    in routing. The component itself can still call
                    useAuth() if needed, but routing won't redirect it.
                */}
                <Route path="/menu/:qrId" element={<Customer />} />
                <Route path="/payment-callback" element={<PaymentCallback />} />

                {/*
                    ── Auth route ───────────────────────────────────────
                    Shows login page, redirects to /dashboard if logged in.
                    Separated into its own component so the loading state
                    is handled before any redirect decision is made.
                */}
                <Route path="/" element={<AuthRoute />} />

                {/* ── Protected routes ── */}
                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute>
                            <Layout><Dashboard /></Layout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/menu-management"
                    element={
                        <ProtectedRoute>
                            <Layout><MenuManagement /></Layout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/branches"
                    element={
                        <ProtectedRoute>
                            <Layout><Branches /></Layout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/branches/:id"
                    element={
                        <ProtectedRoute>
                            <Layout><BranchDetail /></Layout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/kitchen"
                    element={
                        <ProtectedRoute>
                            <Layout><Kitchen /></Layout>
                        </ProtectedRoute>
                    }
                />

                {/* ── Fallback ── */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}