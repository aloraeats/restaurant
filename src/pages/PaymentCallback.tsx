// ===========================================================
// PaymentCallback.tsx
// Handles return from Paystack checkout
// Polls subscription status until active or timeout
// ===========================================================

import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button, Spinner } from "../components/UI";
import { useAuth } from "../hooks/useAuth";

type CallbackState = "verifying" | "success" | "failed" | "timeout";

export default function PaymentCallback() {
    const [searchParams] = useSearchParams();
    const { org } = useAuth();
    const navigate = useNavigate();
    const [state, setState] = useState<CallbackState>("verifying");
    const [attempts, setAttempts] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const reference = searchParams.get("reference") || searchParams.get("trxref");
    const MAX_POLLS = 10;
    const POLL_INTERVAL_MS = 3000; // 3 seconds between polls

    useEffect(() => {
        if (!reference) {
            setState("failed");
            return;
        }
        startPolling();
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [reference]);

    function startPolling() {
        // Poll immediately then every 3 seconds
        checkPaymentStatus();
        intervalRef.current = setInterval(() => {
            setAttempts((prev) => {
                if (prev >= MAX_POLLS) {
                    clearInterval(intervalRef.current!);
                    setState("timeout");
                    return prev;
                }
                checkPaymentStatus();
                return prev + 1;
            });
        }, POLL_INTERVAL_MS);
    }

    async function checkPaymentStatus() {
        if (!reference) return;

        // Check payment_history for the reference
        const { data: payment } = await supabase
            .from("payment_history")
            .select("status, subscription_id")
            .eq("paystack_reference", reference)
            .maybeSingle();

        if (payment?.status === "success") {
            clearInterval(intervalRef.current!);
            setState("success");

            // Also check org status updated
            if (org) {
                const { data: updatedOrg } = await supabase
                    .from("organizations")
                    .select("subscription_status")
                    .eq("id", org.id)
                    .single();

                if (updatedOrg?.subscription_status === "active") {
                    // Redirect to dashboard after short delay
                    setTimeout(() => navigate("/dashboard"), 2500);
                }
            } else {
                setTimeout(() => navigate("/dashboard"), 2500);
            }
            return;
        }

        if (payment?.status === "failed") {
            clearInterval(intervalRef.current!);
            setState("failed");
        }

        // If pending or not found — keep polling
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">

                {/* ── Verifying ──────────────────────────────── */}
                {state === "verifying" && (
                    <>
                        <div className="flex justify-center mb-4">
                            <Spinner size="lg" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">
                            Verifying Payment...
                        </h2>
                        <p className="text-gray-500 text-sm mb-2">
                            Please wait while we confirm your payment with Paystack.
                        </p>
                        <p className="text-xs text-gray-300">
                            Check {attempts}/{MAX_POLLS}
                        </p>
                        {/* Progress dots */}
                        <div className="flex justify-center gap-1.5 mt-4">
                            {Array.from({ length: MAX_POLLS }).map((_, i) => (
                                <div
                                    key={i}
                                    className={`
                    w-1.5 h-1.5 rounded-full transition-colors
                    ${i < attempts ? "bg-green-500" : "bg-gray-200"}
                  `}
                                />
                            ))}
                        </div>
                    </>
                )}

                {/* ── Success ────────────────────────────────── */}
                {state === "success" && (
                    <>
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center
                            justify-center mx-auto mb-4 text-3xl">
                            ✅
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">
                            Payment Successful!
                        </h2>
                        <p className="text-gray-500 text-sm mb-6">
                            Your subscription is now active. Redirecting you to the
                            dashboard...
                        </p>
                        <div className="flex justify-center">
                            <Spinner size="sm" />
                        </div>
                        <Button
                            variant="secondary"
                            fullWidth
                            className="mt-4"
                            onClick={() => navigate("/dashboard")}
                        >
                            Go to Dashboard Now
                        </Button>
                    </>
                )}

                {/* ── Failed ─────────────────────────────────── */}
                {state === "failed" && (
                    <>
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center
                            justify-center mx-auto mb-4 text-3xl">
                            ❌
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">
                            Payment Failed
                        </h2>
                        <p className="text-gray-500 text-sm mb-6">
                            Your payment was not successful. No charges were made.
                            Please try again.
                        </p>
                        <div className="space-y-3">
                            <Button
                                fullWidth
                                onClick={() => navigate("/dashboard")}
                            >
                                Try Again
                            </Button>
                            <Button
                                variant="secondary"
                                fullWidth
                                onClick={() => navigate("/dashboard")}
                            >
                                Back to Dashboard
                            </Button>
                        </div>
                    </>
                )}

                {/* ── Timeout ────────────────────────────────── */}
                {state === "timeout" && (
                    <>
                        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center
                            justify-center mx-auto mb-4 text-3xl">
                            ⏳
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">
                            Taking Longer Than Expected
                        </h2>
                        <p className="text-gray-500 text-sm mb-2">
                            Payment verification is taking longer than usual. If your
                            payment was deducted, it will be reflected shortly.
                        </p>
                        <p className="text-xs text-gray-400 mb-6">
                            Reference: <span className="font-mono">{reference}</span>
                        </p>
                        <div className="space-y-3">
                            <Button fullWidth onClick={() => {
                                setAttempts(0);
                                setState("verifying");
                                startPolling();
                            }}>
                                Check Again
                            </Button>
                            <Button
                                variant="secondary"
                                fullWidth
                                onClick={() => navigate("/dashboard")}
                            >
                                Go to Dashboard
                            </Button>
                        </div>
                        <p className="text-xs text-gray-300 mt-4">
                            Contact support if the issue persists.
                            {/* TODO: Add your support email/WhatsApp here */}
                        </p>
                    </>
                )}

            </div>
        </div>
    );
}