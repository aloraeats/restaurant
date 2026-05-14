// src/components/SubscriptionCard.tsx

import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { supabase, callFunction } from "../lib/supabase";
import { formatCurrency } from "../utils/helpers";
import { Button, Badge, Spinner } from "./UI";
import { toast } from "./UI";
import type { MonthlyInvoice } from "../lib/types";

const SINGLE_BRANCH_RATE = 500;
const MULTI_BRANCH_RATE = 1000;
const CYCLE_DAYS = 30;

interface BranchInfo {
    id: string;
    name: string;
    billing_start_date: string | null;
    created_at: string;
}

export default function SubscriptionCard() {
    const { org } = useAuth();

    const [invoices, setInvoices] = useState<MonthlyInvoice[]>([]);
    const [activeBranches, setActiveBranches] = useState<BranchInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [paying, setPaying] = useState<string | null>(null);

    useEffect(() => {
        if (org?.id) loadData();
    }, [org?.id]);

    async function loadData() {
        setLoading(true);
        await Promise.all([loadInvoices(), loadBranches()]);
        setLoading(false);
    }

    async function loadInvoices() {
        const { data } = await supabase
            .from("monthly_invoices")
            .select("*")
            .eq("org_id", org!.id)
            .order("created_at", { ascending: false })
            .limit(5);

        setInvoices((data as MonthlyInvoice[]) || []);
    }

    async function loadBranches() {
        const { data } = await supabase
            .from("branches")
            .select("id, name, billing_start_date, created_at")
            .eq("org_id", org!.id)
            .is("deleted_at", null);

        setActiveBranches((data as BranchInfo[]) || []);
    }

    // ── Estimate current cycle charge ──────────────────────────
    function estimateCurrentCycle() {
        if (!org?.billing_cycle_start || activeBranches.length === 0) {
            return {
                estimatedFee: 0,
                daysIntoCycle: 0,
                nextInvoiceDate: null,
            };
        }

        const today = new Date();
        const cycleStart = new Date(org.billing_cycle_start);
        const nextInvoice = org.next_invoice_date
            ? new Date(org.next_invoice_date)
            : null;

        const daysIntoCycle = Math.floor(
            (today.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)
        ) % CYCLE_DAYS;

        const branchCount = activeBranches.length;
        const isSingleBranch = branchCount === 1;
        const ratePerBranch = isSingleBranch
            ? SINGLE_BRANCH_RATE
            : MULTI_BRANCH_RATE;
        const estimatedFee = isSingleBranch
            ? SINGLE_BRANCH_RATE
            : branchCount * MULTI_BRANCH_RATE;

        return { estimatedFee, daysIntoCycle, nextInvoiceDate: nextInvoice, ratePerBranch };
    }

    // ── Pay invoice ────────────────────────────────────────────
    async function handlePay(invoiceId: string) {
        setPaying(invoiceId);
        try {
            const { data, error } = await callFunction<{
                authorization_url: string | null;
                reference: string | null;
                amount_due: number;
                invoice_id: string;
                message?: string;
            }>("pay-invoice", { invoice_id: invoiceId });

            if (error || !data) {
                toast.error(error || "Failed to initiate payment");
                return;
            }

            // GH₵0 invoice — marked paid automatically, just reload
            if (!data.authorization_url) {
                toast.success("Invoice marked as paid ✅");
                await loadData();
                return;
            }

            // Redirect to Paystack checkout
            window.location.href = data.authorization_url;

        } catch {
            toast.error("Payment initiation failed. Please try again.");
        } finally {
            setPaying(null);
        }
    }

    if (loading) {
        return (
            <div className="card flex items-center justify-center py-8">
                <Spinner size="md" />
            </div>
        );
    }

    const { estimatedFee, daysIntoCycle, nextInvoiceDate, ratePerBranch } =
        estimateCurrentCycle();

    const unpaidInvoices = invoices.filter(
        (i) => i.status === "unpaid" || i.status === "overdue"
    );

    const branchCount = activeBranches.length;
    const isSingleBranch = branchCount === 1;
    const hasNoBranches = branchCount === 0;

    return (
        <div className="card space-y-5">

            {/* ── Header ──────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900 text-lg">
                    Subscription
                </h2>
                <Badge className={
                    org?.subscription_status === "active"
                        ? "bg-green-100 text-green-700"
                        : org?.subscription_status === "suspended"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                }>
                    {org?.subscription_status ?? "unknown"}
                </Badge>
            </div>

            {/* ── No branches yet ──────────────────────────── */}
            {hasNoBranches ? (
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                    <p className="text-2xl mb-2">🏪</p>
                    <p className="text-sm font-medium text-blue-800">
                        No branches yet
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                        Your billing countdown starts when you
                        create your first branch.
                    </p>
                </div>
            ) : (
                <>
                    {/* ── Current plan summary ─────────────── */}
                    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500">
                                Active branches
                            </span>
                            <span className="font-bold text-gray-900">
                                {branchCount}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500">
                                Rate
                            </span>
                            <span className="font-bold text-gray-900">
                                {isSingleBranch
                                    ? `${formatCurrency(SINGLE_BRANCH_RATE)} flat`
                                    : `${formatCurrency(MULTI_BRANCH_RATE)} × ${branchCount} branches`
                                }
                            </span>
                        </div>
                        <div className="flex justify-between items-center
                                        border-t border-gray-200 pt-3">
                            <span className="text-sm font-medium text-gray-700">
                                Next invoice
                            </span>
                            <span className="font-bold text-green-700">
                                {formatCurrency(estimatedFee)}
                            </span>
                        </div>
                        {nextInvoiceDate && (
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-500">
                                    Due date
                                </span>
                                <span className="text-sm font-medium text-gray-700">
                                    {nextInvoiceDate.toLocaleDateString("en-GH", {
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                    })}
                                </span>
                            </div>
                        )}
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500">
                                Days into cycle
                            </span>
                            <span className="text-sm text-gray-700">
                                Day {daysIntoCycle} of {CYCLE_DAYS}
                            </span>
                        </div>
                    </div>

                    {/* ── Pricing note ─────────────────────── */}
                    <p className="text-xs text-gray-400">
                        {isSingleBranch
                            ? `Single branch flat rate: ${formatCurrency(SINGLE_BRANCH_RATE)}/30 days`
                            : `Multi-branch rate: ${formatCurrency(MULTI_BRANCH_RATE)}/branch/30 days`
                        }
                        {" "}· Pro-rated for mid-cycle changes
                    </p>
                </>
            )}

            {/* ── Unpaid invoice alerts ─────────────────────── */}
            {unpaidInvoices.length > 0 && (
                <div className="space-y-3">
                    <p className="text-sm font-semibold text-red-600">
                        ⚠️ Outstanding invoice{unpaidInvoices.length > 1 ? "s" : ""}
                    </p>
                    {unpaidInvoices.map((inv) => (
                        <div key={inv.id}
                            className="border border-red-200 bg-red-50
                                        rounded-xl p-4 space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Period</span>
                                <span className="font-medium">
                                    {new Date(inv.period_start).toLocaleDateString("en-GH", {
                                        day: "numeric", month: "short",
                                    })}
                                    {" → "}
                                    {new Date(inv.period_end).toLocaleDateString("en-GH", {
                                        day: "numeric", month: "short", year: "numeric",
                                    })}
                                </span>
                            </div>

                            {/* Branch breakdown from snapshot */}
                            {inv.branch_snapshot && inv.branch_snapshot.length > 0 && (
                                <div className="space-y-1">
                                    {inv.branch_snapshot.map((b: any, i: number) => (
                                        <div key={i}
                                            className="flex justify-between text-xs
                                                        text-gray-500">
                                            <span>
                                                {b.branch_name}
                                                {b.action === "added" &&
                                                    ` (added, ${b.days_active} days)`}
                                                {b.action === "deleted" &&
                                                    ` (removed, ${b.days_active} days)`}
                                            </span>
                                            <span>{formatCurrency(b.amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex justify-between items-center
                                            border-t border-red-200 pt-2">
                                <div>
                                    <p className="font-bold text-red-700 text-lg">
                                        {formatCurrency(inv.amount_due)}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        Due{" "}
                                        {new Date(inv.due_date).toLocaleDateString("en-GH", {
                                            day: "numeric", month: "short", year: "numeric",
                                        })}
                                        {inv.status === "overdue" && (
                                            <span className="text-red-500 font-medium ml-1">
                                                · OVERDUE
                                            </span>
                                        )}
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    onClick={() => handlePay(inv.id)}
                                    loading={paying === inv.id}
                                >
                                    Pay Now
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Invoice history ───────────────────────────── */}
            {invoices.filter((i) => i.status === "paid").length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-gray-400
                                  uppercase tracking-wide mb-2">
                        Payment History
                    </p>
                    <div className="space-y-2">
                        {invoices
                            .filter((i) => i.status === "paid")
                            .map((inv) => (
                                <div key={inv.id}
                                    className="flex justify-between items-center
                                                text-sm py-2 border-b border-gray-50
                                                last:border-0">
                                    <span className="text-gray-500">
                                        {new Date(inv.period_start).toLocaleDateString("en-GH", {
                                            month: "short", year: "numeric",
                                        })}
                                    </span>
                                    <span className="font-medium text-gray-700">
                                        {formatCurrency(inv.amount_due)}
                                    </span>
                                    <Badge className="bg-green-100 text-green-700 text-xs">
                                        Paid ✓
                                    </Badge>
                                </div>
                            ))}
                    </div>
                </div>
            )}
        </div>
    );
}