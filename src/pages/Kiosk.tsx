// ============================================================
// Kiosk.tsx
// Public page — no auth required
// Staff open this on a display screen at the counter.
// Customers browse menu → add to cart → place order →
// receive a pickup code (e.g. AB7) to collect their food.
// 3 views: menu | cart | confirmation
// Pickup code stored in order notes as [KIOSK:AB7]
// so Kitchen board can parse and display it.
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
} from "../utils/helpers";
import type {
    MenuProduct,
    MenuCategory,
    CustomerView,
    PlaceOrderResponse,
} from "../lib/types";

// ── Pickup code generator ──────────────────────────────────────
// Format: two uppercase letters + one or two digit number
// e.g. AB7, KD23, MX14, PQ3
function generatePickupCode(): string {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O (confusing)
    const a = letters[Math.floor(Math.random() * letters.length)];
    const b = letters[Math.floor(Math.random() * letters.length)];
    const n = Math.floor(Math.random() * 99) + 1; // 1–99
    return `${a}${b}${n}`;
}

// ── Kiosk menu data shape ──────────────────────────────────────
// Lighter than MenuData — no table info needed
interface KioskMenuData {
    restaurant: { id: string; name: string };
    branch: { id: string; name: string; address: string | null };
    categories: MenuCategory[];
}

// ── Product card ───────────────────────────────────────────────
// Identical to Customer.tsx ProductCard
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

            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">
                            {product.name}
                        </p>
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

                <div className="mt-2 flex items-center gap-2">
                    {quantity > 0 && (
                        <span className="text-xs bg-green-100 text-green-700 px-2.5
                             py-1 rounded-full font-medium">
                            {quantity} in cart
                        </span>
                    )}
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
// Same as Customer.tsx CartView except footer text uses pickup code
function CartView({
    cart,
    pickupCode,
    onBack,
    onOrder,
    ordering,
}: {
    cart: ReturnType<typeof useCart>;
    pickupCode: string;
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
                        <div className="w-14 h-14 bg-gray-100 rounded-lg overflow-hidden
                            flex-shrink-0">
                            {item.image_url ? (
                                <img
                                    src={item.image_url}
                                    alt={item.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center
                                    justify-center text-xl">
                                    🍽️
                                </div>
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                                {item.name}
                            </p>
                            <p className="text-xs text-gray-500">
                                {formatCurrency(item.price)} each
                            </p>
                            <input
                                type="text"
                                placeholder="Special request..."
                                value={item.notes || ""}
                                onChange={(e) =>
                                    cart.updateNotes(item.product_id, e.target.value)
                                }
                                maxLength={100}
                                className="mt-1 w-full text-xs border border-gray-200
                           rounded-lg px-2 py-1 focus:outline-none
                           focus:ring-1 focus:ring-green-500"
                            />
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                                onClick={() =>
                                    cart.update(item.product_id, item.quantity - 1)
                                }
                                className="w-7 h-7 rounded-full border border-gray-300
                           flex items-center justify-center text-gray-600
                           hover:bg-gray-100 transition-colors font-bold
                           text-lg leading-none"
                            >
                                −
                            </button>
                            <span className="text-sm font-semibold w-5 text-center">
                                {item.quantity}
                            </span>
                            <button
                                onClick={() =>
                                    cart.update(item.product_id, item.quantity + 1)
                                }
                                className="w-7 h-7 rounded-full border border-gray-300
                           flex items-center justify-center text-gray-600
                           hover:bg-gray-100 transition-colors font-bold
                           text-lg leading-none"
                            >
                                +
                            </button>
                        </div>

                        <p className="text-sm font-bold text-gray-900 flex-shrink-0
                          w-16 text-right">
                            {formatCurrency(item.price * item.quantity)}
                        </p>
                    </div>
                ))}

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
                {/* Pickup code shown in cart footer so customer knows it early */}
                <p className="text-xs text-center text-gray-400 mt-2">
                    Your pickup number is{" "}
                    <span className="font-bold text-green-700">{pickupCode}</span>
                    {" "}— remember it!
                </p>
            </div>
        </div>
    );
}

