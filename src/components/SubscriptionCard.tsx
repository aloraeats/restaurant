// ============================================================
// SubscriptionCard.tsx
// Pure 1% usage billing model.
// Shows: current status, this month's GMV estimate,
//        unpaid invoice alert, recent invoice history.
// Pay button lives HERE — no payment links in emails.
// ============================================================

import { useState, useEffect } from "react";
import { supabase, callFunction } from "../lib/supabase";
import { Badge, Button, Spinner } from "./UI";
import { toast } from "./UI";
import {
    subscriptionStatusLabel,
    subscriptionStatusColor,
    formatDate,
    formatCurrency,
} from "../utils/helpers";
import type {
    Organization,
    MonthlyInvoice,
    InvoiceSummary,
    SubscriptionStatus,
    PayInvoiceResponse,
} from "../lib/types";

interface SubscriptionCardProps {
    org: Organization;
}

export default function SubscriptionCard({ org }: SubscriptionCardProps) {
    const [branchCount, setBranchCount]     = useState(0);
    const [invoices, setInvoices]           = useState<InvoiceSummary[]>([]);
    const [thisMonthGmv, setThisMonthGmv]   = useState(0);
    const [loading, setLoading]             = useState(true);
    const [payingId, setPayingId]           = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, [org.id]);

    async function loadData() {
        setLoading(true);
        try {
            const [branchRes, invoiceRes, gmvRes] = await Promise.all([

                // Active branch count
                supabase
                    .from("branches")
                    .select("id", { count: "exact", head: true })
                    .eq("org_id", org.id)
                    .is("deleted_at", null),

                // Last 3 invoices — lightweight select
                supabase
                    .from("monthly_invoices")
                    .select(`
                        id,
                        period_start,
                        period_end,
                        total_qr_orders,
                        total_qr_gmv,
                        usage_fee_total,
                        amount_due,
                        status,
                        due_date,
                        paid_at,
                        paystack_reference
                    `)
                    .eq("org_id", org.id)
                    .order("created_at", { ascending: false })
                    .limit(3),

                // This month's served order GMV
                // Used to show real-time estimate of upcoming invoice
                supabase
                    .from("orders")
                    .select("total_amount, branch_id")
                    .eq("status", "served")
                    .gte(
                        "created_at",
                        new Date(
                            new Date().getFullYear(),
                            new Date().getMonth(),
                            1
                        ).toISOString()
                    ),
            ]);

            setBranchCount(branchRes.count || 0);
            setInvoices((invoiceRes.data as InvoiceSummary[]) || []);

            const gmv = (gmvRes.data || []).reduce(
                (sum, o) => sum + Number(o.total_amount),
                0
            );
            setThisMonthGmv(gmv);

        } catch (err) {
            console.error("SubscriptionCard load error:", err);
        } finally {
            setLoading(false);
        }
    }

    // ── Pay invoice handler ───────────────────────────────────
    // Calls pay-invoice edge function → gets Paystack URL
    // Redirects user to Paystack — PaymentCallback handles return
    async function handlePayInvoice(invoiceId: string) {
        setPayingId(invoiceId);
        try {
            const { data, error } = await callFunction<PayInvoiceResponse>(
                "pay-invoice",
                { invoice_id: invoiceId }
            );

            if (error || !data) {
                toast.error(error || "Failed to initialize payment");
                return;
            }

            // Redirect to Paystack checkout
            // User returns to /payment-callback after paying
            window.location.href = data.authorization_url;

        } catch (err) {
            toast.error("Something went wrong. Please try again.");
        } finally {
            setPayingId(null);
        }
    }

    if (loading) {
        return (
            <div className="card flex items-center justify-center h-32">
                <Spinner />
            </div>
        );
    }

    const status: SubscriptionStatus = org.subscription_status;
    const isExpired   = status === "expired";
    const isSuspended = status === "suspended";
    const isActive    = status === "active";

    // 1% of this month's served GMV so far
    const estimatedUsageFee = thisMonthGmv * 0.01;

    // Days until next invoice
    const nextInvoiceDate = org.next_invoice_date
        ? new Date(org.next_invoice_date)
        : null;
    const daysToNextInvoice = nextInvoiceDate
        ? Math.ceil(
            (nextInvoiceDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          )
        : null;

    // Unpaid or overdue invoice — shown as alert
    const unpaidInvoice = invoices.find(
        (inv) => inv.status === "unpaid" || inv.status === "overdue"
    );

    return (
        <div className={`
            card border-l-4 space-y-5
            ${isExpired   ? "border-l-red-500"    : ""}
            ${isSuspended ? "border-l-yellow-500" : ""}
            ${isActive    ? "border-l-green-500"  : ""}
        `}>

            {/* ── Header ───────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-gray-900">
                            Billing
                        </h3>
                        <Badge className={subscriptionStatusColor(status)}>
                            {subscriptionStatusLabel(status)}
                        </Badge>
                    </div>

                    {/* Status message */}
                    {isActive && (
                        <p className="text-sm text-gray-600">
                            {branchCount} active branch
                            {branchCount !== 1 ? "es" : ""} ·{" "}
                            1% of QR order value monthly
                        </p>
                    )}
                    {isSuspended && (
                        <p className="text-sm text-yellow-700 font-medium">
                            ⚠️ Invoice overdue — pay now to restore orders
                        </p>
                    )}
                    {isExpired && (
                        <p className="text-sm text-red-600 font-medium">
                            🔒 Account expired — pay outstanding invoice
                            to restore access
                        </p>
                    )}
                </div>

                {/* Next invoice date — only when active + no unpaid */}
                {isActive && !unpaidInvoice && daysToNextInvoice !== null && (
                    <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-400">Next invoice</p>
                        <p className="text-sm font-medium text-gray-700">
                            {daysToNextInvoice > 0
                                ? `in ${daysToNextInvoice} day${daysToNextInvoice !== 1 ? "s" : ""}`
                                : "today"
                            }
                        </p>
                    </div>
                )}
            </div>

            {/* ── This month's GMV estimate ─────────────────── */}
            {/* Always show so restaurant sees their usage in real time */}
            <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-500 mb-3
                              uppercase tracking-wide">
                    This period so far
                </p>
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">
                            QR orders value (served)
                        </span>
                        <span className="font-medium">
                            {formatCurrency(thisMonthGmv)}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">
                            Estimated fee (1%)
                        </span>
                        <span className="font-medium text-green-700">
                            {formatCurrency(estimatedUsageFee)}
                        </span>
                    </div>
                </div>
                <p className="text-xs text-gray-400 mt-3">
                    Invoice generated every 30 days from your signup date.
                    Only completed (served) orders count.
                </p>
            </div>

            {/* ── Unpaid invoice alert ──────────────────────── */}
            {/* Pay button lives HERE — never in email */}
            {unpaidInvoice && (
                <div className={`
                    rounded-xl p-4 space-y-3
                    ${unpaidInvoice.status === "overdue"
                        ? "bg-red-50 border border-red-100"
                        : "bg-yellow-50 border border-yellow-100"
                    }
                `}>
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className={`
                                text-sm font-semibold
                                ${unpaidInvoice.status === "overdue"
                                    ? "text-red-700"
                                    : "text-yellow-700"
                                }
                            `}>
                                {unpaidInvoice.status === "overdue"
                                    ? "⚠️ Invoice overdue"
                                    : "📋 Invoice ready"
                                }
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {formatCurrency(unpaidInvoice.amount_due)}{" "}
                                due by {formatDate(unpaidInvoice.due_date)}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {unpaidInvoice.total_qr_orders} orders ·{" "}
                                {formatCurrency(unpaidInvoice.total_qr_gmv)}{" "}
                                GMV
                            </p>
                        </div>

                        {/* Pay button — secure: no external links */}
                        <Button
                            size="sm"
                            onClick={() => handlePayInvoice(unpaidInvoice.id)}
                            loading={payingId === unpaidInvoice.id}
                            disabled={payingId !== null}
                        >
                            Pay {formatCurrency(unpaidInvoice.amount_due)}
                        </Button>
                    </div>

                    {unpaidInvoice.status === "overdue" && (
                        <p className="text-xs text-red-600">
                            Orders are blocked until this invoice is paid.
                            Contact support if you believe this is an error.
                        </p>
                    )}
                </div>
            )}

            {/* ── Recent invoices ───────────────────────────── */}
            {invoices.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2
                                  uppercase tracking-wide">
                        Recent invoices
                    </p>
                    <div className="divide-y divide-gray-100">
                        {invoices.map((inv) => (
                            <div
                                key={inv.id}
                                className="flex items-center justify-between
                                           py-2.5 text-sm"
                            >
                                <div>
                                    <p className="text-gray-700 font-medium">
                                        {formatDate(inv.period_start)}
                                        {" → "}
                                        {formatDate(inv.period_end)}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {inv.total_qr_orders} orders ·{" "}
                                        {formatCurrency(inv.total_qr_gmv)} GMV
                                    </p>
                                </div>
                                <div className="flex items-center gap-2
                                                flex-shrink-0">
                                    <span className="font-medium">
                                        {formatCurrency(inv.amount_due)}
                                    </span>
                                    {inv.status === "paid" && (
                                        <span className="text-xs text-green-600
                                                         font-medium">
                                            ✅ Paid
                                        </span>
                                    )}
                                    {inv.status === "overdue" && (
                                        <Button
                                            size="sm"
                                            onClick={() =>
                                                handlePayInvoice(inv.id)
                                            }
                                            loading={payingId === inv.id}
                                            disabled={payingId !== null}
                                        >
                                            Pay
                                        </Button>
                                    )}
                                    {inv.status === "unpaid" && (
                                        <span className="text-xs text-yellow-600
                                                         font-medium">
                                            ⏳ Unpaid
                                        </span>
                                    )}
                                    {inv.status === "waived" && (
                                        <span className="text-xs text-gray-400
                                                         font-medium">
                                            Waived
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Empty state ───────────────────────────────── */}
            {invoices.length === 0 && isActive && (
                <p className="text-sm text-gray-400 text-center py-2">
                    No invoices yet — your first invoice will be generated
                    {daysToNextInvoice !== null && daysToNextInvoice > 0
                        ? ` in ${daysToNextInvoice} day${daysToNextInvoice !== 1 ? "s" : ""}`
                        : " soon"
                    }.
                </p>
            )}
        </div>
    );
}