// ============================================================
// PaymentModal.tsx
// New tier-based billing:
// - Tier auto-calculated from branch count
// - Shows BOTH fees: flat + 1% usage
// - No plan type selection (monthly only — invoiced)
// ============================================================

import { useState, useEffect } from "react";
import { Modal, Button, Badge } from "./UI";
import { toast } from "./UI";
import { callFunction, supabase } from "../lib/supabase";
import { formatCurrency } from "../utils/helpers";
import type {
    InitiatePaymentResponse,
    Organization,
    BillingTier,
} from "../lib/types";
import {
    BILLING_TIERS,
    getTierFromBranchCount,
    calculateFlatFee,
} from "../lib/types";

interface PaymentModalProps {
    open: boolean;
    onClose: () => void;
    org: Organization;
}

export default function PaymentModal({
    open,
    onClose,
    org,
}: PaymentModalProps) {
    const [branchCount, setBranchCount] = useState(1);
    const [loadingBranches, setLoadingBranches] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // ── Fetch real branch count ───────────────────────────────
    useEffect(() => {
        if (!open) return;

        async function fetchBranches() {
            setLoadingBranches(true);

            const { count } = await supabase
                .from("branches")
                .select("id", { count: "exact", head: true })
                .eq("org_id", org.id)
                .is("deleted_at", null);

            setBranchCount(count || 1);
            setLoadingBranches(false);
        }

        fetchBranches();
    }, [open, org.id]);

    // ── Derived values — all from branch count ────────────────
    const tier: BillingTier = getTierFromBranchCount(branchCount);
    const tierConfig = BILLING_TIERS[tier];
    const flatFee = calculateFlatFee(branchCount);

    // Usage fee example (1% of estimated monthly GMV)
    // We show this as an estimate — actual charged monthly via invoice
    const usageFeePercent = tierConfig.usage_percent;

    // ── Pay handler ───────────────────────────────────────────
    async function handlePay() {
        setSubmitting(true);

        try {
            const { data, error } = await callFunction<InitiatePaymentResponse>(
                "initiate-payment",
                { branch_count: branchCount }
            );

            if (error || !data) {
                toast.error(error || "Failed to initialize payment");
                return;
            }

            // Redirect to Paystack — PaymentCallback handles return
            window.location.href = data.authorization_url;

        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Activate Your Subscription"
            size="md"
        >
            <div className="space-y-5">

                {/* ── Your tier ──────────────────────────────── */}
                <div className="bg-gray-50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-sm text-gray-500">Your plan tier</p>
                        <Badge className={tierConfig.color}>
                            {tierConfig.label}
                        </Badge>
                    </div>
                    <p className="text-xs text-gray-400">
                        Based on your {loadingBranches ? "..." : branchCount} active
                        branch{branchCount !== 1 ? "es" : ""} →
                        tier auto-upgrades as you grow
                    </p>
                </div>

                {/* ── Tier comparison ────────────────────────── */}
                <div className="grid grid-cols-3 gap-2">
                    {(Object.entries(BILLING_TIERS) as [BillingTier, typeof BILLING_TIERS[BillingTier]][])
                        .map(([tierKey, config]) => {
                            const isCurrentTier = tierKey === tier;
                            return (
                                <div
                                    key={tierKey}
                                    className={`
                                        rounded-xl border-2 p-3 text-center
                                        transition-all
                                        ${isCurrentTier
                                            ? "border-green-500 bg-green-50"
                                            : "border-gray-100 bg-white opacity-60"
                                        }
                                    `}
                                >
                                    <p className={`text-xs font-semibold mb-1 ${isCurrentTier
                                            ? "text-green-700"
                                            : "text-gray-500"
                                        }`}>
                                        {config.label}
                                    </p>
                                    <p className={`text-sm font-bold ${isCurrentTier
                                            ? "text-green-800"
                                            : "text-gray-700"
                                        }`}>
                                        {formatCurrency(config.flat_per_branch)}
                                    </p>
                                    <p className="text-xs text-gray-400">
                                        /branch/mo
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        {config.branch_range}
                                    </p>
                                </div>
                            );
                        })}
                </div>

                {/* ── How billing works ──────────────────────── */}
                <div className="rounded-xl border border-gray-100 divide-y
                               divide-gray-100 overflow-hidden">

                    {/* Fee 1: Flat fee */}
                    <div className="flex items-start justify-between p-4">
                        <div>
                            <p className="text-sm font-medium text-gray-900">
                                📋 Monthly flat fee
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {formatCurrency(tierConfig.flat_per_branch)} ×{" "}
                                {loadingBranches ? "..." : branchCount} branch
                                {branchCount !== 1 ? "es" : ""}
                            </p>
                        </div>
                        <p className="text-sm font-bold text-gray-900">
                            {loadingBranches
                                ? "..."
                                : formatCurrency(flatFee)
                            }
                        </p>
                    </div>

                    {/* Fee 2: Usage fee */}
                    <div className="flex items-start justify-between p-4 bg-gray-50">
                        <div>
                            <p className="text-sm font-medium text-gray-900">
                                📊 Monthly usage fee
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {usageFeePercent}% of total QR orders value
                            </p>
                            <p className="text-xs text-gray-400">
                                Calculated at end of each month
                            </p>
                        </div>
                        <p className="text-sm font-bold text-gray-900">
                            {usageFeePercent}%
                        </p>
                    </div>

                    {/* Total */}
                    <div className="flex items-center justify-between p-4">
                        <div>
                            <p className="text-sm font-bold text-gray-900">
                                Due today
                            </p>
                            <p className="text-xs text-gray-400">
                                Flat fee only — usage fee invoiced monthly
                            </p>
                        </div>
                        <p className="text-lg font-bold text-green-700">
                            {loadingBranches
                                ? "..."
                                : formatCurrency(flatFee)
                            }
                        </p>
                    </div>
                </div>

                {/* ── Usage fee example ──────────────────────── */}
                <div className="rounded-xl bg-blue-50 p-4">
                    <p className="text-xs font-semibold text-blue-700 mb-2">
                        💡 How the usage fee works
                    </p>
                    <p className="text-xs text-blue-600">
                        If your restaurant processes GH₵10,000 in orders
                        through our QR system this month, the usage fee is{" "}
                        <strong>GH₵100</strong> (1%).
                        We send you an invoice at the start of next month.
                        You pay it, we keep running. Simple.
                    </p>
                </div>

                {/* ── Security note ───────────────────────────── */}
                <p className="text-xs text-gray-400 text-center">
                    🔒 Secured by Paystack · Only flat fee charged today ·
                    Usage fee invoiced monthly
                </p>

                {/* ── Pay button ──────────────────────────────── */}
                <Button
                    fullWidth
                    size="lg"
                    onClick={handlePay}
                    loading={submitting}
                    disabled={loadingBranches}
                >
                    Pay {loadingBranches ? "..." : formatCurrency(flatFee)} →
                    Activate {tierConfig.label}
                </Button>

            </div>
        </Modal>
    );
}