// ── Confirmation view ──────────────────────────────────────────
// Pickup code is the hero — shown large and bold
function ConfirmationView({
    pickupCode,
    total,
    onNewOrder,
}: {
    pickupCode: string;
    total: number;
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
                <p className="text-gray-500 text-sm mb-6">
                    Your order has been sent to the kitchen.
                </p>

                {/* Pickup code — the hero of this screen */}
                <div className="bg-green-50 border-2 border-green-200 rounded-2xl
                        p-6 mb-6">
                    <p className="text-xs text-green-600 font-medium uppercase
                            tracking-widest mb-2">
                        Your Pickup Number
                    </p>
                    <p className="text-6xl font-black text-green-700 tracking-wider">
                        {pickupCode}
                    </p>
                    <p className="text-xs text-green-600 mt-2">
                        Show this number when collecting your order
                    </p>
                </div>

                {/* Order summary */}
                <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left space-y-2">
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
                    New Order
                </Button>

                <p className="text-xs text-gray-400 mt-4">
                    Payment is collected at the counter 💵
                </p>
            </div>
        </div>
    );
}

// ── Main Kiosk page ────────────────────────────────────────────
export default function Kiosk() {
    const { branchId } = useParams<{ branchId: string }>();

    // Use branchId as the cart key — one cart per kiosk screen
    const cart = useCart(branchId || "");
    const sessionId = getOrCreateSessionId();

    const [menuData, setMenuData] = useState<KioskMenuData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<CustomerView>("menu");
    const [ordering, setOrdering] = useState(false);
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [pickupCode, setPickupCode] = useState<string>(generatePickupCode);

    const [placedOrder, setPlacedOrder] = useState<{
        total: number;
    } | null>(null);

    // ── Load menu ────────────────────────────────────────────────
    // Option B: direct queries, no RPC needed
    const loadMenu = useCallback(async () => {
        if (!branchId) {
            setError("Invalid kiosk link. Please ask staff for assistance.");
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // 1. Fetch branch
            const { data: branch, error: branchError } = await supabase
                .from("branches")
                .select("id, name, address, org_id, deleted_at")
                .eq("id", branchId)
                .maybeSingle();

            if (branchError || !branch) {
                setError("This kiosk link is not recognized. Please ask staff.");
                setLoading(false);
                return;
            }

            if (branch.deleted_at) {
                setError("This branch is no longer active.");
                setLoading(false);
                return;
            }

            // 2. Fetch org — check subscription status
            const { data: org, error: orgError } = await supabase
                .from("organizations")
                .select("id, name, subscription_status")
                .eq("id", branch.org_id)
                .maybeSingle();

            if (orgError || !org) {
                setError("Could not load restaurant info. Please try again.");
                setLoading(false);
                return;
            }

            if (org.subscription_status === "expired") {
                setError("This restaurant's system is currently unavailable.");
                setLoading(false);
                return;
            }

            // 3. Fetch categories for this org
            const { data: categories, error: catError } = await supabase
                .from("categories")
                .select("id, name, sort_order")
                .eq("org_id", org.id)
                .order("sort_order");

            if (catError || !categories || categories.length === 0) {
                setError("No menu categories found. Please ask staff.");
                setLoading(false);
                return;
            }

            // 4. Fetch available products for this branch via branch_inventory
            const { data: inventory, error: invError } = await supabase
                .from("branch_inventory")
                .select(`
                    override_price,
                    products(
                        id, name, description, base_price,
                        image_url, sort_order, category_id
                    )
                `)
                .eq("branch_id", branchId)
                .eq("is_available", true);

            if (invError) {
                setError("Could not load menu items. Please try again.");
                setLoading(false);
                return;
            }

            // 5. Build categories with products
            // Price resolution: override_price ?? base_price
            // Products sorted alphabetically within each category
            const categoryMap = new Map(
                categories.map((c) => [
                    c.id,
                    {
                        id: c.id,
                        name: c.name,
                        sort_order: c.sort_order,
                        products: [] as MenuProduct[],
                    },
                ])
            );

            (inventory || []).forEach((inv: any) => {
                const p = inv.products;
                if (!p || !categoryMap.has(p.category_id)) return;

                categoryMap.get(p.category_id)!.products.push({
                    id: p.id,
                    name: p.name,
                    description: p.description,
                    price: inv.override_price ?? p.base_price,
                    image_url: p.image_url,
                    sort_order: p.sort_order,
                });
            });

            // Sort products alphabetically within each category
            const builtCategories = [...categoryMap.values()]
                .filter((c) => c.products.length > 0)
                .map((c) => ({
                    ...c,
                    products: c.products.sort((a, b) =>
                        a.name.localeCompare(b.name)
                    ),
                }));

            if (builtCategories.length === 0) {
                setError("No items are available right now. Please ask staff.");
                setLoading(false);
                return;
            }

            setMenuData({
                restaurant: { id: org.id, name: org.name },
                branch: {
                    id: branch.id,
                    name: branch.name,
                    address: branch.address,
                },
                categories: builtCategories,
            });

            setActiveCategory(builtCategories[0].id);

        } catch {
            setError("Something went wrong. Please try again.");
        }

        setLoading(false);
    }, [branchId]);

    useEffect(() => {
        loadMenu();
    }, [loadMenu]);

    // ── Place order ──────────────────────────────────────────────
    async function handlePlaceOrder(notes: string) {
        if (!menuData || cart.isEmpty) return;

        setOrdering(true);

        // Embed pickup code in notes — kitchen parses [KIOSK:AB7]
        // Customer notes appended after the tag if present
        const customerNotes = notes ? sanitizeInput(notes) : "";
        const orderNotes = customerNotes
            ? `[KIOSK:${pickupCode}] ${customerNotes}`
            : `[KIOSK:${pickupCode}]`;

        // Kiosk orders have no table — we need a valid table_id for the
        // place-order edge function. We pass null and let the edge
        // function handle kiosk orders without a table.
        // NOTE: if place-order requires table_id, a dedicated
        // "kiosk table" per branch can be created as a workaround.
        const payload = {
            branch_id: menuData.branch.id,
            session_id: sessionId,
            is_kiosk: true,
            items: cart.items.map((item) => ({
                product_id: item.product_id,
                quantity: item.quantity,
                notes: item.notes
                    ? sanitizeInput(item.notes)
                    : undefined,
            })),
            notes: orderNotes,
        };

        try {
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

            setPlacedOrder({ total: result.total_amount });
            cart.clear();
            setView("confirmation");

        } catch {
            toast.error("Network error. Please check your connection and try again.");
        }

        setOrdering(false);
    }

    // ── Reset for next customer ──────────────────────────────────
    function handleNewOrder() {
        setView("menu");
        setPlacedOrder(null);
        setPickupCode(generatePickupCode()); // fresh code for next customer
        cart.clear();
    }

    // ── Loading ──────────────────────────────────────────────────
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

    // ── Error ────────────────────────────────────────────────────
    if (error || !menuData) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="text-center max-w-sm">
                    <div className="text-5xl mb-4">😕</div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">
                        Kiosk Unavailable
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
                pickupCode={pickupCode}
                total={placedOrder.total}
                onNewOrder={handleNewOrder}
            />
        );
    }

    // ── Cart view ────────────────────────────────────────────────
    if (view === "cart") {
        return (
            <CartView
                cart={cart}
                pickupCode={pickupCode}
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
                    {/* Pickup code shown in header so customer sees it early */}
                    <span className="text-xs bg-green-600 px-2.5 py-1 rounded-full">
                        🎫 Pickup: {pickupCode}
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
                        {/* Already sorted alphabetically during menu build */}
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
                            <span className="font-bold">
                                {formatCurrency(cart.total)}
                            </span>
                        </span>
                    </Button>
                </div>
            )}
        </div>
    );
}