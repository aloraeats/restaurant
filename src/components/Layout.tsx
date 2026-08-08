// ============================================================
// Layout.tsx
// Fixed: KioskNavLink + AnalyticsNavLink moved outside Layout
// to prevent React from remounting them on every render
// ============================================================
import { supabase } from "../lib/supabase";
import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Spinner, ToastContainer } from "./UI";
import { isOrgAccessible } from "../utils/helpers";
import type { OrgRole } from "../lib/types";

interface NavItem {
    href: string;
    label: string;
    icon: string;
    roles: OrgRole[];
}

const NAV_ITEMS: NavItem[] = [
    {
        href: "/dashboard",
        label: "Dashboard",
        icon: "🏠",
        roles: ["super_admin", "manager", "staff"],
    },
    {
        href: "/menu-management",
        label: "Menu",
        icon: "🍽️",
        roles: ["super_admin", "manager"],
    },
    {
        href: "/branches",
        label: "Branches",
        icon: "🏪",
        roles: ["super_admin"],
    },
    {
        href: "/kitchen",
        label: "Kitchen",
        icon: "👨‍🍳",
        roles: ["super_admin", "manager", "staff"],
    },
    {
        href: "/analytics",
        label: "Analytics",
        icon: "📊",
        roles: ["super_admin", "manager"],
    },
];

// ── Kiosk nav link ────────────────────────────────────────────
// Defined OUTSIDE Layout — KioskNavLink is its own component.
// Kiosk requires a branchId in the URL so it can't be a static
// NAV_ITEMS entry. Only staff roles see this link.
// super_admin and manager never see it — they don't use the kiosk.
function KioskNavLink({
    role,
    userId,
    onNavigate,
}: {
    role: OrgRole;
    userId: string;
    onNavigate: () => void;
}) {
    const location = useLocation();
    const [kioskHref, setKioskHref] = useState<string | null>(null);

    useEffect(() => {
            if (role !== "staff") return;

            console.log("[KioskNavLink] Fetching branch for userId:", userId);

            supabase
                .from("branch_staff")
                .select("branch_id")
                .eq("profile_id", userId)
                .limit(1)
                .maybeSingle()
                .then(({ data, error }) => {
                    console.log("[KioskNavLink] Result:", { data, error });
                    if (error) {
                        console.error("[KioskNavLink] Query error:", error);
                        return;
                    }
                    if (data?.branch_id) {
                        setKioskHref(`/kiosk/${data.branch_id}`);
                    } else {
                        console.warn("[KioskNavLink] No branch_staff row found for this user");
                    }
                })
                .catch((err) => {
                    console.error("[KioskNavLink] Unexpected error:", err);
                });
        }, [role, userId]);

    if (role !== "staff" || !kioskHref) return null;

    const isActive = location.pathname.startsWith("/kiosk");

    return (
        <Link
            to={kioskHref}
            onClick={onNavigate}
            className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg
                text-sm font-medium transition-colors
                ${isActive
                    ? "bg-green-50 text-green-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }
            `}
        >
            <span className="text-base">🖥️</span>
            Kiosk
        </Link>
    );
}

// ── Analytics nav link for branch managers ────────────────────
// Branch managers (org role "staff" + branch role "branch_manager")
// need access to analytics, but since their org role is "staff",
// the static NAV_ITEMS filter won't include it. This component
// fetches their branch role and shows the link accordingly.
function AnalyticsNavLink({
    role,
    userId,
    onNavigate,
}: {
    role: OrgRole;
    userId: string;
    onNavigate: () => void;
}) {
    const location = useLocation();
    const [isBranchManager, setIsBranchManager] = useState(false);

    useEffect(() => {
        if (role !== "staff") return;
        supabase
            .from("branch_staff")
            .select("role")
            .eq("profile_id", userId)
            .eq("role", "branch_manager")
            .limit(1)
            .maybeSingle()
            .then(({ data }) => {
                setIsBranchManager(!!data);
            });
    }, [role, userId]);

    if (role !== "staff" || !isBranchManager) return null;

    const isActive = location.pathname.startsWith("/analytics");

    return (
        <Link
            to="/analytics"
            onClick={onNavigate}
            className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg
                text-sm font-medium transition-colors
                ${isActive
                    ? "bg-green-50 text-green-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }
            `}
        >
            <span className="text-base">📊</span>
            Analytics
        </Link>
    );
}

