// ============================================================
// helpers.ts
// Pure utility functions — no Supabase, no React, no side effects
// ============================================================

import type { OrderStatus, SubscriptionStatus } from "../lib/types";

// ── Currency ──────────────────────────────────────────────────

// Format a number as GH₵ currency with proper comma separators
// formatCurrency(65)       → "GH₵65.00"
// formatCurrency(100000)   → "GH₵100,000.00"  ✅ no overflow
// formatCurrency(1500000)  → "GH₵1,500,000.00" ✅ handles millions
export function formatCurrency(amount: number): string {
    if (amount === null || amount === undefined || isNaN(amount)) {
        return "GH₵0.00";
    }

    // Intl.NumberFormat handles ALL amounts correctly with commas
    // and never truncates or corrupts the number
    return new Intl.NumberFormat("en-GH", {
        style: "currency",
        currency: "GHS",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
    // Note: en-GH locale formats as "GH₵100,000.00" automatically
}

// Parse currency string back to number
// parseCurrency("GH₵100,000.00") → 100000
export function parseCurrency(value: string): number {
    return parseFloat(value.replace(/[^0-9.]/g, "")) || 0;
}

// ── Dates ─────────────────────────────────────────────────────

export function formatDate(isoString: string): string {
    return new Date(isoString).toLocaleDateString("en-GH", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export function formatDateTime(isoString: string): string {
    return new Date(isoString).toLocaleString("en-GH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function timeAgo(isoString: string): string {
    const seconds = Math.floor(
        (Date.now() - new Date(isoString).getTime()) / 1000
    );

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

export function daysUntil(isoString: string): number {
    const ms = new Date(isoString).getTime() - Date.now();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

// ── Subscription helpers ──────────────────────────────────────

export function subscriptionStatusLabel(status: SubscriptionStatus): string {
    const labels: Record<SubscriptionStatus, string> = {
        trial: "Free Trial",
        active: "Active",
        suspended: "Suspended (Grace Period)",
        expired: "Expired",
    };
    return labels[status];
}

export function subscriptionStatusColor(status: SubscriptionStatus): string {
    const colors: Record<SubscriptionStatus, string> = {
        trial: "bg-blue-100 text-blue-800",
        active: "bg-green-100 text-green-800",
        suspended: "bg-yellow-100 text-yellow-800",
        expired: "bg-red-100 text-red-800",
    };
    return colors[status];
}

export function isOrgAccessible(status: SubscriptionStatus): boolean {
    return ["trial", "active", "suspended"].includes(status);
}

// ── Order helpers ─────────────────────────────────────────────

export function orderStatusLabel(status: OrderStatus): string {
    const labels: Record<OrderStatus, string> = {
        pending: "Pending",
        preparing: "Preparing",
        served: "Served",
        cancelled: "Cancelled",
    };
    return labels[status];
}

export function orderStatusColor(status: OrderStatus): string {
    const colors: Record<OrderStatus, string> = {
        pending: "bg-yellow-100 text-yellow-800",
        preparing: "bg-blue-100 text-blue-800",
        served: "bg-green-100 text-green-800",
        cancelled: "bg-gray-100 text-gray-500",
    };
    return colors[status];
}

export function isOrderCancellable(status: OrderStatus): boolean {
    return status === "pending";
}

// ── Session (customer) ────────────────────────────────────────

const SESSION_KEY = "restaurant_customer_session";

export function getOrCreateSessionId(): string {
    let sessionId = localStorage.getItem(SESSION_KEY);

    if (!sessionId || !isValidUUID(sessionId)) {
        sessionId = generateUUID();
        localStorage.setItem(SESSION_KEY, sessionId);
    }

    return sessionId;
}

export function clearSession(): void {
    localStorage.removeItem(SESSION_KEY);
}

// ── Validation ────────────────────────────────────────────────

export function isValidUUID(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(value);
}

export function isValidQrIdentifier(value: string): boolean {
    return /^[A-Z0-9]{8}$/.test(value);
}

export function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ── UUID generation ───────────────────────────────────────────

export function generateUUID(): string {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// ── String utilities ──────────────────────────────────────────

export function truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + "...";
}

export function titleCase(str: string): string {
    return str
        .toLowerCase()
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

export function sanitizeInput(input: string): string {
    return input
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;")
        .trim();
}

// ── Pricing ───────────────────────────────────────────────────

// ✅ Updated to new tier-based pricing
// Mirrors BILLING_TIERS in types.ts exactly
export function calculateSubscriptionAmount(
    branchCount: number
): number {
    if (branchCount >= 6) return 2000 * branchCount; // Enterprise
    if (branchCount >= 2) return 1200 * branchCount; // Growth
    return 500 * branchCount;                         // Starter
}

// Resolve final product price (mirrors DB logic)
export function resolvePrice(
    basePrice: number,
    overridePrice: number | null
): number {
    return overridePrice !== null && overridePrice !== undefined
        ? overridePrice
        : basePrice;
}

// ── Array utilities ───────────────────────────────────────────

export function groupBy<T>(
    array: T[],
    key: keyof T
): Record<string, T[]> {
    return array.reduce((groups, item) => {
        const groupKey = String(item[key]);
        return {
            ...groups,
            [groupKey]: [...(groups[groupKey] || []), item],
        };
    }, {} as Record<string, T[]>);
}

export function moveItem<T>(
    array: T[],
    fromIndex: number,
    toIndex: number
): T[] {
    const result = [...array];
    const [moved] = result.splice(fromIndex, 1);
    result.splice(toIndex, 0, moved);
    return result;
}

// ── QR code URL builder ───────────────────────────────────────

export function buildQrUrl(qrIdentifier: string): string {
    const baseUrl =
        import.meta.env.VITE_FRONTEND_URL || window.location.origin;
    return `${baseUrl}/menu/${qrIdentifier}`;
}

// ── Brute force / login attempt tracking ─────────────────────

const LOGIN_ATTEMPTS_KEY = "login_attempts";
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000;

interface LoginAttempts {
    count: number;
    firstAttempt: number;
    lockedUntil?: number;
}

export function recordLoginAttempt(): boolean {
    const raw = localStorage.getItem(LOGIN_ATTEMPTS_KEY);
    const attempts: LoginAttempts = raw
        ? JSON.parse(raw)
        : { count: 0, firstAttempt: Date.now() };

    if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
        return false;
    }

    if (Date.now() - attempts.firstAttempt > LOCKOUT_DURATION) {
        localStorage.setItem(
            LOGIN_ATTEMPTS_KEY,
            JSON.stringify({ count: 1, firstAttempt: Date.now() })
        );
        return true;
    }

    attempts.count++;

    if (attempts.count >= MAX_ATTEMPTS) {
        attempts.lockedUntil = Date.now() + LOCKOUT_DURATION;
    }

    localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(attempts));
    return attempts.count < MAX_ATTEMPTS;
}

export function clearLoginAttempts(): void {
    localStorage.removeItem(LOGIN_ATTEMPTS_KEY);
}

export function isLoginLocked(): { locked: boolean; remainingMs: number } {
    const raw = localStorage.getItem(LOGIN_ATTEMPTS_KEY);
    if (!raw) return { locked: false, remainingMs: 0 };

    const attempts: LoginAttempts = JSON.parse(raw);
    if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
        return {
            locked: true,
            remainingMs: attempts.lockedUntil - Date.now(),
        };
    }
    return { locked: false, remainingMs: 0 };
}