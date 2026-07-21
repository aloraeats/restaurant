// ============================================================
// Dashboard.tsx
// v1: billing/subscription UI removed.
// Added: VAT configuration card for super_admin
// ============================================================

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { Spinner, Badge, EmptyState, toast } from "../components/UI";
import {
    formatCurrency,
    formatDateTime,
    orderStatusColor,
    orderStatusLabel,
    timeAgo,
} from "../utils/helpers";
import type { Branch, Order, SetupStep } from "../lib/types";

// ── StatCard ──────────────────────────────────────────────────
function StatCard({
    label,
    value,
    icon,
    sub,
    highlight,
}: {
    label: string;
    value: string | number;
    icon: string;
    sub?: string;
    highlight?: boolean;
}) {
    return (
        <div className={`
            card flex items-start gap-3 overflow-hidden
            ${highlight ? "border-green-200 bg-green-50" : ""}
        `}>
            <div className="text-2xl flex-shrink-0">{icon}</div>
            <div className="min-w-0 flex-1">
                <p className={`
                    text-xl font-bold break-words leading-tight
                    ${highlight ? "text-green-700" : "text-gray-900"}
                `}>
                    {value}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">{label}</p>
                {sub && (
                    <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                )}
            </div>
        </div>
    );
}

// ── ChecklistItem ─────────────────────────────────────────────
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