interface LayoutProps {
    children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
    const { user, org, loading, signOut } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // ── Auth loading ──────────────────────────────────────────
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Spinner size="lg" />
            </div>
        );
    }

    // ── Not logged in ─────────────────────────────────────────
    if (!user) return null;

    const role = user.role;
    const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(role));

    // ✅ Null-safe org check
    const orgBlocked = org
        ? !isOrgAccessible(org.subscription_status)
        : false;

    async function handleSignOut() {
        await signOut();
        navigate("/");
    }

    return (
        <div className="min-h-screen bg-gray-50 flex">

            {/* ── Mobile overlay ────────────────────────────── */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-20 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* ── Sidebar ───────────────────────────────────── */}
            <aside className={`
                fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-100
                flex flex-col transform transition-transform duration-200
                lg:static lg:translate-x-0
                ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
            `}>
                {/* Logo / org name */}
                <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
                    <span className="text-2xl">🍽️</span>
                    <div className="min-w-0">
                        <p className="font-bold text-gray-900 text-sm truncate">
                            {org?.name || user.full_name || "Restaurant"}
                        </p>
                        <p className="text-xs text-gray-400 capitalize">
                            {role.replace("_", " ")}
                        </p>
                    </div>
                </div>

                {/* Nav links */}
                <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
                    {visibleNav.map((item) => {
                        const isActive =
                            location.pathname === item.href ||
                            (item.href !== "/dashboard" &&
                                location.pathname.startsWith(item.href));
                        return (
                            <Link
                                key={item.href}
                                to={item.href}
                                onClick={() => setSidebarOpen(false)}
                                className={`
                                    flex items-center gap-3 px-3 py-2.5 rounded-lg
                                    text-sm font-medium transition-colors
                                    ${isActive
                                        ? "bg-green-50 text-green-700"
                                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                    }
                                `}
                            >
                                <span className="text-base">{item.icon}</span>
                                {item.label}
                            </Link>
                        );
                    })}

                    {/* Kiosk — staff only, dynamic href */}
                    <KioskNavLink
                        role={role}
                        userId={user.id}
                        onNavigate={() => setSidebarOpen(false)}
                    />

                    {/* Analytics — branch managers need dynamic link */}
                    <AnalyticsNavLink
                        role={role}
                        userId={user.id}
                        onNavigate={() => setSidebarOpen(false)}
                    />
                </nav>

                {/* User footer */}
                <div className="px-4 py-4 border-t border-gray-100">
                    <div className="flex items-center gap-3 px-3 py-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center
                                       justify-center text-green-700 font-bold text-sm flex-shrink-0">
                            {user.full_name?.charAt(0).toUpperCase() || "U"}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                                {user.full_name || "User"}
                            </p>
                            <p className="text-xs text-gray-400 truncate">
                                {user.email}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm
                                   text-gray-600 hover:text-red-600 hover:bg-red-50
                                   rounded-lg transition-colors"
                    >
                        <span>🚪</span>
                        Sign out
                    </button>
                </div>
            </aside>

            {/* ── Main content ──────────────────────────────── */}
            <div className="flex-1 flex flex-col min-w-0">

                {/* Top bar */}
                <header className="sticky top-0 z-10 bg-white border-b border-gray-100
                                   flex items-center justify-between px-4 py-3">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24"
                            stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>

                    <h1 className="text-base font-semibold text-gray-900">
                        {visibleNav.find(
                            (n) =>
                                location.pathname === n.href ||
                                (n.href !== "/dashboard" &&
                                    location.pathname.startsWith(n.href))
                        )?.label || "Dashboard"}
                    </h1>

                    {org?.subscription_status === "suspended" && (
                        <span className="text-xs bg-yellow-100 text-yellow-700
                                         px-3 py-1 rounded-full font-medium">
                            ⚠️ Grace period active
                        </span>
                    )}
                </header>

                {/* ── Blocked overlay ───────────────────────── */}
                {orgBlocked ? (
                    <div className="flex-1 flex items-center justify-center p-8">
                        <div className="max-w-md text-center">
                            <div className="text-6xl mb-4">🔒</div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">
                                Access Restricted
                            </h2>
                            <p className="text-gray-500 mb-6">
                                Your subscription has expired. Please renew to continue.
                            </p>
                            {role === "super_admin" ? (
                                <Link
                                    to="/dashboard"
                                    className="inline-flex items-center justify-center
                                               px-6 py-3 bg-green-600 text-white rounded-xl
                                               font-medium hover:bg-green-700 transition-colors"
                                >
                                    Renew Subscription →
                                </Link>
                            ) : (
                                <p className="text-sm text-gray-400">
                                    Contact your administrator to renew.
                                </p>
                            )}
                        </div>
                    </div>
                ) : (
                    <main className="flex-1 overflow-auto">
                        {children}
                    </main>
                )}
            </div>

            <ToastContainer />
        </div>
    );
}