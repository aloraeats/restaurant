// ============================================================
// Kitchen.tsx
// Real-time order board for kitchen + waiter staff
// Kitchen: VIEW only (hands are busy cooking!)
// Waiter: can mark orders as served + print waiter slip
// super_admin/manager: can update any status + print receipt
// branch_manager: can update any status + print receipt
// ============================================================

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { Badge, Button, Select, Spinner, EmptyState, toast } from "../components/UI";
import {
    orderStatusColor,
    orderStatusLabel,
    formatCurrency,
    timeAgo,
    formatDateTime,
    parseOrderTypeFromNotes,
    stripMetadataFromNotes,
    getLocationBadgeDetails,
} from "../utils/helpers";
import PrintReceipt from "../components/PrintReceipt";
import type { Order, OrderItem, Product, RestaurantTable, Branch } from "../lib/types";

// ── Types ──────────────────────────────────────────────────────
type OrderWithDetails = Order & {
    order_items: (OrderItem & { products: Product })[];
    restaurant_tables: RestaurantTable | null;
};

// ── Order card ─────────────────────────────────────────────────
function OrderCard({
    order,
    canUpdate,
    isWaiter,
    showPrices,
    onStatusChange,
    updating,
    onPrint,
}: {
    order: OrderWithDetails;
    canUpdate: boolean;
    isWaiter: boolean;
    showPrices: boolean;
    onStatusChange: (id: string, status: string) => void;
    updating: string | null;
    onPrint: (order: OrderWithDetails) => void;
}) {
    const isUpdating = updating === order.id;
    const minutesOld = Math.floor(
        (Date.now() - new Date(order.created_at).getTime()) / 60000
    );
    const isUrgent = minutesOld >= 30 && order.status === "pending";

    // Parse location type from note metadata tags
    const resolvedLocation = parseOrderTypeFromNotes(
        order.notes,
        order.order_type as "dine_in" | "kiosk"
    );
    const locationBadge = getLocationBadgeDetails(resolvedLocation);

    // Strip all metadata tags from notes before displaying
    const displayNotes = stripMetadataFromNotes(order.notes);

    // Resolve table display or kiosk pickup code
    const stationLabel = (() => {
        if (order.restaurant_tables?.table_name) {
            return order.restaurant_tables.table_name;
        }
        const kioskMatch = order.notes?.match(/\[KIOSK:([A-Z]{2}\d{1,2})\]/);
        if (kioskMatch) {
            return `🎫 ${kioskMatch[1]}`;
        }
        return "Unknown Station";
    })();

    return (
        <div className={`
            card flex flex-col gap-3 relative overflow-hidden
            ${order.status === "served" ? "opacity-60" : ""}
            ${order.status === "cancelled" ? "opacity-40" : ""}
            ${isUrgent ? "border-red-300 border-2" : ""}
        `}>
            {/* Urgent bar */}
            {isUrgent && (
                <div className="absolute top-0 left-0 right-0 bg-red-500 text-white
                        text-xs text-center py-1 font-medium z-10">
                    ⚠️ Waiting {minutesOld} minutes!
                </div>
            )}

            {/* Header */}
            <div className={`flex items-start justify-between gap-2 ${isUrgent ? "mt-5" : ""}`}>
                <div className="min-w-0 flex-1">
                    {/* Station label + status + location badges */}
                    <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-bold text-gray-900 text-sm">
                            {stationLabel}
                        </p>
                        <Badge className={orderStatusColor(order.status)}>
                            {orderStatusLabel(order.status)}
                        </Badge>
                        <span className={`
                            text-[10px] font-bold px-2 py-0.5 rounded-full
                            flex items-center gap-1 flex-shrink-0
                            ${locationBadge.style}
                        `}>
                            <span>{locationBadge.icon}</span>
                            <span>{locationBadge.label}</span>
                        </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                        {timeAgo(order.created_at)} • {formatDateTime(order.created_at)}
                    </p>
                </div>

                {/* Total — shown only to privileged roles */}
                {showPrices && (
                    <p className="font-bold text-green-700 text-sm flex-shrink-0">
                        {formatCurrency(order.total_amount)}
                    </p>
                )}
            </div>

            {/* Order items */}
            <div className="space-y-1.5 bg-gray-50 rounded-xl p-3">
                {order.order_items.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                            <span className="text-sm text-gray-900 font-medium break-words whitespace-normal">
                                ×{item.quantity} {item.products?.name}
                            </span>
                            {item.notes && (
                                <p className="text-xs text-amber-600 mt-0.5 break-words whitespace-normal">
                                    📝 {item.notes}
                                </p>
                            )}
                        </div>
                        {/* Per-item price — hidden from kitchen and waiter */}
                        {showPrices && (
                            <span className="text-sm text-gray-500 flex-shrink-0">
                                {formatCurrency(item.unit_price * item.quantity)}
                            </span>
                        )}
                    </div>
                ))}
            </div>

            {/* Sanitised order notes — metadata tags stripped */}
            {displayNotes ? (
                <div className="bg-amber-50 rounded-xl px-3 py-2">
                    <p className="text-xs text-amber-700 break-words whitespace-normal">
                        <span className="font-medium">Order note:</span> {displayNotes}
                    </p>
                </div>
            ) : null}

            {/* Actions row */}
            <div className="flex flex-col gap-2 mt-auto pt-2 border-t border-gray-50">

                {/* Print button — visible when preparing or served, for all roles */}
                {(order.status === "preparing" || order.status === "served") && (
                    <button
                        type="button"
                        onClick={() => onPrint(order)}
                        className="flex items-center justify-center gap-2 w-full py-2
                                   bg-gray-100 hover:bg-gray-200 text-gray-700
                                   rounded-lg text-xs font-semibold transition-colors
                                   cursor-pointer"
                    >
                        🖨️ Print Ticket
                    </button>
                )}

                {/* Status action buttons */}
                {canUpdate && order.status !== "cancelled" && order.status !== "served" && (
                    <div className="flex gap-2">
                        {/* Waiter: only mark served when preparing */}
                        {isWaiter && order.status === "preparing" && (
                            <Button
                                fullWidth
                                size="sm"
                                onClick={() => onStatusChange(order.id, "served")}
                                loading={isUpdating}
                            >
                                ✅ Mark Served
                            </Button>
                        )}

                        {/* Admin / manager / branch_manager: full control */}
                        {!isWaiter && (
                            <>
                                {order.status === "pending" && (
                                    <Button
                                        fullWidth
                                        size="sm"
                                        onClick={() => onStatusChange(order.id, "preparing")}
                                        loading={isUpdating}
                                    >
                                        🍳 Start Preparing
                                    </Button>
                                )}
                                {order.status === "preparing" && (
                                    <Button
                                        fullWidth
                                        size="sm"
                                        onClick={() => onStatusChange(order.id, "served")}
                                        loading={isUpdating}
                                    >
                                        ✅ Mark Served
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={() => onStatusChange(order.id, "cancelled")}
                                    loading={isUpdating}
                                    disabled={isUpdating}
                                >
                                    Cancel
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main Kitchen component ─────────────────────────────────────
export default function Kitchen() {
    const { user, org } = useAuth();

    const [orders, setOrders] = useState<OrderWithDetails[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [selectedBranch, setSelectedBranch] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<string>("active");
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    const [userBranchRole, setUserBranchRole] = useState<string | null>(null);

    // Print state — holds the order currently being printed
    const [activePrintOrder, setActivePrintOrder] = useState<OrderWithDetails | null>(null);

    const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    // ── Derived role flags ─────────────────────────────────────
    const showPrices: boolean =
        user?.role === "super_admin" ||
        user?.role === "manager" ||
        userBranchRole === "branch_manager";

    const effectiveCanUpdate =
        ["super_admin", "manager"].includes(user?.role || "") ||
        userBranchRole === "waiter" ||
        userBranchRole === "branch_manager";

    const effectiveIsWaiter = userBranchRole === "waiter";

    // ── Effects ────────────────────────────────────────────────
    useEffect(() => {
        if (org) {
            loadBranches();
            checkUserBranchRole();
        }
    }, [org]);

    useEffect(() => {
        if (!org || !user) return;
        loadOrders();
        setupRealtime();
        return () => {
            realtimeRef.current?.unsubscribe();
        };
    }, [selectedBranch, statusFilter, branches, userBranchRole]);

    // ── Data loaders ───────────────────────────────────────────
    async function loadBranches() {
        if (!org) return;
        const { data } = await supabase
            .from("branches")
            .select("*")
            .eq("org_id", org.id)
            .is("deleted_at", null)
            .order("name");
        setBranches((data as Branch[]) || []);
    }

    async function checkUserBranchRole() {
        if (!user) return;
        const { data } = await supabase
            .from("branch_staff")
            .select("role")
            .eq("profile_id", user.id)
            .limit(1)
            .maybeSingle();
        setUserBranchRole(data?.role || null);
    }

    async function loadOrders() {
        setLoading(true);

        // Determine which branch IDs to query
        let branchIds: string[] = [];

        if (selectedBranch === "all") {
            if (["super_admin", "manager"].includes(user?.role || "")) {
                branchIds = branches.map((b) => b.id);
            } else {
                const { data: assigned } = await supabase
                    .from("branch_staff")
                    .select("branch_id")
                    .eq("profile_id", user!.id);
                branchIds = (assigned || []).map((a) => a.branch_id);
            }
        } else {
            branchIds = [selectedBranch];
        }

        if (branchIds.length === 0) {
            setOrders([]);
            setLoading(false);
            return;
        }

        // Restricted roles never receive price columns from the server.
        // Defaults to restricted when userBranchRole is still null —
        // prices are never accidentally exposed during loading.
        const isRestricted =
            user?.role === "staff" && userBranchRole !== "branch_manager";

        const selectFields = isRestricted
            ? `
                id,
                branch_id,
                table_id,
                session_id,
                status,
                order_type,
                notes,
                created_at,
                updated_at,
                restaurant_tables(id, table_name, qr_identifier),
                order_items(
                    id, order_id, product_id, quantity, notes, created_at,
                    products(id, name, base_price)
                )
              `
            : `
                *,
                restaurant_tables(id, table_name, qr_identifier),
                order_items(*, products(id, name, base_price))
              `;

        let query = supabase
            .from("orders")
            .select(selectFields)
            .in("branch_id", branchIds)
            .order("created_at", { ascending: true });

        if (statusFilter === "active") {
            query = query.in("status", ["pending", "preparing"]);
        } else if (statusFilter !== "all") {
            query = query.eq("status", statusFilter);
        }

        query = query.limit(100);

        const { data, error } = await query;

        if (error) {
            toast.error("Failed to load orders");
        } else {
            setOrders((data as OrderWithDetails[]) || []);
        }

        setLoading(false);
    }

    // ── Realtime subscription ──────────────────────────────────
    function setupRealtime() {
        realtimeRef.current?.unsubscribe();

        realtimeRef.current = supabase
            .channel("kitchen-orders")
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "orders",
                },
                (payload) => {
                    if (payload.eventType === "INSERT") {
                        loadOrders();
                        const newOrder = payload.new as Order;
                        if (newOrder.status === "pending") {
                            toast.info("🛎️ New order received!");
                        }
                    } else if (payload.eventType === "UPDATE") {
                        const updated = payload.new as Order;
                        setOrders((prev) =>
                            prev.map((o) =>
                                o.id === updated.id ? { ...o, ...updated } : o
                            )
                        );
                    }
                }
            )
            .subscribe();
    }

    // ── Update order status ────────────────────────────────────
    async function handleStatusChange(orderId: string, newStatus: string) {
        setUpdating(orderId);

        const { error } = await supabase
            .from("orders")
            .update({ status: newStatus })
            .eq("id", orderId);

        if (error) {
            toast.error("Failed to update order status");
        } else {
            setOrders((prev) =>
                prev.map((o) =>
                    o.id === orderId
                        ? { ...o, status: newStatus as Order["status"] }
                        : o
                )
            );
            const messages: Record<string, string> = {
                preparing: "Order is being prepared 🍳",
                served: "Order marked as served ✅",
                cancelled: "Order cancelled",
            };
            toast.success(messages[newStatus] || "Status updated");
        }

        setUpdating(null);
    }

    // ── Print handler ──────────────────────────────────────────
    // Injects the PrintReceipt layout into a hidden div, fires
    // window.print(), then clears it after the browser dialog closes.
    function handlePrint(order: OrderWithDetails) {
        setActivePrintOrder(order);
        setTimeout(() => {
            window.print();
            setActivePrintOrder(null);
        }, 150);
    }

    // ── Group orders into kanban columns ───────────────────────
    const pendingOrders = orders.filter((o) => o.status === "pending");
    const preparingOrders = orders.filter((o) => o.status === "preparing");
    const servedOrders = orders.filter((o) => o.status === "served");
    const cancelledOrders = orders.filter((o) => o.status === "cancelled");

    const branchOptions = [
        { value: "all", label: "All Branches" },
        ...branches.map((b) => ({ value: b.id, label: b.name })),
    ];

    const statusOptions = [
        { value: "active", label: "Active Orders (Pending + Preparing)" },
        { value: "all", label: "All Orders" },
        { value: "pending", label: "Pending Only" },
        { value: "preparing", label: "Preparing Only" },
        { value: "served", label: "Served" },
        { value: "cancelled", label: "Cancelled" },
    ];

    // ── Render ─────────────────────────────────────────────────
    return (
        <div className="page-container">

            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                        👨‍🍳 Kitchen Board
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">
                        {orders.length} order{orders.length !== 1 ? "s" : ""}
                        {" "}
                        <span className="text-green-600 font-medium">
                            • Live {realtimeRef.current ? "✅" : "⏳"}
                        </span>
                    </p>
                </div>

                {/* Filters */}
                <div className="flex gap-3 flex-wrap">
                    {["super_admin", "manager"].includes(user?.role || "") && (
                        <div className="w-44">
                            <Select
                                options={branchOptions}
                                value={selectedBranch}
                                onChange={(e) => setSelectedBranch(e.target.value)}
                            />
                        </div>
                    )}
                    <div className="w-64">
                        <Select
                            options={statusOptions}
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        />
                    </div>
                    <Button variant="secondary" onClick={loadOrders} size="sm">
                        🔄 Refresh
                    </Button>
                </div>
            </div>

            {/* Board */}
            {loading ? (
                <div className="flex items-center justify-center min-h-64">
                    <Spinner size="lg" />
                </div>
            ) : orders.length === 0 ? (
                <EmptyState
                    icon="✅"
                    title="No orders right now"
                    description="Orders will appear here in real-time when customers place them"
                />
            ) : (
                <div className="grid lg:grid-cols-3 gap-6">

                    {/* Pending column */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-3 h-3 rounded-full bg-yellow-400" />
                            <h2 className="font-semibold text-gray-700 text-sm">
                                Pending ({pendingOrders.length})
                            </h2>
                        </div>
                        <div className="space-y-4">
                            {pendingOrders.length === 0 ? (
                                <p className="text-center text-gray-300 py-8 text-sm">
                                    No pending orders
                                </p>
                            ) : (
                                pendingOrders.map((order) => (
                                    <OrderCard
                                        key={order.id}
                                        order={order}
                                        canUpdate={effectiveCanUpdate}
                                        isWaiter={effectiveIsWaiter}
                                        showPrices={showPrices}
                                        onStatusChange={handleStatusChange}
                                        updating={updating}
                                        onPrint={handlePrint}
                                    />
                                ))
                            )}
                        </div>
                    </div>

                    {/* Preparing column */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-3 h-3 rounded-full bg-blue-400" />
                            <h2 className="font-semibold text-gray-700 text-sm">
                                Preparing ({preparingOrders.length})
                            </h2>
                        </div>
                        <div className="space-y-4">
                            {preparingOrders.length === 0 ? (
                                <p className="text-center text-gray-300 py-8 text-sm">
                                    Nothing in preparation
                                </p>
                            ) : (
                                preparingOrders.map((order) => (
                                    <OrderCard
                                        key={order.id}
                                        order={order}
                                        canUpdate={effectiveCanUpdate}
                                        isWaiter={effectiveIsWaiter}
                                        showPrices={showPrices}
                                        onStatusChange={handleStatusChange}
                                        updating={updating}
                                        onPrint={handlePrint}
                                    />
                                ))
                            )}
                        </div>
                    </div>

                    {/* Served + Cancelled column */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-3 h-3 rounded-full bg-green-400" />
                            <h2 className="font-semibold text-gray-700 text-sm">
                                Served ({servedOrders.length})
                            </h2>
                        </div>
                        <div className="space-y-4">
                            {servedOrders.length === 0 && cancelledOrders.length === 0 ? (
                                <p className="text-center text-gray-300 py-8 text-sm">
                                    None yet
                                </p>
                            ) : (
                                <>
                                    {servedOrders.map((order) => (
                                        <OrderCard
                                            key={order.id}
                                            order={order}
                                            canUpdate={false}
                                            isWaiter={effectiveIsWaiter}
                                            showPrices={showPrices}
                                            onStatusChange={handleStatusChange}
                                            updating={updating}
                                            onPrint={handlePrint}
                                        />
                                    ))}
                                    {cancelledOrders.map((order) => (
                                        <OrderCard
                                            key={order.id}
                                            order={order}
                                            canUpdate={false}
                                            isWaiter={effectiveIsWaiter}
                                            showPrices={showPrices}
                                            onStatusChange={handleStatusChange}
                                            updating={updating}
                                            onPrint={handlePrint}
                                        />
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Hidden thermal print workspace */}
            {/* Rendered off-screen, becomes the only visible element during window.print() */}
            {activePrintOrder && (
                <div className="hidden print:block">
                    <PrintReceipt
                        order={activePrintOrder}
                        orgVatRate={org?.vat_rate ?? 0}
                        userBranchRole={userBranchRole}
                    />
                </div>
            )}

        </div>
    );
}