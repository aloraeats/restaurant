// ============================================================
// Dashboard.tsx
// v1: billing/subscription UI removed.
// Added: VAT configuration card for super_admin
// ============================================================

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase, callFunction } from "../lib/supabase";
import { Spinner, Badge, EmptyState, Button, Input, Modal, toast } from "../components/UI";
import {
    formatCurrency,
    formatDateTime,
    orderStatusColor,
    orderStatusLabel,
    timeAgo,
} from "../utils/helpers";
import PrintReceipt from "../components/PrintReceipt";
import A4Invoice from "../components/A4Invoice";
import type { Branch, Order, OrderItem, Product, RestaurantTable, SetupStep, Profile, CreateStaffResponse } from "../lib/types";

// ── Types ──────────────────────────────────────────────────────
type OrderWithDetails = Order & {
    order_items: (OrderItem & { products: Product })[];
    restaurant_tables: RestaurantTable | null;
};

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
    onSaved,
}: {
    orgId: string;
    currentRate: number;
    onSaved: (rate: number) => void;
}) {
    // Display as percentage (e.g. 0.185 → "18.5")
    const [rate, setRate] = useState<string>(
        currentRate > 0 ? (currentRate * 100).toFixed(1) : "0"
    );
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Sync local input when currentRate changes (e.g. after org refresh)
    useEffect(() => {
        setRate(currentRate > 0 ? (currentRate * 100).toFixed(1) : "0");
    }, [currentRate]);

    async function handleSave() {
            const parsed = parseFloat(rate);

            if (isNaN(parsed) || parsed < 0 || parsed > 100) {
                toast.error("VAT rate must be between 0% and 100%");
                return;
            }

            setSaving(true);

            const savedRate = parsed / 100;

            // Try the RPC (SECURITY DEFINER, bypasses RLS) first.
            // If the function doesn't exist yet on the DB, fall back to direct update.
            const { error: rpcError } = await supabase.rpc(
                "update_org_vat_rate",
                { p_org_id: orgId, p_vat_rate: savedRate }
            );

            if (rpcError) {
                // RPC not found — fall back to direct table update
                if (
                    rpcError.message?.includes("Could not find the function") ||
                    rpcError.message?.includes("function") ||
                    rpcError.code === "PGRST202"
                ) {
                    const { error: updateError } = await supabase
                        .from("organizations")
                        .update({ vat_rate: savedRate })
                        .eq("id", orgId);

                    if (updateError) {
                        console.error("VAT save error:", updateError);
                        toast.error(
                            `Failed to save VAT rate: ${updateError.message}`
                        );
                        setSaving(false);
                        return;
                    }
                } else {
                    console.error("VAT RPC error:", rpcError);
                    toast.error(
                        `Failed to save VAT rate: ${rpcError.message || JSON.stringify(rpcError)}`
                    );
                    setSaving(false);
                    return;
                }
            }

            // Always verify the save by re-fetching
            const { data: refreshedOrg } = await supabase
                .from("organizations")
                .select("vat_rate")
                .eq("id", orgId)
                .single();

            const dbConfirmedRate = refreshedOrg?.vat_rate ?? 0;

            if (Math.abs(dbConfirmedRate - savedRate) > 0.0001) {
                // The DB value doesn't match what we tried to save.
                // Most likely RLS silently rejected the direct update.
                console.error(
                    "VAT save mismatch — DB has",
                    dbConfirmedRate,
                    "but we tried to save",
                    savedRate
                );
                toast.error(
                    "VAT rate could not be saved. The database may have restrictive security policies. " +
                    "Please run the SQL fix in supabase/migrations/fix_vat_update.sql"
                );
                setSaving(false);
                return;
            }

            console.log("VAT saved:", savedRate, "DB confirmed:", dbConfirmedRate);

            setSaved(true);
            toast.success("VAT rate updated successfully");
            onSaved(savedRate);
            setTimeout(() => setSaved(false), 3000);

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

// ── ManagersCard ─────────────────────────────────────────────
function ManagersCard({ orgId }: { orgId: string }) {
    const [managers, setManagers] = useState<Profile[]>([]);
    const [loadingManagers, setLoadingManagers] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState({ full_name: "", email: "", password: "" });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [creating, setCreating] = useState(false);

    async function loadManagers() {
        setLoadingManagers(true);
        const { data, error } = await supabase
            .from("profiles")
            .select("id, email, full_name, created_at")
            .eq("org_id", orgId)
            .eq("role", "manager")
            .order("created_at");

        if (error) console.warn("Managers fetch error:", error.message);
        setManagers((data as Profile[]) || []);
        setLoadingManagers(false);
    }

    useEffect(() => { loadManagers(); }, [orgId]);

    async function handleCreate() {
        const full_name = form.full_name.trim();
        const email = form.email.trim();
        const password = form.password;

        const errs: Record<string, string> = {};
        if (!full_name) errs.full_name = "Full name is required";
        if (!email) errs.email = "Email is required";
        if (!password || password.length < 6) errs.password = "Min 6 characters";
        if (Object.keys(errs).length) { setErrors(errs); return; }

        setErrors({});
        setCreating(true);

        try {
            // role: "manager" + no branch_id → org-level general manager.
            // Backend already supports this path (create-staff edge function).
            const { data, error } = await callFunction<CreateStaffResponse>(
                "create-staff",
                { email, password, full_name, role: "manager" }
            );

            if (error) { toast.error(error); return; }
            if (!data) { toast.error("Something went wrong — please try again"); return; }

            toast.success(`${full_name} added as General Manager! 🎉`);
            setModalOpen(false);
            setForm({ full_name: "", email: "", password: "" });
            await loadManagers();
        } catch (err) {
            console.error("handleCreateManager:", err);
            toast.error("An unexpected error occurred");
        } finally {
            setCreating(false);
        }
    }

    return (
        <div className="card">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                    <h2 className="text-base font-semibold text-gray-900">
                        👥 General Managers
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5 max-w-sm">
                        Org-level managers who can run your whole organization.
                    </p>
                </div>
                <Button size="sm" onClick={() => setModalOpen(true)}>
                    + Add Manager
                </Button>
            </div>

            <div className="mt-3">
                {loadingManagers ? (
                    <Spinner size="sm" />
                ) : managers.length === 0 ? (
                    <p className="text-sm text-gray-400 py-2">No managers yet.</p>
                ) : (
                    <div className="space-y-2">
                        {managers.map((m) => (
                            <div key={m.id}
                                className="flex items-center gap-3 py-2 border-b
                                           border-gray-50 last:border-0">
                                <div className="w-8 h-8 rounded-full bg-purple-100 flex
                                               items-center justify-center text-purple-700
                                               text-sm font-bold flex-shrink-0">
                                    {m.full_name?.charAt(0).toUpperCase() || "?"}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                        {m.full_name || "Unknown"}
                                    </p>
                                    <p className="text-xs text-gray-400 truncate">{m.email}</p>
                                </div>
                                <Badge className="bg-purple-100 text-purple-700 ml-auto">
                                    Manager
                                </Badge>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Add Manager Modal ─────────────────────────── */}
            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title="Add General Manager"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreate} loading={creating}>
                            Create Manager
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <Input
                        label="Full Name"
                        placeholder="Kwame Darko"
                        value={form.full_name}
                        onChange={(e) =>
                            setForm((p) => ({ ...p, full_name: e.target.value }))
                        }
                        error={errors.full_name}
                        required
                        autoFocus
                    />
                    <Input
                        label="Email"
                        type="email"
                        placeholder="manager@restaurant.com"
                        value={form.email}
                        onChange={(e) =>
                            setForm((p) => ({ ...p, email: e.target.value }))
                        }
                        error={errors.email}
                        required
                    />
                    <Input
                        label="Temporary Password"
                        type="password"
                        placeholder="Min 6 characters"
                        value={form.password}
                        onChange={(e) =>
                            setForm((p) => ({ ...p, password: e.target.value }))
                        }
                        error={errors.password}
                        hint="They can change this after first login"
                        required
                    />
                </div>
            </Modal>
        </div>
    );
}

// ── Dashboard ─────────────────────────────────────────────────
export default function Dashboard() {
    const { user, org, refreshOrg } = useAuth();

    const [branches, setBranches] = useState<Branch[]>([]);
    const [recentOrders, setRecentOrders] = useState<Order[]>([]);
    const [stats, setStats] = useState({
        totalOrders: 0,
        todayOrders: 0,
        todayRevenue: 0,
        todayVat: 0,
        todayNet: 0,
        preparingOrders: 0,
    });

    const [loading, setLoading] = useState(true);
        const [userBranchRole, setUserBranchRole] = useState<string | null>(null);
        const [branchRoleLoaded, setBranchRoleLoaded] = useState(false);

        // Print state — holds the full order details being reprinted
        const [activePrintOrder, setActivePrintOrder] = useState<OrderWithDetails | null>(null);
        const [printFormat, setPrintFormat] = useState<"thermal" | "a4">("thermal");
        const [printing, setPrinting] = useState(false);

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
                    userBranchRole === "branch_manager" ||
                    userBranchRole === "cashier";

        // Local VAT rate — starts from org, updated immediately on save
                const [vatRate, setVatRate] = useState<number>(org?.vat_rate ?? 0);
                const vatEnabled = vatRate > 0;

                // Sync vatRate when org.vat_rate changes (e.g. after refreshOrg)
                useEffect(() => {
                    setVatRate(org?.vat_rate ?? 0);
                }, [org?.vat_rate]);

    // ── Load all dashboard data ───────────────────────────────
        async function loadDashboardData(overrideVatRate?: number) {
            setLoading(true);

            // Use the override if provided (e.g. right after saving), otherwise use current state
            const effectiveVatRate = overrideVatRate ?? vatRate;
            const effectiveVatEnabled = effectiveVatRate > 0;

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
                                    user?.role === "staff" &&
                                    userBranchRole !== "branch_manager" &&
                                    userBranchRole !== "cashier";

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
                                        const todayVat = effectiveVatEnabled
                                            ? todayRevenue * (effectiveVatRate / (1 + effectiveVatRate))
                                            : 0;

                    const todayNet = todayRevenue - todayVat;

                    setStats({
                        totalOrders: orders.length,
                        todayOrders: todayOrders.length,
                        todayRevenue,
                        todayVat,
                        todayNet,
                        preparingOrders: orders.filter((o) => o.status === "preparing").length,
                    });
                }
            }
        } catch (err) {
            if (import.meta.env.DEV) console.error("Dashboard load error:", err);
        } finally {
            setLoading(false);
        }
    }

    // ── Print / Reprint handler ───────────────────────────────
    // Fetches full order details (items + products + table) and
    // triggers the browser print dialog for the selected receipt.
    async function handlePrint(orderId: string) {
        setPrinting(true);

        try {
            // Fetch order with items, products, and table info
            const { data, error } = await supabase
                .from("orders")
                .select(`
                    *,
                    restaurant_tables(id, table_name, qr_identifier),
                    order_items(*, products(id, name, base_price))
                `)
                .eq("id", orderId)
                .single();

            if (error || !data) {
                toast.error("Failed to load order details for printing");
                setPrinting(false);
                return;
            }

            setActivePrintOrder(data as OrderWithDetails);

            setTimeout(() => {
                window.print();
                setActivePrintOrder(null);
                setPrinting(false);
            }, 150);
        } catch (err) {
            if (import.meta.env.DEV) console.error("Print error:", err);
            toast.error("Failed to print order");
            setPrinting(false);
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
                                    icon="🍳"
                                    label="Preparing orders"
                                    value={stats.preparingOrders}
                                    sub="In the kitchen"
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
                                onSaved={(rate) => {
                                                                    setVatRate(rate);
                                                                    // Pass the new rate so stats use it immediately
                                                                    // (avoids the stale-closure issue with setVatRate)
                                                                    loadDashboardData(rate);
                                                                    // Refresh org in auth context so other pages
                                                                    // (Kitchen, Analytics, print) see the new rate
                                                                    refreshOrg();
                                                                }}
                            />
                        )}
            
                        {/* ── Managers (super_admin only) ────────────────────── */}
                        {user?.role === "super_admin" && org && (
                            <ManagersCard orgId={org.id} />
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
                        {recentOrders.slice(0, 20).map((order) => (
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
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => handlePrint(order.id)}
                                                                disabled={printing}
                                                                className="flex items-center gap-1 px-2.5 py-1.5
                                                                           bg-gray-100 hover:bg-gray-200 text-gray-600
                                                                           rounded-lg text-xs font-medium transition-colors
                                                                           cursor-pointer disabled:opacity-50"
                                                            >
                                                                🖨️ Reprint
                                                            </button>
                                                            <p className="text-xs text-gray-400 hidden sm:block">
                                                                {formatDateTime(order.created_at)}
                                                            </p>
                                                        </div>
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

                        {/* ── Print format toggle ─────────────────────────────── */}
                        <div className="flex items-center justify-end gap-1 bg-gray-100 rounded-lg p-0.5 w-fit ml-auto">
                            <button
                                type="button"
                                onClick={() => setPrintFormat("thermal")}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                                    printFormat === "thermal"
                                        ? "bg-white text-gray-900 shadow-sm"
                                        : "text-gray-500 hover:text-gray-700"
                                }`}
                            >
                                🧾 80mm
                            </button>
                            <button
                                type="button"
                                onClick={() => setPrintFormat("a4")}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                                    printFormat === "a4"
                                        ? "bg-white text-gray-900 shadow-sm"
                                        : "text-gray-500 hover:text-gray-700"
                                }`}
                            >
                                📄 A4
                            </button>
                        </div>

                        {/* ── Hidden print workspace ──────────────────────────── */}
                        {activePrintOrder && (
                                                    <div className="hidden print:block">
                                                        {printFormat === "thermal" ? (
                                                            <PrintReceipt
                                                                order={activePrintOrder}
                                                                orgVatRate={vatRate}
                                                                userBranchRole={userBranchRole}
                                                            />
                                                        ) : (
                                                            <A4Invoice
                                                                order={activePrintOrder}
                                                                orgVatRate={vatRate}
                                                            />
                                                        )}
                                                    </div>
                                                )}

                    </div>
                );
            }