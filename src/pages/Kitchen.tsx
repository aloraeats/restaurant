// ============================================================
// Kitchen.tsx
// Real-time order board for kitchen + waiter staff
// Kitchen: VIEW only (hands are busy cooking!)
// Waiter: can mark orders as served
// super_admin/manager: can update any status
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
} from "../utils/helpers";
import type { Order, OrderItem, Product, RestaurantTable, Branch } from "../lib/types";

type OrderWithDetails = Order & {
    order_items: (OrderItem & { products: Product })[];
    restaurant_tables: RestaurantTable;
};

// ── Order card ─────────────────────────────────────────────────
function OrderCard({
    order,
    canUpdate,
    isWaiter,
    onStatusChange,
    updating,
}: {
    order: OrderWithDetails;
    canUpdate: boolean;
    isWaiter: boolean;
    onStatusChange: (id: string, status: string) => void;
    updating: string | null;
}) {
    const isUpdating = updating === order.id;
    const minutesOld = Math.floor(
        (Date.now() - new Date(order.created_at).getTime()) / 60000
    );
    const isUrgent = minutesOld >= 30 && order.status === "pending";

    return (
        <div className={`
      card flex flex-col gap-3 relative overflow-hidden
      ${order.status === "served" ? "opacity-60" : ""}
      ${order.status === "cancelled" ? "opacity-40" : ""}
      ${isUrgent ? "border-red-300 border-2" : ""}
    `}>
            {/* Urgent indicator */}
            {isUrgent && (
                <div className="absolute top-0 left-0 right-0 bg-red-500 text-white
                        text-xs text-center py-1 font-medium">
                    ⚠️ Waiting {minutesOld} minutes!
                </div>
            )}

            {/* Header */}
            <div className={`flex items-start justify-between ${isUrgent ? "mt-5" : ""}`}>
                <div>
                    <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-900 text-sm">
                            {order.restaurant_tables?.table_name || "Unknown Table"}
                        </p>
                        <Badge className={orderStatusColor(order.status)}>
                            {orderStatusLabel(order.status)}
                        </Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {timeAgo(order.created_at)} • {formatDateTime(order.created_at)}
                    </p>
                </div>
                <p className="font-bold text-green-700">
                    {formatCurrency(order.total_amount)}
                </p>
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
                        <span className="text-sm text-gray-500 flex-shrink-0">
                            {formatCurrency(item.unit_price * item.quantity)}
                        </span>
                    </div>
                ))}
            </div>

            {/* Order notes */}
            {order.notes && (
                <div className="bg-amber-50 rounded-xl px-3 py-2">
                    <p className="text-xs text-amber-700 break-words whitespace-normal">
                        <span className="font-medium">Order note:</span> {order.notes}
                    </p>
                </div>
            )}

            {/* Status actions */}
            {canUpdate && order.status !== "cancelled" && order.status !== "served" && (
                <div className="flex gap-2 mt-auto pt-2 border-t border-gray-50">
                    {/* Waiter: only served */}
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

                    {/* Admin/manager: full control */}
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
    );
}

// ── Main component ─────────────────────────────────────────────
export default function Kitchen() {
    const { user, org } = useAuth();

    const [orders, setOrders] = useState<OrderWithDetails[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [selectedBranch, setSelectedBranch] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<string>("active");
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    const realtimeRef = useRef<ReturnType<
        typeof supabase.channel
    > | null>(null);

    const isKitchen = user?.role === "staff"; // kitchen can't update
    const isWaiter = false; // determined by branch_staff.role below
    const canUpdate = ["super_admin", "manager"].includes(user?.role || "");

    // Actually check if user is waiter by checking branch_staff
    const [userBranchRole, setUserBranchRole] = useState<string | null>(null);

    useEffect(() => {
        if (org) {
            loadBranches();
            checkUserBranchRole();
        }
    }, [org]);

    useEffect(() => {
        if (!org || !user) return; // ← guard added
        loadOrders();
        setupRealtime();
        return () => {
            realtimeRef.current?.unsubscribe();
        };
    }, [selectedBranch, statusFilter, branches]);

    async function loadBranches() {
        const { data } = await supabase
            .from("branches")
            .select("*")
            .eq("org_id", org!.id)
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

        // Figure out which branch IDs to filter by
        let branchIds: string[] = [];

        if (selectedBranch === "all") {
            // Admin/manager sees all branches in org
            // Staff see only their assigned branches
            if (["super_admin", "manager"].includes(user?.role || "")) {
                branchIds = branches.map((b) => b.id);
            } else {
                // Get user's assigned branches
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

        let query = supabase
            .from("orders")
            .select(`
        *,
        restaurant_tables(id, table_name, qr_identifier),
        order_items(*, products(id, name, base_price))
      `)
            .in("branch_id", branchIds)
            .order("created_at", { ascending: false });

        // Status filter
        if (statusFilter === "active") {
            query = query.in("status", ["pending", "preparing"]);
        } else if (statusFilter !== "all") {
            query = query.eq("status", statusFilter);
        }

        // Limit to last 100 orders
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
        // Unsubscribe from previous
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
                        // New order — reload to get full joined data
                        loadOrders();
                        // Notify kitchen
                        const newOrder = payload.new as Order;
                        if (newOrder.status === "pending") {
                            toast.info("🛎️ New order received!");
                            // Play notification sound if browser supports it
                            try {
                                const audio = new Audio(
                                    "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAA..."
                                );
                                audio.play().catch(() => { }); // Ignore if autoplay blocked
                            } catch { }
                        }
                    } else if (payload.eventType === "UPDATE") {
                        // Update the specific order in state
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
            // Optimistic update
            setOrders((prev) =>
                prev.map((o) =>
                    o.id === orderId ? { ...o, status: newStatus as Order["status"] } : o
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

    // Determine effective can-update and is-waiter
    const effectiveCanUpdate =
        canUpdate || userBranchRole === "waiter" || userBranchRole === "branch_manager";
    const effectiveIsWaiter = userBranchRole === "waiter";

    // Group orders by status for kanban-style view
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
                /* Kanban columns */
                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Pending */}
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
                                        onStatusChange={handleStatusChange}
                                        updating={updating}
                                    />
                                ))
                            )}
                        </div>
                    </div>

                    {/* Preparing */}
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
                                        onStatusChange={handleStatusChange}
                                        updating={updating}
                                    />
                                ))
                            )}
                        </div>
                    </div>

                    {/* Served + Cancelled */}
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
                                            onStatusChange={handleStatusChange}
                                            updating={updating}
                                        />
                                    ))}
                                    {cancelledOrders.map((order) => (
                                        <OrderCard
                                            key={order.id}
                                            order={order}
                                            canUpdate={false}
                                            isWaiter={effectiveIsWaiter}
                                            onStatusChange={handleStatusChange}
                                            updating={updating}
                                        />
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}