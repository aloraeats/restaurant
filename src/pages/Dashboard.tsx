// ============================================================
// Dashboard.tsx
// Fixed: handles org being null (staff role), added proper
// loading guards, all roles see appropriate content.
// ============================================================

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import SubscriptionCard from "../components/SubscriptionCard";
import { Spinner, Badge, EmptyState } from "../components/UI";
import {
    formatCurrency,
    formatDateTime,
    orderStatusColor,
    orderStatusLabel,
    timeAgo,
} from "../utils/helpers";
import type { Branch, Order, SetupStep } from "../lib/types";

// ✅ Fixed StatCard — handles any number size
function StatCard({
    label, value, icon, sub,
}: {
    label: string;
    value: string | number;
    icon: string;
    sub?: string;
}) {
    return (
        <div className="card flex items-start gap-3 overflow-hidden">
            {/* flex-shrink-0 stops icon squishing when number is long */}
            <div className="text-2xl flex-shrink-0">{icon}</div>
            {/* min-w-0 is CRITICAL — allows flex child to shrink */}
            <div className="min-w-0 flex-1">
                <p className="text-xl font-bold text-gray-900
                              break-words leading-tight">
                    {value}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">
                    {label}
                </p>
                {sub && (
                    <p className="text-xs text-gray-400 mt-0.5">
                        {sub}
                    </p>
                )}
            </div>
        </div>
    );
}

