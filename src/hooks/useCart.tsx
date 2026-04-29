// ============================================================
// useCart.tsx
// Shopping cart for customers — persisted in localStorage
// so it survives page refreshes mid-order
// ============================================================

import { useState, useEffect, useCallback } from "react";
import type { CartItem, MenuProduct } from "../lib/types";

// Cart is keyed by QR identifier so different tables
// don't share the same cart
const CART_KEY_PREFIX = "restaurant_cart_";

interface UseCartReturn {
    items: CartItem[];
    total: number;
    itemCount: number;
    add: (product: MenuProduct) => void;
    remove: (productId: string) => void;
    update: (productId: string, quantity: number) => void;
    updateNotes: (productId: string, notes: string) => void;
    clear: () => void;
    isEmpty: boolean;
}

export function useCart(qrIdentifier: string): UseCartReturn {
    const cartKey = `${CART_KEY_PREFIX}${qrIdentifier}`;

    // ── Initialize from localStorage ─────────────────────────
    const [items, setItems] = useState<CartItem[]>(() => {
        try {
            const stored = localStorage.getItem(cartKey);
            if (!stored) return [];
            const parsed = JSON.parse(stored) as CartItem[];
            // Validate structure — don't trust localStorage blindly
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(
                (item) =>
                    item.product_id &&
                    typeof item.quantity === "number" &&
                    item.quantity > 0 &&
                    typeof item.price === "number"
            );
        } catch {
            return [];
        }
    });

    // ── Persist to localStorage on every change ───────────────
    useEffect(() => {
        try {
            localStorage.setItem(cartKey, JSON.stringify(items));
        } catch {
            // localStorage may be full — not critical
            console.warn("Could not persist cart to localStorage");
        }
    }, [items, cartKey]);

    // ── Computed values ───────────────────────────────────────
    const total = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
    );

    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const isEmpty = items.length === 0;

    // ── Add item ──────────────────────────────────────────────
    const add = useCallback((product: MenuProduct) => {
        setItems((prev) => {
            const existing = prev.find((i) => i.product_id === product.id);

            if (existing) {
                // Already in cart — increment quantity (max 20 per item)
                return prev.map((i) =>
                    i.product_id === product.id
                        ? { ...i, quantity: Math.min(i.quantity + 1, 20) }
                        : i
                );
            }

            // New item
            const newItem: CartItem = {
                product_id: product.id,
                name: product.name,
                price: product.price,
                quantity: 1,
                image_url: product.image_url,
            };
            return [...prev, newItem];
        });
    }, []);

    // ── Remove item completely ────────────────────────────────
    const remove = useCallback((productId: string) => {
        setItems((prev) => prev.filter((i) => i.product_id !== productId));
    }, []);

    // ── Update quantity (removes if 0) ────────────────────────
    const update = useCallback((productId: string, quantity: number) => {
        if (quantity <= 0) {
            setItems((prev) => prev.filter((i) => i.product_id !== productId));
            return;
        }

        setItems((prev) =>
            prev.map((i) =>
                i.product_id === productId
                    ? { ...i, quantity: Math.min(quantity, 20) }
                    : i
            )
        );
    }, []);

    // ── Update notes for an item ──────────────────────────────
    const updateNotes = useCallback((productId: string, notes: string) => {
        setItems((prev) =>
            prev.map((i) =>
                i.product_id === productId
                    ? { ...i, notes: notes || undefined }
                    : i
            )
        );
    }, []);

    // ── Clear entire cart ─────────────────────────────────────
    const clear = useCallback(() => {
        setItems([]);
        try {
            localStorage.removeItem(cartKey);
        } catch {
            // Non-critical
        }
    }, [cartKey]);

    return {
        items,
        total,
        itemCount,
        add,
        remove,
        update,
        updateNotes,
        clear,
        isEmpty,
    };
}