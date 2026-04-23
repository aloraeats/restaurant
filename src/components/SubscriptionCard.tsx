// ============================================================
// SubscriptionCard.tsx
// Updated for tier-based billing.
// Shows tier, flat fee, estimated usage fee, invoice history.
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { Badge, Button, Spinner } from "./UI";
import {
    subscriptionStatusLabel,
    subscriptionStatusColor,
    formatDate,
    daysUntil,
    formatCurrency,
} from "../utils/helpers";
import type {
    Organization,
    MonthlyInvoice,
    SubscriptionStatus,
    BillingTier,
} from "../lib/types";
import {
    BILLING_TIERS,
    getTierFromBranchCount,
    calculateFlatFee,
} from "../lib/types";

interface SubscriptionCardProps {
    org: Organization;
    onPayClick: () => void;
}

export default function SubscriptionCard({
    org,
    onPayClick,
}: SubscriptionCardProps) {
    const [branchCount, setBranchCount] = useState(0);
    const [invoices, setInvoices] = useState<MonthlyInvoice[]>([]);
    const [thisMonthGmv, setThisMonthGmv] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, [org.id]);

    async function loadData() {
        setLoading(true);

        try {
            // Fetch branch count, invoices, and this month's GMV in parallel
            const [branchRes, invoiceRes, gmvRes] = await Promise.all([

                // Branch count
                supabase
                    .from("branches")
                    .select("id", { count: "exact", head: true })
                    .eq("org_id", org.id)
                    .is("deleted_at", null),

                // Last 3 invoices
                supabase
                    .from("monthly_invoices")
                    .select("*")
                    .eq("org_id", org.id)
                    .order("created_at", { ascending: false })
                    .limit(3),

                // This month's QR order GMV (served orders only)
                supabase
                    .from("orders")
                    .select("total_amount")
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
            setInvoices((invoiceRes.data as MonthlyInvoice[]) || []);

            const gmv = (gmvRes.data || []).reduce(
                (sum, o) => sum + Number(o.total_amount), 0
            );
            setThisMonthGmv(gmv);

        } catch (err) {
            console.error("SubscriptionCard load error:", err);
        } finally {
            setLoading(false);
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
    const tier: BillingTier = getTierFromBranchCount(branchCount);
    const tierConfig = BILLING_TIERS[tier];
    const flatFee = calculateFlatFee(branchCount);
    const estimatedUsageFee = thisMonthGmv * 0.01;
    const estimatedTotal = flatFee + estimatedUsageFee;

    const isTrial = status === "trial";
    const isExpired = status === "expired";
    const isSuspended = status === "suspended";
    const isActive = status === "active";

    // Trial progress — now 30 days
    const trialDaysLeft = daysUntil(org.trial_ends_at);
    const totalTrialDays = org.trial_days || 30;
    const trialDaysUsed = totalTrialDays - trialDaysLeft;

    // Unpaid invoice
    const unpaidInvoice = invoices.find(
        (inv) => inv.status === "unpaid" || inv.status === "overdue"
    );

    return (
        <div className={`
            card border-l-4 space-y-5
            ${isExpired ? "border-l-red-500" : ""}
            ${isSuspended ? "border-l-yellow-500" : ""}
            ${isTrial ? "border-l-blue-500" : ""}
            ${isActive ? "border-l-green-500" : ""}
        `}>

            {/* ── Header row ───────────────────────────────── */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-gray-900">
                            Subscription
                        </h3>
                        <Badge className={subscriptionStatusColor(status)}>
                            {subscriptionStatusLabel(status)}
                        </Badge>
                        <Badge className={tierConfig.color}>
                            {tierConfig.label}
                        </Badge>
                    </div>

                    {/* Status-specific messages */}
                    {isTrial && (
                        <p className="text-sm text-gray-600">
                            {trialDaysLeft > 0
                                ? `Free trial — ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} remaining`
                                : "Your free trial has ended"
                            }
                        </p>
                    )}
                    {isActive && (
                        <p className="text-sm text-gray-600">
                            {branchCount} branch{branchCount !== 1 ? "es" : ""} ·{" "}
                            {tierConfig.label} tier
                        </p>
                    )}
                    {isSuspended && (
                        <p className="text-sm text-yellow-700 font-medium">
                            ⚠️ Payment overdue — 14-day grace period active
                        </p>
                    )}
                    {isExpired && (
                        <p className="text-sm text-red-600 font-medium">
                            🔒 Subscription expired — renew to restore access
                        </p>
                    )}
                </div>

                {/* CTA button */}
                <div className="flex-shrink-0">
                    {(isTrial || isExpired || isSuspended) && (
                        <Button onClick={onPayClick} size="sm">
                            {isExpired || isSuspended ? "Renew Now" : "Activate"}
                        </Button>
                    )}
                    {isActive && (
                        <Button
                            onClick={onPayClick}
                            variant="secondary"
                            size="sm"
                        >
                            Manage
                        </Button>
                    )}
                </div>
            </div>

            {/* ── Trial progress bar ────────────────────────── */}
            {isTrial && trialDaysLeft > 0 && (
                <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Trial progress</span>
                        <span>
                            {trialDaysUsed}/{totalTrialDays} days used
                        </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{
                                width: `${Math.min(
                                    100,
                                    (trialDaysUsed / totalTrialDays) * 100
                                )}%`,
                            }}
                        />
                    </div>
                </div>
            )}

            {/* ── This month's billing estimate ─────────────── */}
            {(isActive || isTrial) && (
                <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-500 mb-3 uppercase
                                  tracking-wide">
                        This month's estimate
                    </p>
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">
                                Flat fee ({branchCount} branch
                                {branchCount !== 1 ? "es" : ""} ×{" "}
                                {formatCurrency(tierConfig.flat_per_branch)})
                            </span>
                            <span className="font-medium">
                                {formatCurrency(flatFee)}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">
                                Usage fee (1% of{" "}
                                {formatCurrency(thisMonthGmv)} QR orders)
                            </span>
                            <span className="font-medium">
                                {formatCurrency(estimatedUsageFee)}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm font-bold
                                        pt-2 border-t border-gray-200">
                            <span>Estimated total</span>
                            <span className="text-green-700">
                                {formatCurrency(estimatedTotal)}
                            </span>
                        </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                        Usage fee invoiced on 1st of next month
                    </p>
                </div>
            )}

            {/* ── Unpaid invoice alert ──────────────────────── */}
            {unpaidInvoice && (
                <div className={`
                    rounded-xl p-4 flex items-center justify-between gap-3
                    ${unpaidInvoice.status === "overdue"
                        ? "bg-red-50 border border-red-100"
                        : "bg-yellow-50 border border-yellow-100"
                    }
                `}>
                    <div>
                        <p className={`text-sm font-semibold ${unpaidInvoice.status === "overdue"
                                ? "text-red-700"
                                : "text-yellow-700"
                            }`}>
                            {unpaidInvoice.status === "overdue"
                                ? "⚠️ Invoice overdue!"
                                : "📋 Invoice ready"
                            }
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {formatCurrency(unpaidInvoice.amount_due)} due by{" "}
                            {formatDate(unpaidInvoice.due_date)}
                        </p>
                    </div>
                    {unpaidInvoice.payment_link && (
                        <a
                            href={unpaidInvoice.payment_link}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-shrink-0 px-3 py-1.5 text-xs font-medium
                                       bg-green-600 text-white rounded-lg
                                       hover:bg-green-700 transition-colors"
                        >
                            Pay now →
                        </a>
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
                    <div className="space-y-2">
                        {invoices.map((inv) => (
                            <div
                                key={inv.id}
                                className="flex items-center justify-between
                                           text-sm py-1"
                            >
                                <div>
                                    <span className="text-gray-700">
                                        {new Date(inv.period_start)
                                            .toLocaleDateString("en-GH", {
                                                month: "long",
                                                year: "numeric",
                                            })
                                        }
                                    </span>
                                    <span className="text-xs text-gray-400 ml-2">
                                        {inv.total_qr_orders} orders
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">
                                        {formatCurrency(inv.amount_due)}
                                    </span>
                                    {inv.status === "paid" && (
                                        <span className="text-xs text-green-600">
                                            ✅
                                        </span>
                                    )}
                                    {inv.status === "overdue" && (
                                        <span className="text-xs text-red-600">
                                            ⚠️
                                        </span>
                                    )}
                                    {inv.status === "unpaid" && (
                                        <span className="text-xs text-yellow-600">
                                            ⏳
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}