// ── Setup checklist item ──────────────────────────────────────
function ChecklistItem({ step }: { step: SetupStep }) {
    return (
        <Link
            to={step.href}
            className={`
                flex items-center gap-4 p-4 rounded-xl border transition-all
                ${step.completed
                    ? "border-green-200 bg-green-50 opacity-75"
                    : "border-gray-200 bg-white hover:border-green-300 hover:shadow-sm"
                }
            `}
        >
            <div className={`
                w-8 h-8 rounded-full flex items-center justify-center
                flex-shrink-0 text-sm font-bold
                ${step.completed
                    ? "bg-green-500 text-white"
                    : "bg-gray-100 text-gray-500"
                }
            `}>
                {step.completed ? "✓" : "→"}
            </div>
            <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${step.completed
                        ? "text-green-700 line-through"
                        : "text-gray-900"
                    }`}>
                    {step.title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{step.description}</p>
            </div>
        </Link>
    );
}

// ── Main component ────────────────────────────────────────────
export default function Dashboard() {
    const { user, org } = useAuth();

    const [branches, setBranches] = useState<Branch[]>([]);
    const [recentOrders, setRecentOrders] = useState<Order[]>([]);
    const [stats, setStats] = useState({
        totalOrders: 0,
        todayOrders: 0,
        todayRevenue: 0,
        pendingOrders: 0,
    });
    const [loading, setLoading] = useState(true);
    const [ setPaymentOpen] = useState(false);

    useEffect(() => {
        // ✅ Don't wait for org — user is enough to start loading
        // org can be null for staff roles — we handle that below
        if (user) {
            loadDashboardData();
        }
    }, [user?.id]); // ← depend on user.id not org, so staff don't get stuck

    async function loadDashboardData() {
        setLoading(true);

        try {
            // ── Fetch branches ────────────────────────────────
            // For super_admin/manager: fetch by org_id
            // For staff: fetch branches they're assigned to
            let branchData: Branch[] = [];

            if (org?.id) {
                // super_admin or manager — fetch all org branches
                const { data, error } = await supabase
                    .from("branches")
                    .select("*")
                    .eq("org_id", org.id)
                    .is("deleted_at", null)
                    .order("created_at");

                if (error) {
                    console.warn("Branch fetch error:", error.message);
                } else {
                    branchData = (data as Branch[]) || [];
                }
            } else if (user?.id) {
                // Staff role — fetch their assigned branches
                const { data, error } = await supabase
                    .from("branch_staff")
                    .select("branches(*)")
                    .eq("profile_id", user.id);

                if (error) {
                    console.warn("Branch staff fetch error:", error.message);
                } else {
                    // Extract branches from join result
                    branchData = (data || [])
                        .map((bs: any) => bs.branches)
                        .filter(Boolean) as Branch[];
                }
            }

            setBranches(branchData);

            // ── Fetch recent orders ───────────────────────────
            // Only fetch if we have branches to query
            if (branchData.length > 0) {
                const branchIds = branchData.map((b) => b.id);

                const { data: orderData, error: orderError } = await supabase
                    .from("orders")
                    .select("*")
                    .in("branch_id", branchIds)
                    .order("created_at", { ascending: false })
                    .limit(20);

                if (orderError) {
                    console.warn("Orders fetch error:", orderError.message);
                } else {
                    const orders = (orderData as Order[]) || [];
                    setRecentOrders(orders);

                    // Calculate stats
                    const today = new Date().toISOString().split("T")[0];
                    const todayOrders = orders.filter(
                        (o) => o.created_at.startsWith(today) && o.status !== "cancelled"
                    );

                    setStats({
                        totalOrders: orders.length,
                        todayOrders: todayOrders.length,
                        todayRevenue: todayOrders.reduce((s, o) => s + o.total_amount, 0),
                        pendingOrders: orders.filter((o) => o.status === "pending").length,
                    });
                }
            }

        } catch (err) {
            // ✅ Catch-all — dashboard never freezes even on error
            if (import.meta.env.DEV) console.error("Dashboard load error:", err);
        } finally {
            // ✅ ALWAYS stop loading — success or failure
            setLoading(false);
        }
    }

    // ── Setup checklist (super_admin only) ────────────────────
    const setupSteps: SetupStep[] = [
        {
            id: "branch",
            title: "Create your first branch",
            description: "Add a restaurant location to get started",
            completed: branches.length > 0,
            href: "/branches",
        },
        {
            id: "menu",
            title: "Add menu categories & items",
            description: "Build your menu so customers can order",
            completed: false,
            href: "/menu-management",
        },
        {
            id: "tables",
            title: "Create tables & download QR codes",
            description: "Set up tables for dine-in ordering",
            completed: false,
            href: "/branches",
        },
        {
            id: "staff",
            title: "Invite kitchen & waiter staff",
            description: "Add your team so they can manage orders",
            completed: false,
            href: "/branches",
        },
        {
            id: "subscribe",
            title: "Subscribe to keep your account active",
            description: "GH₵500/month for 1 branch · GH₵1,000/branch for multiple",
            completed: org?.subscription_status === "active",
            href: "/dashboard",
        },
    ];

    const completedSteps = setupSteps.filter((s) => s.completed).length;
    const allDone = completedSteps === setupSteps.length;

    // ── Loading state ─────────────────────────────────────────
    if (loading) {
        return (
            <div className="page-container flex items-center justify-center min-h-64">
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        <div className="page-container space-y-8">

            {/* ── Welcome header ────────────────────────────── */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">
                    Welcome back, {user?.full_name?.split(" ")[0] || "friend"}! 👋
                </h1>
                <p className="text-gray-500 mt-1 text-sm">
                    {new Date().toLocaleDateString("en-GH", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                    })}
                </p>
            </div>

            {/* ── Subscription card (super_admin + org only) ── */}
            {user?.role === "super_admin" && org && (
                
                    <SubscriptionCard/>   
            )}

            {/* ── Stats row ─────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    icon="🏪"
                    label="Active branches"
                    value={branches.length}
                />
                <StatCard
                    icon="📋"
                    label="Orders today"
                    value={stats.todayOrders}
                />
                <StatCard
                    icon="💰"
                    label="Revenue today"
                    value={formatCurrency(stats.todayRevenue)}
                />
                <StatCard
                    icon="⏳"
                    label="Pending orders"
                    value={stats.pendingOrders}
                    sub="Awaiting kitchen"
                />
            </div>

            {/* ── Setup checklist (super_admin, not done) ───── */}
            {user?.role === "super_admin" && !allDone && (
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">
                                🚀 Get started
                            </h2>
                            <p className="text-sm text-gray-500">
                                {completedSteps}/{setupSteps.length} steps completed
                            </p>
                        </div>
                        <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-green-500 rounded-full transition-all"
                                style={{
                                    width: `${(completedSteps / setupSteps.length) * 100}%`,
                                }}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        {setupSteps.map((step) => (
                            <ChecklistItem key={step.id} step={step} />
                        ))}
                    </div>
                </div>
            )}

            {/* ── Branches overview ──────────────────────────── */}
            {branches.length > 0 && (
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-gray-900">
                            🏪 Your branches
                        </h2>
                        {user?.role === "super_admin" && (
                            <Link
                                to="/branches"
                                className="text-sm text-green-600 hover:underline font-medium"
                            >
                                Manage →
                            </Link>
                        )}
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {branches.map((branch) => (
                            <Link
                                key={branch.id}
                                to={`/branches/${branch.id}`}
                                className="flex items-center gap-3 p-3 rounded-xl
                                           bg-gray-50 hover:bg-green-50 transition-colors"
                            >
                                <div className="w-10 h-10 bg-green-100 rounded-lg flex
                                               items-center justify-center text-green-700
                                               font-bold text-sm flex-shrink-0">
                                    {branch.name.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                        {branch.name}
                                    </p>
                                    <p className="text-xs text-gray-400 truncate">
                                        {branch.address || "No address set"}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Empty state for staff with no branches ─────── */}
            {branches.length === 0 && user?.role === "staff" && (
                <EmptyState
                    icon="🏪"
                    title="No branches assigned"
                    description="Ask your manager to assign you to a branch"
                />
            )}

            {/* ── Recent orders ──────────────────────────────── */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">
                        📋 Recent orders
                    </h2>
                    <Link
                        to="/kitchen"
                        className="text-sm text-green-600 hover:underline font-medium"
                    >
                        Live view →
                    </Link>
                </div>

                {recentOrders.length === 0 ? (
                    <EmptyState
                        icon="📭"
                        title="No orders yet"
                        description="Orders will appear here once customers start scanning QR codes"
                    />
                ) : (
                    <div className="space-y-2">
                        {recentOrders.slice(0, 10).map((order) => (
                            <div
                                key={order.id}
                                className="flex items-center justify-between py-3
                                           border-b border-gray-50 last:border-0"
                            >
                                <div className="flex items-center gap-3">
                                    <Badge className={orderStatusColor(order.status)}>
                                        {orderStatusLabel(order.status)}
                                    </Badge>
                                    <div>
                                        <p className="text-sm text-gray-700 font-medium">
                                            {formatCurrency(order.total_amount)}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {timeAgo(order.created_at)}
                                        </p>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-400 hidden sm:block">
                                    {formatDateTime(order.created_at)}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}