// ── VatSettingsCard ───────────────────────────────────────────
function VatSettingsCard({
    orgId,
    currentRate,
}: {
    orgId: string;
    currentRate: number;
}) {
    // Display as percentage (e.g. 0.185 → "18.5")
    const [rate, setRate] = useState<string>(
        currentRate > 0 ? (currentRate * 100).toFixed(1) : "0"
    );
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    async function handleSave() {
        const parsed = parseFloat(rate);

        if (isNaN(parsed) || parsed < 0 || parsed > 100) {
            toast.error("VAT rate must be between 0% and 100%");
            return;
        }

        setSaving(true);

        const { error } = await supabase
            .from("organizations")
            .update({ vat_rate: parsed / 100 })
            .eq("id", orgId);

        if (error) {
            toast.error("Failed to save VAT rate");
        } else {
            setSaved(true);
            toast.success("VAT rate updated successfully");
            setTimeout(() => setSaved(false), 3000);
        }

        setSaving(false);
    }

    const parsedRate = parseFloat(rate) || 0;
    const exampleGross = 100;
    const exampleVat = exampleGross * (parsedRate / 100) / (1 + parsedRate / 100);
    const exampleNet = exampleGross - exampleVat;

    return (
        <div className="card">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                    <h2 className="text-base font-semibold text-gray-900">
                        🧾 VAT Configuration
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5 max-w-sm">
                        Set to 0% if VAT does not apply or your prices exclude tax.
                        Ghana standard rate is 18.5%.
                    </p>
                </div>

                {/* Rate input + save */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="relative">
                        <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={rate}
                            onChange={(e) => {
                                setSaved(false);
                                setRate(e.target.value);
                            }}
                            className="w-24 border border-gray-200 rounded-lg px-3 py-2
                                       text-sm focus:outline-none focus:ring-2
                                       focus:ring-green-500 text-right pr-7"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2
                                         text-gray-400 text-sm font-medium pointer-events-none">
                            %
                        </span>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className={`
                            px-4 py-2 rounded-lg text-sm font-semibold
                            transition-colors cursor-pointer disabled:opacity-50
                            ${saved
                                ? "bg-green-100 text-green-700"
                                : "bg-green-600 text-white hover:bg-green-700"
                            }
                        `}
                    >
                        {saving ? "Saving..." : saved ? "✓ Saved" : "Save"}
                    </button>
                </div>
            </div>

            {/* Live example calculation */}
            {parsedRate > 0 && (
                <div className="mt-3 bg-gray-50 rounded-xl p-3 text-xs text-gray-500 space-y-1">
                    <p className="font-medium text-gray-600 mb-1">
                        Example (VAT-inclusive pricing):
                    </p>
                    <div className="flex justify-between">
                        <span>Order total (gross)</span>
                        <span className="font-semibold text-gray-700">
                            {formatCurrency(exampleGross)}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span>VAT component ({parsedRate.toFixed(1)}%)</span>
                        <span className="font-semibold text-gray-700">
                            {formatCurrency(exampleVat)}
                        </span>
                    </div>
                    <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                        <span>Net revenue</span>
                        <span className="font-bold text-green-700">
                            {formatCurrency(exampleNet)}
                        </span>
                    </div>
                </div>
            )}

            {parsedRate === 0 && (
                <div className="mt-3 bg-gray-50 rounded-xl p-3 text-xs text-gray-400">
                    VAT is currently disabled. Revenue stats show full gross amounts.
                </div>
            )}
        </div>
    );
}

// ── Dashboard ─────────────────────────────────────────────────
export default function Dashboard() {
    const { user, org } = useAuth();

    const [branches, setBranches] = useState<Branch[]>([]);
    const [recentOrders, setRecentOrders] = useState<Order[]>([]);
    const [stats, setStats] = useState({
        totalOrders: 0,
        todayOrders: 0,
        todayRevenue: 0,
        todayVat: 0,
        todayNet: 0,
        pendingOrders: 0,
    });

    const [loading, setLoading] = useState(true);
    const [userBranchRole, setUserBranchRole] = useState<string | null>(null);
    const [branchRoleLoaded, setBranchRoleLoaded] = useState(false);

    // ── Resolve branch role first ─────────────────────────────
    // For non-staff roles, skip the branch_staff query entirely
    // and mark as loaded immediately so dashboard doesn't wait.
    useEffect(() => {
        if (!user) return;

        if (user.role !== "staff") {
            setBranchRoleLoaded(true);
            return;
        }

        supabase
            .from("branch_staff")
            .select("role")
            .eq("profile_id", user.id)
            .limit(1)
            .maybeSingle()
            .then(({ data }) => {
                setUserBranchRole(data?.role || null);
                setBranchRoleLoaded(true);
            });
    }, [user?.id]);

    // ── Load dashboard data after role is confirmed ───────────
    useEffect(() => {
        if (branchRoleLoaded) {
            loadDashboardData();
        }
    }, [branchRoleLoaded]);

    // ── Price visibility ──────────────────────────────────────
    const showPrices: boolean =
        user?.role === "super_admin" ||
        user?.role === "manager" ||
        userBranchRole === "branch_manager";

    const vatRate = org?.vat_rate ?? 0;
    const vatEnabled = vatRate > 0;

    // ── Load all dashboard data ───────────────────────────────
    async function loadDashboardData() {
        setLoading(true);

        try {
            let branchData: Branch[] = [];

            // Fetch branches — org-wide for admin/manager, assigned for staff
            if (org?.id) {
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
                const { data, error } = await supabase
                    .from("branch_staff")
                    .select("branches(*)")
                    .eq("profile_id", user.id);

                if (error) {
                    console.warn("Branch staff fetch error:", error.message);
                } else {
                    branchData = (data || [])
                        .map((bs: any) => bs.branches)
                        .filter(Boolean) as Branch[];
                }
            }

            setBranches(branchData);

            if (branchData.length > 0) {
                const branchIds = branchData.map((b) => b.id);

                // Restricted roles never receive price columns from server
                const isRestricted =
                    user?.role === "staff" && userBranchRole !== "branch_manager";

                const orderSelectFields = isRestricted
                    ? "id, branch_id, table_id, session_id, status, order_type, notes, created_at, updated_at"
                    : "*";

                const { data: orderData, error: orderError } = await supabase
                    .from("orders")
                    .select(orderSelectFields)
                    .in("branch_id", branchIds)
                    .order("created_at", { ascending: false })
                    .limit(20);

                if (orderError) {
                    console.warn("Orders fetch error:", orderError.message);
                } else {
                    const orders = (orderData as Order[]) || [];
                    setRecentOrders(orders);

                    const today = new Date().toISOString().split("T")[0];
                    const todayOrders = orders.filter(
                        (o) =>
                            o.created_at.startsWith(today) &&
                            o.status !== "cancelled"
                    );

                    const todayRevenue = todayOrders.reduce(
                        (s, o) => s + (o.total_amount || 0),
                        0
                    );

                    // Back-out VAT from gross revenue (tax-inclusive formula)
                    const todayVat = vatEnabled
                        ? todayRevenue * (vatRate / (1 + vatRate))
                        : 0;

                    const todayNet = todayRevenue - todayVat;

                    setStats({
                        totalOrders: orders.length,
                        todayOrders: todayOrders.length,
                        todayRevenue,
                        todayVat,
                        todayNet,
                        pendingOrders: orders.filter((o) => o.status === "pending").length,
                    });
                }
            }
        } catch (err) {
            if (import.meta.env.DEV) console.error("Dashboard load error:", err);
        } finally {
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
    ];

    const completedSteps = setupSteps.filter((s) => s.completed).length;
    const allDone = completedSteps === setupSteps.length;

    // ── Loading ───────────────────────────────────────────────
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
                    value={showPrices ? formatCurrency(stats.todayRevenue) : "—"}
                    highlight={showPrices}
                    sub={
                        showPrices && vatEnabled
                            ? `Net: ${formatCurrency(stats.todayNet)}`
                            : undefined
                    }
                />
                <StatCard
                    icon="⏳"
                    label="Pending orders"
                    value={stats.pendingOrders}
                    sub="Awaiting kitchen"
                />
            </div>

            {/* ── VAT breakdown row (privileged roles + VAT enabled) ── */}
            {showPrices && vatEnabled && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <StatCard
                        icon="📊"
                        label="Gross revenue today"
                        value={formatCurrency(stats.todayRevenue)}
                    />
                    <StatCard
                        icon="🧾"
                        label={`VAT (${(vatRate * 100).toFixed(1)}% incl.)`}
                        value={formatCurrency(stats.todayVat)}
                        sub="Backed out of gross"
                    />
                    <StatCard
                        icon="✅"
                        label="Net revenue today"
                        value={formatCurrency(stats.todayNet)}
                        highlight
                        sub="After VAT"
                    />
                </div>
            )}

            {/* ── VAT configuration (super_admin only) ──────── */}
            {user?.role === "super_admin" && org && (
                <VatSettingsCard
                    orgId={org.id}
                    currentRate={org.vat_rate ?? 0}
                />
            )}

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
                                        {showPrices && (
                                            <p className="text-sm text-gray-700 font-medium">
                                                {formatCurrency(order.total_amount)}
                                            </p>
                                        )}
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

            {/* ── Analytics shortcut (super_admin + manager) ── */}
            {(user?.role === "super_admin" || user?.role === "manager") && (
                <div className="card bg-gradient-to-r from-green-50 to-emerald-50
                                border-green-100">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h2 className="text-base font-semibold text-gray-900">
                                📊 Analytics
                            </h2>
                            <p className="text-xs text-gray-500 mt-0.5">
                                View revenue trends, top products, and order breakdowns
                            </p>
                        </div>
                        <Link
                            to="/analytics"
                            className="flex-shrink-0 px-4 py-2 bg-green-600 text-white
                                       text-sm font-semibold rounded-lg hover:bg-green-700
                                       transition-colors"
                        >
                            Open →
                        </Link>
                    </div>
                </div>
            )}

        </div>
    );
}