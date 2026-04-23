// ============================================================
// helpers.ts
// Pure utility functions — no Supabase, no React, no side effects
// Easy to unit test!
// ============================================================

import type { OrderStatus, SubscriptionStatus } from "../lib/types";

// ── Currency ──────────────────────────────────────────────────

// Format a number as GH₵ currency
// formatCurrency(65) → "GH₵65.00"
export function formatCurrency(amount: number): string {
    return `GH₵${amount.toFixed(2)}`;
}

// Parse currency string back to number
// parseCurrency("GH₵65.00") → 65
export function parseCurrency(value: string): number {
    return parseFloat(value.replace(/[^0-9.]/g, "")) || 0;
}

// ── Dates ─────────────────────────────────────────────────────

// Format ISO string to readable date
// formatDate("2024-01-15T10:30:00Z") → "Jan 15, 2024"
export function formatDate(isoString: string): string {
    return new Date(isoString).toLocaleDateString("en-GH", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

// Format ISO string to readable date + time
// formatDateTime("2024-01-15T10:30:00Z") → "Jan 15, 2024, 10:30 AM"
export function formatDateTime(isoString: string): string {
    return new Date(isoString).toLocaleString("en-GH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

// How long ago was this timestamp?
// timeAgo("2024-01-15T10:00:00Z") → "5 minutes ago"
export function timeAgo(isoString: string): string {
    const seconds = Math.floor(
        (Date.now() - new Date(isoString).getTime()) / 1000
    );

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

// Days remaining until a date (negative = overdue)
export function daysUntil(isoString: string): number {
    const ms = new Date(isoString).getTime() - Date.now();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

// ── Subscription helpers ──────────────────────────────────────

// Human-readable subscription status label
export function subscriptionStatusLabel(status: SubscriptionStatus): string {
    const labels: Record<SubscriptionStatus, string> = {
        trial: "Free Trial",
        active: "Active",
        suspended: "Suspended (Grace Period)",
        expired: "Expired",
    };
    return labels[status];
}

// Tailwind color class for subscription status badge
export function subscriptionStatusColor(status: SubscriptionStatus): string {
    const colors: Record<SubscriptionStatus, string> = {
        trial: "bg-blue-100 text-blue-800",
        active: "bg-green-100 text-green-800",
        suspended: "bg-yellow-100 text-yellow-800",
        expired: "bg-red-100 text-red-800",
    };
    return colors[status];
}

// Can this org access the system?
export function isOrgAccessible(status: SubscriptionStatus): boolean {
    return ["trial", "active", "suspended"].includes(status);
}

// ── Order helpers ─────────────────────────────────────────────

// Human-readable order status
export function orderStatusLabel(status: OrderStatus): string {
    const labels: Record<OrderStatus, string> = {
        pending: "Pending",
        preparing: "Preparing",
        served: "Served",
        cancelled: "Cancelled",
    };
    return labels[status];
}

// Tailwind color for order status badge
export function orderStatusColor(status: OrderStatus): string {
    const colors: Record<OrderStatus, string> = {
        pending: "bg-yellow-100 text-yellow-800",
        preparing: "bg-blue-100 text-blue-800",
        served: "bg-green-100 text-green-800",
        cancelled: "bg-gray-100 text-gray-500",
    };
    return colors[status];
}

// Can this order be cancelled?
export function isOrderCancellable(status: OrderStatus): boolean {
    return status === "pending";
}

// ── Session (customer) ────────────────────────────────────────

const SESSION_KEY = "restaurant_customer_session";

// Get or create a persistent customer session ID
// Stored in localStorage — survives page refresh
export function getOrCreateSessionId(): string {
    let sessionId = localStorage.getItem(SESSION_KEY);

    if (!sessionId || !isValidUUID(sessionId)) {
        sessionId = generateUUID();
        localStorage.setItem(SESSION_KEY, sessionId);
    }

    return sessionId;
}

// Clear customer session (call after order is placed if needed)
export function clearSession(): void {
    localStorage.removeItem(SESSION_KEY);
}

// ── Validation ────────────────────────────────────────────────

// Validate UUID v4 format
export function isValidUUID(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
    );
}

// Validate QR identifier format (8 uppercase alphanumeric)
export function isValidQrIdentifier(value: string): boolean {
    return /^[A-Z0-9]{8}$/.test(value);
}

// Validate email format
export function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ── UUID generation ───────────────────────────────────────────

// Generate a UUID v4 (for customer session IDs)
// Uses crypto.randomUUID() when available (modern browsers)
export function generateUUID(): string {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for older browsers
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// ── String utilities ──────────────────────────────────────────

// Truncate long strings with ellipsis
// truncate("Hello World", 8) → "Hello..."
export function truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + "...";
}

// Capitalize first letter of each word
// titleCase("jollof rice") → "Jollof Rice"
export function titleCase(str: string): string {
    return str
        .toLowerCase()
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

// Sanitize user input — strips HTML tags to prevent XSS
// For richer sanitization install DOMPurify:
// npm install dompurify @types/dompurify
// then: import DOMPurify from 'dompurify'; return DOMPurify.sanitize(input)
export function sanitizeInput(input: string): string {
    return input
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;")
        .trim();
}

// ── Pricing ───────────────────────────────────────────────────

// Calculate subscription amount
export function calculateSubscriptionAmount(
    planType: "monthly" | "yearly",
    branchCount: number
): number {
    const PRICE_PER_BRANCH = 200; // GH₵200 per branch per month
    const months = planType === "yearly" ? 12 : 1;
    return PRICE_PER_BRANCH * branchCount * months;
}

// Resolve final product price (mirrors DB logic)
// override_price takes priority over base_price
export function resolvePrice(
    basePrice: number,
    overridePrice: number | null
): number {
    return overridePrice !== null && overridePrice !== undefined
        ? overridePrice
        : basePrice;
}

// ── Array utilities ───────────────────────────────────────────

// Group an array by a key
// groupBy(products, "category_id") → { "uuid1": [...], "uuid2": [...] }
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

// Move item in array (for drag-and-drop reordering)
export function moveItem<T>(array: T[], fromIndex: number, toIndex: number): T[] {
    const result = [...array];
    const [moved] = result.splice(fromIndex, 1);
    result.splice(toIndex, 0, moved);
    return result;
}

// ── QR code URL builder ───────────────────────────────────────

export function buildQrUrl(qrIdentifier: string): string {
    const baseUrl = import.meta.env.VITE_FRONTEND_URL || window.location.origin;
    return `${baseUrl}/menu/${qrIdentifier}`;
}

// ── Brute force / login attempt tracking ─────────────────────
// Client-side tracking — complements Supabase's built-in rate limiting

const LOGIN_ATTEMPTS_KEY = "login_attempts";
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes in ms

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

    // Check if locked
    if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
        return false; // Still locked
    }

    // Reset if window has passed
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