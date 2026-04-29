// ============================================================
// Customer.tsx
// Public page — no auth required
// Customers scan QR → browse menu → add to cart → place order
// 3 views: menu | cart | confirmation
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCart } from "../hooks/useCart";
import { Button, Spinner, Badge } from "../components/UI";
import { toast } from "../components/UI";
import {
    getOrCreateSessionId,
    formatCurrency,
    sanitizeInput,
    isValidQrIdentifier,
} from "../utils/helpers";
import type {
    MenuData,
    MenuProduct,
    MenuCategory,
    CustomerView,
    PlaceOrderResponse,
} from "../lib/types";

// ── Product card ───────────────────────────────────────────────
function ProductCard({
    product,
    quantity,
    onAdd,
}: {
    product: MenuProduct;
    quantity: number;
    onAdd: (product: MenuProduct) => void;
}) {
    return (
        <div className="flex gap-3 py-4 border-b border-gray-100 last:border-0">
            {/* Image */}
            {product.image_url ? (
                <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-20 h-20 object-cover rounded-xl flex-shrink-0"
                    loading="lazy"
                />
            ) : (
                <div className="w-20 h-20 bg-gray-100 rounded-xl flex items-center
                        justify-center flex-shrink-0 text-2xl">
                    🍽️
                </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">{product.name}</p>
                        {product.description && (
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                                {product.description}
                            </p>
                        )}
                    </div>
                    <p className="text-green-700 font-bold text-sm flex-shrink-0">
                        {formatCurrency(product.price)}
                    </p>
                </div>

                {/* Add button */}
                <div className="mt-2 flex items-center gap-2">
                    {quantity > 0 ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2.5
                             py-1 rounded-full font-medium">
                            {quantity} in cart
                        </span>
                    ) : null}
                    <button
                        onClick={() => onAdd(product)}
                        className="ml-auto text-xs bg-green-600 text-white px-3 py-1.5
                       rounded-lg font-medium hover:bg-green-700 transition-colors
                       active:scale-95"
                    >
                        + Add
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Cart view ──────────────────────────────────────────────────
function CartView({
    cart,
    menuData,
    onBack,
    onOrder,
    ordering,
}: {
    cart: ReturnType<typeof useCart>;
    menuData: MenuData;
    onBack: () => void;
    onOrder: (notes: string) => void;
    ordering: boolean;
}) {
    const [notes, setNotes] = useState("");

    return (
        <div className="flex flex-col min-h-screen bg-white">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100
                      flex items-center gap-3 px-4 py-4 z-10">
                <button
                    onClick={onBack}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                    ←
                </button>
                <h2 className="font-bold text-gray-900 text-lg">Your Cart</h2>
                <span className="ml-auto text-sm text-gray-400">
                    {cart.itemCount} item{cart.itemCount !== 1 ? "s" : ""}
                </span>
            </div>

            {/* Cart items */}
            <div className="flex-1 px-4 py-4 space-y-3">
                {cart.items.map((item) => (
                    <div
                        key={item.product_id}
                        className="flex items-center gap-3 py-3 border-b border-gray-50"
                    >
                        {/* Image */}
                        <div className="w-14 h-14 bg-gray-100 rounded-lg overflow-hidden
                            flex-shrink-0">
                            {item.image_url ? (
                                <img
                                    src={item.image_url}
                                    alt={item.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-xl">
                                    🍽️
                                </div>
                            )}
                        </div>

                        {/* Name + price */}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                                {item.name}
                            </p>
                            <p className="text-xs text-gray-500">
                                {formatCurrency(item.price)} each
                            </p>
                            {/* Item notes */}
                            <input
                                type="text"
                                placeholder="Special request..."
                                value={item.notes || ""}
                                onChange={(e) =>
                                    cart.updateNotes(item.product_id, e.target.value)
                                }
                                maxLength={100}
                                className="mt-1 w-full text-xs border border-gray-200 rounded-lg
                           px-2 py-1 focus:outline-none focus:ring-1
                           focus:ring-green-500"
                            />
                        </div>

                        {/* Quantity controls */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                                onClick={() => cart.update(item.product_id, item.quantity - 1)}
                                className="w-7 h-7 rounded-full border border-gray-300 flex
                           items-center justify-center text-gray-600
                           hover:bg-gray-100 transition-colors font-bold text-lg
                           leading-none"
                            >
                                −
                            </button>
                            <span className="text-sm font-semibold w-5 text-center">
                                {item.quantity}
                            </span>
                            <button
                                onClick={() => cart.update(item.product_id, item.quantity + 1)}
                                className="w-7 h-7 rounded-full border border-gray-300 flex
                           items-center justify-center text-gray-600
                           hover:bg-gray-100 transition-colors font-bold text-lg
                           leading-none"
                            >
                                +
                            </button>
                        </div>

                        {/* Subtotal */}
                        <p className="text-sm font-bold text-gray-900 flex-shrink-0 w-16
                          text-right">
                            {formatCurrency(item.price * item.quantity)}
                        </p>
                    </div>
                ))}

                {/* Order notes */}
                <div className="pt-2">
                    <label className="text-sm font-medium text-gray-700 block mb-1">
                        Order notes (optional)
                    </label>
                    <textarea
                        rows={2}
                        placeholder="Any special instructions for the whole order..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        maxLength={300}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2
                       text-sm resize-none focus:outline-none
                       focus:ring-2 focus:ring-green-500"
                    />
                </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 py-4">
                <div className="flex justify-between items-center mb-3">
                    <span className="text-gray-600 font-medium">Total</span>
                    <span className="text-xl font-bold text-green-700">
                        {formatCurrency(cart.total)}
                    </span>
                </div>
                <Button
                    fullWidth
                    size="lg"
                    onClick={() => onOrder(notes)}
                    loading={ordering}
                    disabled={cart.isEmpty}
                >
                    Place Order 🛎️
                </Button>
                <p className="text-xs text-center text-gray-400 mt-2">
                    A waiter will bring your order to {menuData.table.name}
                </p>
            </div>
        </div>
    );
}

// ── Confirmation view ──────────────────────────────────────────
function ConfirmationView({
    orderId,
    total,
    tableName,
    onNewOrder,
}: {
    orderId: string;
    total: number;
    tableName: string;
    onNewOrder: () => void;
}) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center
                        justify-center mx-auto mb-4 text-3xl">
                    ✅
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    Order Placed!
                </h2>
                <p className="text-gray-500 text-sm mb-1">
                    Your order has been sent to the kitchen.
                </p>
                <p className="text-gray-500 text-sm mb-6">
                    A waiter will bring it to <strong>{tableName}</strong>.
                </p>

                {/* Order summary */}
                <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Order ID</span>
                        <span className="font-mono text-xs text-gray-700">
                            #{orderId.slice(0, 8).toUpperCase()}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Total</span>
                        <span className="font-bold text-green-700">
                            {formatCurrency(total)}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Status</span>
                        <Badge className="bg-yellow-100 text-yellow-700">
                            Pending
                        </Badge>
                    </div>
                </div>

                <Button fullWidth onClick={onNewOrder} variant="secondary">
                    Order More Items
                </Button>

                <p className="text-xs text-gray-400 mt-4">
                    Payment is collected by the waiter 💵
                </p>
            </div>
        </div>
    );
}

// ── Main Customer page ─────────────────────────────────────────
export default function Customer() {
    const { qrId } = useParams<{ qrId: string }>();
    const cart = useCart(qrId || "");
    const sessionId = getOrCreateSessionId();

    const [menuData, setMenuData] = useState<MenuData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<CustomerView>("menu");
    const [ordering, setOrdering] = useState(false);
    const [activeCategory, setActiveCategory] = useState<string | null>(null);

    // Placed order info for confirmation screen
    const [placedOrder, setPlacedOrder] = useState<{
        id: string;
        total: number;
    } | null>(null);

    // ── Load menu ───────────────────────────────────────────────
    const loadMenu = useCallback(async () => {
        if (!qrId) {
            setError("Invalid QR code");
            setLoading(false);
            return;
        }

        // Validate QR format before hitting the DB
        if (!isValidQrIdentifier(qrId)) {
            setError("This QR code is invalid. Please ask staff for assistance.");
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        const { data, error: rpcError } = await supabase.rpc(
            "get_menu_by_qr",
            { qr_code: qrId }
        );

        if (rpcError) {
            const msg = rpcError.message || "";
            if (msg.includes("INVALID_QR")) {
                setError("This QR code is not recognized. Please ask staff for help.");
            } else if (msg.includes("BRANCH_INACTIVE")) {
                setError("This branch is currently inactive.");
            } else if (msg.includes("ORG_EXPIRED")) {
                setError("This restaurant's system is currently unavailable.");
            } else {
                setError("Could not load the menu. Please try again.");
            }
            setLoading(false);
            return;
        }

        const menu = data as MenuData;
        setMenuData(menu);

        // Default to first category
        if (menu.categories.length > 0) {
            setActiveCategory(menu.categories[0].id);
        }

        setLoading(false);
    }, [qrId]);

    useEffect(() => {
        loadMenu();
    }, [loadMenu]);

    // ── Place order ─────────────────────────────────────────────
    async function handlePlaceOrder(notes: string) {
        if (!menuData || cart.isEmpty) return;

        setOrdering(true);

        const payload = {
            qr_identifier: qrId,
            session_id: sessionId,
            items: cart.items.map((item) => ({
                product_id: item.product_id,
                quantity: item.quantity,
                notes: item.notes || undefined
                    ? sanitizeInput(item.notes || "")
                    : undefined,
            })),
            notes: notes || undefined,
        };

        try {
            // Call place-order edge function directly
            // (using fetch because it's anon — no JWT needed)
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
            const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

            const res = await fetch(
                `${supabaseUrl}/functions/v1/place-order`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "apikey": supabaseAnon,
                    },
                    body: JSON.stringify(payload),
                }
            );

            const result = await res.json() as PlaceOrderResponse & {
                error?: string;
                message?: string;
            };

            if (!res.ok) {
                const errMsg = result.message || result.error || "Failed to place order";
                toast.error(errMsg);
                setOrdering(false);
                return;
            }

            // Success!
            setPlacedOrder({ id: result.order_id, total: result.total_amount });
            cart.clear();
            setView("confirmation");
        } catch {
            toast.error("Network error. Please check your connection and try again.");
        }

        setOrdering(false);
    }

    // ── Loading ─────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-3">
                    <Spinner size="lg" />
                    <p className="text-gray-400 text-sm">Loading menu...</p>
                </div>
            </div>
        );
    }

    // ── Error ───────────────────────────────────────────────────
    if (error || !menuData) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="text-center max-w-sm">
                    <div className="text-5xl mb-4">😕</div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">
                        Menu Unavailable
                    </h2>
                    <p className="text-gray-500 text-sm mb-6">
                        {error || "Could not load menu"}
                    </p>
                    <Button onClick={loadMenu} variant="secondary">
                        Try Again
                    </Button>
                </div>
            </div>
        );
    }

    // ── Confirmation view ────────────────────────────────────────
    if (view === "confirmation" && placedOrder) {
        return (
            <ConfirmationView
                orderId={placedOrder.id}
                total={placedOrder.total}
                tableName={menuData.table.name}
                onNewOrder={() => {
                    setView("menu");
                    setPlacedOrder(null);
                }}
            />
        );
    }

    // ── Cart view ────────────────────────────────────────────────
    if (view === "cart") {
        return (
            <CartView
                cart={cart}
                menuData={menuData}
                onBack={() => setView("menu")}
                onOrder={handlePlaceOrder}
                ordering={ordering}
            />
        );
    }

    // ── Menu view ────────────────────────────────────────────────
    const activeMenuCategory = menuData.categories.find(
        (c) => c.id === activeCategory
    );

    return (
        <div className="min-h-screen bg-gray-50">
            {/* ── Restaurant header ──────────────────────── */}
            <div className="bg-green-700 text-white px-4 pt-8 pb-16">
                <h1 className="text-2xl font-bold">{menuData.restaurant.name}</h1>
                <p className="text-green-200 text-sm mt-0.5">{menuData.branch.name}</p>
                <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs bg-green-600 px-2.5 py-1 rounded-full">
                        📍 {menuData.table.name}
                    </span>
                    {menuData.branch.address && (
                        <span className="text-xs text-green-300 truncate">
                            {menuData.branch.address}
                        </span>
                    )}
                </div>
            </div>

            {/* ── Category tabs ─────────────────────────── */}
            <div className="sticky top-0 z-10 bg-white shadow-sm -mt-6 rounded-t-3xl">
                <div className="flex overflow-x-auto scrollbar-hide px-4 pt-4 gap-2">
                    {menuData.categories.map((cat: MenuCategory) => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            className={`
                flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium
                transition-colors whitespace-nowrap
                ${activeCategory === cat.id
                                    ? "bg-green-600 text-white"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                }
              `}
                        >
                            {cat.name}
                        </button>
                    ))}
                </div>

                {/* Cart FAB hint */}
                {!cart.isEmpty && (
                    <div className="px-4 pt-2 pb-3 flex items-center justify-between">
                        <p className="text-xs text-gray-400">
                            {cart.itemCount} item{cart.itemCount !== 1 ? "s" : ""} in cart
                        </p>
                    </div>
                )}
                {cart.isEmpty && <div className="pb-3" />}
            </div>

            {/* ── Products ─────────────────────────────── */}
            <div className="px-4 pb-36">
                {activeMenuCategory ? (
                    <>
                        <h2 className="text-lg font-bold text-gray-900 mt-4 mb-2">
                            {activeMenuCategory.name}
                        </h2>
                        {activeMenuCategory.products.map((product: MenuProduct) => {
                            const cartItem = cart.items.find(
                                (i) => i.product_id === product.id
                            );
                            return (
                                <ProductCard
                                    key={product.id}
                                    product={product}
                                    quantity={cartItem?.quantity || 0}
                                    onAdd={cart.add}
                                />
                            );
                        })}
                    </>
                ) : (
                    <div className="text-center py-16 text-gray-400">
                        <p>No items available in this category</p>
                    </div>
                )}
            </div>

            {/* ── Floating cart button ──────────────────── */}
            {!cart.isEmpty && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white
                        border-t border-gray-100 shadow-lg">
                    <Button
                        fullWidth
                        size="lg"
                        onClick={() => setView("cart")}
                    >
                        <span className="flex items-center justify-between w-full">
                            <span className="bg-green-700 text-white rounded-full
                               w-6 h-6 flex items-center justify-center
                               text-xs font-bold">
                                {cart.itemCount}
                            </span>
                            <span>View Cart</span>
                            <span className="font-bold">{formatCurrency(cart.total)}</span>
                        </span>
                    </Button>
                </div>
            )}
        </div>
    );
}