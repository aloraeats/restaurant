// ============================================================
// Auth.tsx
// Login + Signup on one page with tabs
// Signup creates a new org (restaurant owner)
// Login for all roles (super_admin, manager, staff)
// ============================================================

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Button, Input } from "../components/UI";
import { toast } from "../components/UI";
import { sanitizeInput, isValidEmail } from "../utils/helpers";

type AuthTab = "login" | "signup";

interface LoginForm {
    email: string;
    password: string;
    remember_me: boolean;
}

interface SignupForm {
    full_name: string;
    org_name: string;
    email: string;
    password: string;
    confirm: string;
}

export default function Auth() {
    const { user, loading, signIn, signUp } = useAuth();
    const navigate = useNavigate();
    const [tab, setTab] = useState<AuthTab>("login");

    // Login form state
    const [loginForm, setLoginForm] = useState<LoginForm>({
        email: "",
        password: "",
        remember_me: false,
    });

    // Signup form state
    const [signupForm, setSignupForm] = useState<SignupForm>({
        full_name: "",
        org_name: "",
        email: "",
        password: "",
        confirm: "",
    });

    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [signupDone, setSignupDone] = useState(false);

    // Redirect if already logged in
    useEffect(() => {
        if (!loading && user) {
            navigate("/dashboard", { replace: true });
        }
    }, [user, loading, navigate]);

    // ── Login ─────────────────────────────────────────────────
    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        setErrors({});

        const email = sanitizeInput(loginForm.email);
        const password = loginForm.password;

        // Client-side validation
        if (!isValidEmail(email)) {
            setErrors({ email: "Enter a valid email address" });
            return;
        }
        if (!password) {
            setErrors({ password: "Password is required" });
            return;
        }

        setSubmitting(true);
        const { error } = await signIn({
            email,
            password,
            remember_me: loginForm.remember_me,
        });
        setSubmitting(false);

        if (error) {
            toast.error(error);
            if (error.toLowerCase().includes("password")) {
                setErrors({ password: error });
            } else {
                setErrors({ email: error });
            }
            return;
        }

        // useAuth's onAuthStateChange handles redirect
        toast.success("Welcome back! 🎉");
    }

    // ── Signup ────────────────────────────────────────────────
    async function handleSignup(e: React.FormEvent) {
        e.preventDefault();
        setErrors({});

        const full_name = sanitizeInput(signupForm.full_name);
        const org_name = sanitizeInput(signupForm.org_name);
        const email = sanitizeInput(signupForm.email);
        const password = signupForm.password;
        const confirm = signupForm.confirm;

        // Validate
        const newErrors: Record<string, string> = {};
        if (!full_name) newErrors.full_name = "Full name is required";
        if (!org_name) newErrors.org_name = "Restaurant name is required";
        if (!isValidEmail(email)) newErrors.email = "Enter a valid email";
        if (password.length < 8) newErrors.password = "Password must be at least 8 characters";
        if (password !== confirm) newErrors.confirm = "Passwords do not match";

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setSubmitting(true);
        const { error } = await signUp({ full_name, org_name, email, password });
        setSubmitting(false);

        if (error) {
            toast.error(error);
            setErrors({ email: error });
            return;
        }

        // Supabase sends confirmation email
        setSignupDone(true);
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="w-8 h-8 border-4 border-green-500 border-t-transparent
                        rounded-full animate-spin" />
            </div>
        );
    }

    // ── Email confirmation sent screen ─────────────────────────
    if (signupDone) {
        return (
            <div className="min-h-screen flex items-center justify-center
                      bg-gradient-to-br from-green-50 to-emerald-100 p-4">
                <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
                    <div className="text-6xl mb-4">📧</div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        Check your email!
                    </h2>
                    <p className="text-gray-500 mb-6">
                        We sent a confirmation link to{" "}
                        <strong>{signupForm.email}</strong>.
                        Click it to activate your account and start your 14-day free trial!
                    </p>
                    <button
                        onClick={() => { setTab("login"); setSignupDone(false); }}
                        className="text-green-600 font-medium hover:underline text-sm"
                    >
                        ← Back to login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center
                    bg-gradient-to-br from-green-50 to-emerald-100 p-4">
            <div className="w-full max-w-md">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="text-5xl mb-3">🍽️</div>
                    <h1 className="text-3xl font-bold text-gray-900">
                        Restaurant Manager
                    </h1>
                    <p className="text-gray-500 mt-1 text-sm">
                        Ghana's restaurant management platform 🇬🇭
                    </p>
                </div>

                {/* Card */}
                <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                    {/* Tabs */}
                    <div className="flex border-b border-gray-100">
                        {(["login", "signup"] as AuthTab[]).map((t) => (
                            <button
                                key={t}
                                onClick={() => { setTab(t); setErrors({}); }}
                                className={`
                  flex-1 py-4 text-sm font-semibold transition-colors capitalize
                  ${tab === t
                                        ? "text-green-700 border-b-2 border-green-500 bg-green-50"
                                        : "text-gray-500 hover:text-gray-700"
                                    }
                `}
                            >
                                {t === "login" ? "Sign In" : "Create Account"}
                            </button>
                        ))}
                    </div>

                    <div className="p-6">
                        {/* ── LOGIN FORM ── */}
                        {tab === "login" && (
                            <form onSubmit={handleLogin} className="space-y-4" noValidate>
                                <Input
                                    label="Email"
                                    type="email"
                                    placeholder="you@restaurant.com"
                                    value={loginForm.email}
                                    onChange={(e) =>
                                        setLoginForm((p) => ({ ...p, email: e.target.value }))
                                    }
                                    error={errors.email}
                                    required
                                    autoComplete="email"
                                    autoFocus
                                />
                                <Input
                                    label="Password"
                                    type="password"
                                    placeholder="••••••••"
                                    value={loginForm.password}
                                    onChange={(e) =>
                                        setLoginForm((p) => ({ ...p, password: e.target.value }))
                                    }
                                    error={errors.password}
                                    required
                                    autoComplete="current-password"
                                />

                                {/* Remember me */}
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={loginForm.remember_me}
                                        onChange={(e) =>
                                            setLoginForm((p) => ({
                                                ...p,
                                                remember_me: e.target.checked,
                                            }))
                                        }
                                        className="w-4 h-4 rounded border-gray-300 text-green-600
                               focus:ring-green-500"
                                    />
                                    <span className="text-sm text-gray-600">
                                        Remember me for 7 days
                                    </span>
                                </label>

                                <Button
                                    type="submit"
                                    fullWidth
                                    size="lg"
                                    loading={submitting}
                                >
                                    Sign In
                                </Button>

                                <p className="text-xs text-center text-gray-400">
                                    Staff? Your admin will share your login credentials.
                                </p>
                            </form>
                        )}

                        {/* ── SIGNUP FORM ── */}
                        {tab === "signup" && (
                            <form onSubmit={handleSignup} className="space-y-4" noValidate>
                                <div className="bg-blue-50 rounded-lg p-3">
                                    <p className="text-xs text-blue-700 font-medium">
                                        🎉 Start your 14-day free trial — no credit card required!
                                    </p>
                                </div>

                                <Input
                                    label="Your Full Name"
                                    type="text"
                                    placeholder="Akosua Mensah"
                                    value={signupForm.full_name}
                                    onChange={(e) =>
                                        setSignupForm((p) => ({ ...p, full_name: e.target.value }))
                                    }
                                    error={errors.full_name}
                                    required
                                    autoComplete="name"
                                    autoFocus
                                />
                                <Input
                                    label="Restaurant Name"
                                    type="text"
                                    placeholder="Akosua Kitchen Ghana"
                                    value={signupForm.org_name}
                                    onChange={(e) =>
                                        setSignupForm((p) => ({ ...p, org_name: e.target.value }))
                                    }
                                    error={errors.org_name}
                                    required
                                    hint="This will be the name customers see on their menu"
                                />
                                <Input
                                    label="Email"
                                    type="email"
                                    placeholder="you@restaurant.com"
                                    value={signupForm.email}
                                    onChange={(e) =>
                                        setSignupForm((p) => ({ ...p, email: e.target.value }))
                                    }
                                    error={errors.email}
                                    required
                                    autoComplete="email"
                                />
                                <Input
                                    label="Password"
                                    type="password"
                                    placeholder="Min. 8 characters"
                                    value={signupForm.password}
                                    onChange={(e) =>
                                        setSignupForm((p) => ({ ...p, password: e.target.value }))
                                    }
                                    error={errors.password}
                                    required
                                    autoComplete="new-password"
                                />
                                <Input
                                    label="Confirm Password"
                                    type="password"
                                    placeholder="Repeat password"
                                    value={signupForm.confirm}
                                    onChange={(e) =>
                                        setSignupForm((p) => ({ ...p, confirm: e.target.value }))
                                    }
                                    error={errors.confirm}
                                    required
                                    autoComplete="new-password"
                                />

                                <Button
                                    type="submit"
                                    fullWidth
                                    size="lg"
                                    loading={submitting}
                                >
                                    Create Account & Start Trial
                                </Button>

                                <p className="text-xs text-center text-gray-400">
                                    By signing up you agree to our Terms of Service.
                                    {/* TODO: Add actual ToS link */}
                                </p>
                            </form>
                        )}
                    </div>
                </div>

                <p className="text-center text-xs text-gray-400 mt-4">
                    GH₵200 per branch/month after trial • Cancel anytime
                </p>
            </div>
        </div>
    );
}