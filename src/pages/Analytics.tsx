// ============================================================
// Analytics.tsx
// Protected page — super_admin, manager, branch_manager only
// Real-time + historical analytics with adjustable date range
// Default: today only
// Charts: Revenue trend, Order type mix, Top products
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { Spinner, EmptyState, Select } from "../components/UI";
import {
    formatCurrency,
    getLocationBadgeDetails,
} from "../utils/helpers";
import type { Branch, RevenueAnalyticsRow, TopProductRow, OrderTypeRow } from "../lib/types";

// ── Helpers ────────────────────────────────────────────────────
function todayISO(): string {
    return new Date().toISOString().split("T")[0];
}

// ── Stat card ──────────────────────────────────────────────────
function StatCard({
    label,
    value,
    icon,
    sub,
    highlight,
}: {
    label: string;
    value: string;
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
                    text-xl font-bold leading-tight break-words
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

// ── Simple bar chart ───────────────────────────────────────────
// Built from scratch — no external library dependency
function BarChart({
    data,
    labelKey,
    valueKey,
    color,
    formatValue,
}: {
    data: Record<string, any>[];
    labelKey: string;
    valueKey: string;
    color: string;
    formatValue?: (v: number) => string;
}) {
    if (data.length === 0) return null;

    const maxValue = Math.max(...data.map((d) => Number(d[valueKey]) || 0));

    return (
        <div className="space-y-2">
            {data.map((item, idx) => {
                const raw = Number(item[valueKey]) || 0;
                const pct = maxValue > 0 ? (raw / maxValue) * 100 : 0;
                const label = String(item[labelKey]);
                const display = formatValue ? formatValue(raw) : String(raw);

                return (
                    <div key={idx} className="flex items-center gap-3">
                        <p className="text-xs text-gray-500 w-20 flex-shrink-0 truncate text-right">
                            {label}
                        </p>
                        <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${color}`}
                                style={{ width: `${Math.max(pct, 2)}%` }}
                            />
                        </div>
                        <p className="text-xs font-semibold text-gray-700 w-20 flex-shrink-0">
                            {display}
                        </p>
                    </div>
                );
            })}
        </div>
    );
}

// ── Revenue line chart ─────────────────────────────────────────
// Simple SVG polyline — no external dependency
function RevenueLineChart({ data }: { data: RevenueAnalyticsRow[] }) {
    if (data.length === 0) return null;

    const WIDTH = 600;
    const HEIGHT = 120;
    const PADDING = 20;

    const maxRevenue = Math.max(...data.map((d) => d.gross_revenue));
    const minRevenue = Math.min(...data.map((d) => d.gross_revenue));
    const range = maxRevenue - minRevenue || 1;

    const points = data.map((d, i) => {
        const x = PADDING + (i / Math.max(data.length - 1, 1)) * (WIDTH - PADDING * 2);
        const y = HEIGHT - PADDING - ((d.gross_revenue - minRevenue) / range) * (HEIGHT - PADDING * 2);
        return { x, y, ...d };
    });

    const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
    const areaPoints = [
        `${points[0].x},${HEIGHT - PADDING}`,
        ...points.map((p) => `${p.x},${p.y}`),
        `${points[points.length - 1].x},${HEIGHT - PADDING}`,
    ].join(" ");

    return (
        <div className="overflow-x-auto">
            <svg
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                className="w-full"
                style={{ minWidth: "300px", height: "120px" }}
            >
                {/* Area fill */}
                <polygon
                    points={areaPoints}
                    fill="#dcfce7"
                    opacity="0.7"
                />
                {/* Line */}
                <polyline
                    points={polylinePoints}
                    fill="none"
                    stroke="#16a34a"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />
                {/* Data points */}
                {points.map((p, i) => (
                    <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r="3"
                        fill="#16a34a"
                        stroke="white"
                        strokeWidth="1.5"
                    />
                ))}
            </svg>

            {/* X-axis labels — show first, middle, last */}
            {data.length > 0 && (
                <div className="flex justify-between mt-1 px-5">
                    <span className="text-[10px] text-gray-400">
                        {data[0].formatted_date}
                    </span>
                    {data.length > 2 && (
                        <span className="text-[10px] text-gray-400">
                            {data[Math.floor(data.length / 2)].formatted_date}
                        </span>
                    )}
                    {data.length > 1 && (
                        <span className="text-[10px] text-gray-400">
                            {data[data.length - 1].formatted_date}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Main Analytics page ────────────────────────────────────────
export default function Analytics() {
    const { user, org } = useAuth();

    // ── Date range — defaults to today only ───────────────────
    const [startDate, setStartDate] = useState<string>(todayISO());
    const [endDate, setEndDate] = useState<string>(todayISO());

    // ── Branch filter ─────────────────────────────────────────
    const [branches, setBranches] = useState<Branch[]>([]);
    const [selectedBranch, setSelectedBranch] = useState<string>("all");
    const [lockedBranchId, setLockedBranchId] = useState<string | null>(null);

    // ── Analytics data ────────────────────────────────────────
    const [revenueData, setRevenueData] = useState<RevenueAnalyticsRow[]>([]);
    const [topProducts, setTopProducts] = useState<TopProductRow[]>([]);
    const [orderTypes, setOrderTypes] = useState<OrderTypeRow[]>([]);

    // ── UI state ──────────────────────────────────────────────
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ── Role check ────────────────────────────────────────────
    // branch_manager sees only their branch — locked
    const isBranchManager =
        user?.role === "staff"; // branch_manager lives under 'staff' org role
    const canSeePrices =
        user?.role === "super_admin" ||
        user?.role === "manager" ||
        isBranchManager;

    // ── Load branches ─────────────────────────────────────────
    useEffect(() => {
        if (!org || !user) return;

        async function loadBranches() {
            if (["super_admin", "manager"].includes(user!.role)) {
                const { data } = await supabase
                    .from("branches")
                    .select("*")
                    .eq("org_id", org!.id)
                    .is("deleted_at", null)
                    .order("name");
                setBranches((data as Branch[]) || []);
            } else {
                // Branch manager — fetch their assigned branch and lock it
                const { data } = await supabase
                    .from("branch_staff")
                    .select("branch_id, branches(id, name, address, org_id, deleted_at, created_at, billing_start_date, billing_end_date)")
                    .eq("profile_id", user!.id)
                    .eq("role", "branch_manager")
                    .limit(1)
                    .maybeSingle();

                if (data?.branch_id) {
                    setLockedBranchId(data.branch_id);
                    setSelectedBranch(data.branch_id);
                    if (data.branches) {
                        setBranches([data.branches as Branch]);
                    }
                }
            }
        }

        loadBranches();
    }, [org?.id, user?.id]);

    // ── Load analytics ────────────────────────────────────────
    const loadAnalytics = useCallback(async () => {
        if (!org?.id) return;

        setLoading(true);
        setError(null);

        // Resolve branch filter
        const branchArg =
            lockedBranchId
                ? lockedBranchId
                : selectedBranch === "all"
                ? undefined
                : selectedBranch;

        try {
            const [revenueRes, productsRes, typesRes] = await Promise.all([
                supabase.rpc("get_revenue_analytics", {
                    p_org_id: org.id,
                    p_branch_id: branchArg ?? null,
                    p_start_date: startDate,
                    p_end_date: endDate,
                }),
                supabase.rpc("get_top_products_analytics", {
                    p_org_id: org.id,
                    p_branch_id: branchArg ?? null,
                    p_start_date: startDate,
                    p_end_date: endDate,
                    p_limit: 5,
                }),
                supabase.rpc("get_order_type_analytics", {
                    p_org_id: org.id,
                    p_branch_id: branchArg ?? null,
                    p_start_date: startDate,
                    p_end_date: endDate,
                }),
            ]);

            if (revenueRes.error) throw revenueRes.error;
            if (productsRes.error) throw productsRes.error;
            if (typesRes.error) throw typesRes.error;

            setRevenueData((revenueRes.data as RevenueAnalyticsRow[]) || []);
            setTopProducts((productsRes.data as TopProductRow[]) || []);
            setOrderTypes((typesRes.data as OrderTypeRow[]) || []);

        } catch (err: any) {
            console.error("Analytics load error:", err);
            setError("Failed to load analytics. Please try again.");
        } finally {
            setLoading(false);
        }
    }, [org?.id, selectedBranch, lockedBranchId, startDate, endDate]);

    useEffect(() => {
        loadAnalytics();
    }, [loadAnalytics]);

    // ── Derived summary totals ────────────────────────────────
    const totalGross = revenueData.reduce((s, r) => s + r.gross_revenue, 0);
    const totalVat = revenueData.reduce((s, r) => s + r.vat_amount, 0);
    const totalNet = revenueData.reduce((s, r) => s + r.net_revenue, 0);
    const totalOrders = revenueData.reduce((s, r) => s + Number(r.order_count), 0);
    const avgOrderValue = totalOrders > 0 ? totalGross / totalOrders : 0;

    const vatRate = org?.vat_rate ?? 0;
    const vatEnabled = vatRate > 0;

    const branchOptions = [
        { value: "all", label: "All Branches" },
        ...branches.map((b) => ({ value: b.id, label: b.name })),
    ];

    // ── Access guard ──────────────────────────────────────────
    if (!canSeePrices) {
        return (
            <div className="page-container flex items-center justify-center min-h-64">
                <EmptyState
                    icon="🔒"
                    title="Access Restricted"
                    description="Analytics are available to managers and branch managers only."
                />
            </div>
        );
    }

    return (
        <div className="page-container space-y-6">

            {/* ── Page header ───────────────────────────────── */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                        📊 Analytics
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Review sales performance and order trends
                    </p>
                </div>

                {/* Refresh */}
                <button
                    onClick={loadAnalytics}
                    disabled={loading}
                    className="text-sm text-green-700 font-medium hover:underline disabled:opacity-50 cursor-pointer"
                >
                    {loading ? "Loading..." : "🔄 Refresh"}
                </button>
            </div>

            {/* ── Filters ───────────────────────────────────── */}
            <div className="card">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                    Filters
                </p>
                <div className="flex flex-wrap gap-3 items-end">

                    {/* Branch filter — locked for branch_manager */}
                    {!lockedBranchId && (
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-500 font-medium">
                                Branch
                            </label>
                            <div className="w-44">
                                <Select
                                    options={branchOptions}
                                    value={selectedBranch}
                                    onChange={(e) => setSelectedBranch(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {lockedBranchId && branches[0] && (
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-500 font-medium">
                                Branch
                            </label>
                            <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-700 font-medium">
                                🏪 {branches[0].name}
                            </div>
                        </div>
                    )}

                    {/* Date range — From */}
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500 font-medium">
                            From
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            max={endDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm
                                       focus:outline-none focus:ring-2 focus:ring-green-500
                                       text-gray-700"
                        />
                    </div>

                    {/* Date range — To */}
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500 font-medium">
                            To
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            min={startDate}
                            max={todayISO()}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm
                                       focus:outline-none focus:ring-2 focus:ring-green-500
                                       text-gray-700"
                        />
                    </div>

                    {/* Quick range shortcuts */}
                    <div className="flex gap-2 flex-wrap">
                        {[
                            { label: "Today", days: 0 },
                            { label: "7 days", days: 7 },
                            { label: "30 days", days: 30 },
                        ].map(({ label, days }) => (
                            <button
                                key={label}
                                type="button"
                                onClick={() => {
                                    const end = todayISO();
                                    const start = days === 0
                                        ? end
                                        : new Date(Date.now() - days * 86400000)
                                            .toISOString()
                                            .split("T")[0];
                                    setStartDate(start);
                                    setEndDate(end);
                                }}
                                className="text-xs px-3 py-2 rounded-lg border border-gray-200
                                           text-gray-600 hover:bg-green-50 hover:border-green-300
                                           hover:text-green-700 transition-colors cursor-pointer"
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Error state ───────────────────────────────── */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            {/* ── Loading ───────────────────────────────────── */}
            {loading ? (
                <div className="flex items-center justify-center min-h-64">
                    <div className="flex flex-col items-center gap-3">
                        <Spinner size="lg" />
                        <p className="text-gray-400 text-sm">Crunching numbers...</p>
                    </div>
                </div>
            ) : (
                <>
                    {/* ── Summary stat cards ────────────────── */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard
                            icon="💰"
                            label="Gross Revenue"
                            value={formatCurrency(totalGross)}
                            sub={`${totalOrders} order${totalOrders !== 1 ? "s" : ""}`}
                            highlight
                        />
                        {vatEnabled ? (
                            <>
                                <StatCard
                                    icon="🧾"
                                    label={`VAT (${(vatRate * 100).toFixed(1)}% incl.)`}
                                    value={formatCurrency(totalVat)}
                                    sub="Backed out of gross"
                                />
                                <StatCard
                                    icon="📈"
                                    label="Net Revenue"
                                    value={formatCurrency(totalNet)}
                                    sub="After VAT"
                                />
                            </>
                        ) : (
                            <>
                                <StatCard
                                    icon="📈"
                                    label="Net Revenue"
                                    value={formatCurrency(totalGross)}
                                    sub="VAT not configured"
                                />
                                <StatCard
                                    icon="🧾"
                                    label="VAT"
                                    value="—"
                                    sub="Set VAT in Dashboard"
                                />
                            </>
                        )}
                        <StatCard
                            icon="🛒"
                            label="Avg Order Value"
                            value={totalOrders > 0 ? formatCurrency(avgOrderValue) : "—"}
                            sub="Per completed order"
                        />
                    </div>

                    {/* ── No data state ──────────────────────── */}
                    {revenueData.length === 0 && topProducts.length === 0 && orderTypes.length === 0 && (
                        <EmptyState
                            icon="📭"
                            title="No data for this period"
                            description="Try adjusting the date range or branch filter to see results."
                        />
                    )}

                    {/* ── Revenue trend chart ────────────────── */}
                    {revenueData.length > 0 && (
                        <div className="card">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h2 className="text-base font-semibold text-gray-900">
                                        📈 Revenue Trend
                                    </h2>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {startDate === endDate
                                            ? `${startDate}`
                                            : `${startDate} → ${endDate}`
                                        }
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-400">Total</p>
                                    <p className="text-sm font-bold text-green-700">
                                        {formatCurrency(totalGross)}
                                    </p>
                                </div>
                            </div>

                            <RevenueLineChart data={revenueData} />

                            {/* Daily breakdown table */}
                            {revenueData.length > 1 && (
                                <div className="mt-4 overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-gray-100">
                                                <th className="text-left py-2 text-gray-400 font-medium">Date</th>
                                                <th className="text-right py-2 text-gray-400 font-medium">Orders</th>
                                                <th className="text-right py-2 text-gray-400 font-medium">Gross</th>
                                                {vatEnabled && (
                                                    <th className="text-right py-2 text-gray-400 font-medium">VAT</th>
                                                )}
                                                <th className="text-right py-2 text-gray-400 font-medium">Net</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {revenueData.map((row, idx) => (
                                                <tr
                                                    key={idx}
                                                    className="border-b border-gray-50 last:border-0"
                                                >
                                                    <td className="py-2 text-gray-600">
                                                        {row.formatted_date}
                                                    </td>
                                                    <td className="py-2 text-right text-gray-700">
                                                        {row.order_count}
                                                    </td>
                                                    <td className="py-2 text-right font-medium text-gray-900">
                                                        {formatCurrency(row.gross_revenue)}
                                                    </td>
                                                    {vatEnabled && (
                                                        <td className="py-2 text-right text-gray-500">
                                                            {formatCurrency(row.vat_amount)}
                                                        </td>
                                                    )}
                                                    <td className="py-2 text-right font-semibold text-green-700">
                                                        {formatCurrency(row.net_revenue)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Bottom two charts ──────────────────── */}
                    <div className="grid lg:grid-cols-2 gap-6">

                        {/* Order type distribution */}
                        <div className="card">
                            <h2 className="text-base font-semibold text-gray-900 mb-1">
                                🍽️ Order Types
                            </h2>
                            <p className="text-xs text-gray-400 mb-4">
                                How customers are ordering
                            </p>

                            {orderTypes.length === 0 ? (
                                <p className="text-sm text-gray-300 text-center py-6">
                                    No order data yet
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {orderTypes.map((row, idx) => {
                                        const badge = getLocationBadgeDetails(
                                            row.resolved_type as any
                                        );
                                        const totalTypeOrders = orderTypes.reduce(
                                            (s, r) => s + Number(r.order_count), 0
                                        );
                                        const pct = totalTypeOrders > 0
                                            ? Math.round((Number(row.order_count) / totalTypeOrders) * 100)
                                            : 0;

                                        return (
                                            <div key={idx}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className={`
                                                        text-xs font-bold px-2 py-0.5 rounded-full
                                                        flex items-center gap-1 w-fit
                                                        ${badge.style}
                                                    `}>
                                                        <span>{badge.icon}</span>
                                                        <span>{badge.label}</span>
                                                    </span>
                                                    <div className="text-right">
                                                        <span className="text-xs font-bold text-gray-700">
                                                            {row.order_count} orders
                                                        </span>
                                                        <span className="text-xs text-gray-400 ml-2">
                                                            ({pct}%)
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-green-500 transition-all duration-500"
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                                <p className="text-xs text-gray-400 text-right mt-0.5">
                                                    {formatCurrency(row.gross_revenue)}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Top selling products */}
                        <div className="card">
                            <h2 className="text-base font-semibold text-gray-900 mb-1">
                                🏆 Top Products
                            </h2>
                            <p className="text-xs text-gray-400 mb-4">
                                Best sellers by quantity
                            </p>

                            {topProducts.length === 0 ? (
                                <p className="text-sm text-gray-300 text-center py-6">
                                    No product data yet
                                </p>
                            ) : (
                                <>
                                    <BarChart
                                        data={topProducts}
                                        labelKey="product_name"
                                        valueKey="quantity_sold"
                                        color="bg-green-500"
                                        formatValue={(v) => `${v} sold`}
                                    />

                                    {/* Revenue breakdown table */}
                                    <div className="mt-4 space-y-2 border-t border-gray-50 pt-3">
                                        {topProducts.map((p, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center justify-between gap-2"
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="w-5 h-5 rounded-full bg-green-100 text-green-700
                                                                     text-[10px] font-black flex items-center
                                                                     justify-center flex-shrink-0">
                                                        {idx + 1}
                                                    </span>
                                                    <p className="text-xs text-gray-700 font-medium truncate">
                                                        {p.product_name}
                                                    </p>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <p className="text-xs font-bold text-gray-900">
                                                        {formatCurrency(p.revenue_generated)}
                                                    </p>
                                                    <p className="text-[10px] text-gray-400">
                                                        {p.quantity_sold} units
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}