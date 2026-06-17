// ============================================================
// src/hooks/useAuth.tsx
// Auth as Context — single instance, no duplicate listeners
// ============================================================

import {
    createContext, useContext, useState,
    useEffect, useCallback, useRef,
    type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import {
    recordLoginAttempt,
    clearLoginAttempts,
    isLoginLocked,
} from "../utils/helpers";
import type { Profile, Organization, AuthState } from "../lib/types";

interface SignInOptions {
    email: string;
    password: string;
    remember_me?: boolean;
}

interface SignUpOptions {
    email: string;
    password: string;
    full_name: string;
    org_name: string;
}

interface AuthContextValue extends AuthState {
    signIn: (opts: SignInOptions) => Promise<{ error: string | null }>;
    signUp: (opts: SignUpOptions) => Promise<{ error: string | null }>;
    signOut: () => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────
const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({
        user: null,
        org: null,
        loading: true,
    });

    // Ref to prevent duplicate concurrent loads for the same userId
    const loadingUserIdRef = useRef<string | null>(null);

    // ── Load org for a profile ────────────────────────────────
    const loadOrgForProfile = useCallback(async (profile: Profile) => {
        if (!profile.org_id) {
            setState({ user: profile, org: null, loading: false });
            return;
        }

        const { data: orgData, error: orgError } = await supabase
            .from("organizations")
            .select("*")
            .eq("id", profile.org_id)
            .single();

        if (orgError) {
            console.warn("Org load warning:", orgError.message);
            setState({ user: profile, org: null, loading: false });
            return;
        }

        setState({
            user: profile,
            org: orgData as Organization,
            loading: false,
        });
    }, []);

    // ── Load profile + org ────────────────────────────────────
    const loadUserData = useCallback(async (userId: string) => {
    if (loadingUserIdRef.current === userId) {
        // SECURITY: DEV guard — this log was added to debug the duplicate
        // loadUserData calls that occurred before the ref guard was added.
        // Kept for regression debugging but hidden in production to avoid
        // exposing user IDs in the console.
        if (import.meta.env.DEV) {
            console.log("loadUserData: skipping duplicate for", userId);
        }
        return;
    }
    loadingUserIdRef.current = userId;
    // ... rest unchanged

        try {
            const { data: profile, error: profileError } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", userId)
                .single();

            if (profileError || !profile) {
                if (profileError?.code === "PGRST116") {
                    console.warn("Profile not ready, retrying in 1s...");
                    await new Promise((r) => setTimeout(r, 1000));

                    const { data: retry, error: retryErr } = await supabase
                        .from("profiles")
                        .select("*")
                        .eq("id", userId)
                        .single();

                    if (retryErr || !retry) {
                        if (import.meta.env.DEV) console.error("Profile load failed:", retryErr?.message);
                        setState({ user: null, org: null, loading: false });
                        return;
                    }
                    await loadOrgForProfile(retry as Profile);
                    return;
                }
                if (import.meta.env.DEV) console.error("Profile error:", profileError?.message);
                setState({ user: null, org: null, loading: false });
                return;
            }

            await loadOrgForProfile(profile as Profile);
        } catch (err) {
            if (import.meta.env.DEV) console.error("loadUserData error:", err);
            setState({ user: null, org: null, loading: false });
        } finally {
            loadingUserIdRef.current = null;
        }
    }, [loadOrgForProfile]);

    // ── Single auth listener — runs once for the whole app ────
useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
            if (!mounted) return;

            // SECURITY: DEV guard — auth event names and session state
            // are useful during local debugging but should not appear
            // in production console where they reveal auth flow details.
            if (import.meta.env.DEV) console.log("Auth event:", event);

            if (event === "SIGNED_OUT") {
                loadingUserIdRef.current = null;
                setState({ user: null, org: null, loading: false });
                return;
            }

            if (event === "INITIAL_SESSION") {
                if (session?.user) {
                    loadUserData(session.user.id);
                } else {
                    setState({ user: null, org: null, loading: false });
                }
                return;
            }

            if (event === "SIGNED_IN" && session?.user) {
                setState((prev) => {
                    if (prev.user?.id === session.user.id && !prev.loading) {
                        // SECURITY: DEV guard — this log was added to debug
                        // the duplicate SIGNED_IN firing issue (now fixed via
                        // Context). Kept for future debugging but hidden in
                        // production to avoid leaking user session state.
                        if (import.meta.env.DEV) {
                            console.log("Auth event: SIGNED_IN skipped — already loaded");
                        }
                        return prev;
                    }
                    loadUserData(session.user.id);
                    return prev;
                });
                return;
            }

            if (event === "TOKEN_REFRESHED" && session?.user) {
                setState((prev) => {
                    if (!prev.user) loadUserData(session.user.id);
                    return prev;
                });
            }
        }
    );

    return () => {
        mounted = false;
        subscription.unsubscribe();
    };
}, [loadUserData]);

    // ── signIn ────────────────────────────────────────────────
    const signIn = useCallback(
        async ({ email, password, remember_me = false }: SignInOptions) => {
            const lockStatus = isLoginLocked();
            if (lockStatus.locked) {
                const minutes = Math.ceil(lockStatus.remainingMs / 60000);
                return {
                    error: `Too many failed attempts. Try again in ${minutes} minute(s).`,
                };
            }

            setState((prev) => ({ ...prev, loading: true }));

            try {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email.trim().toLowerCase(),
                    password,
                });

                if (error) {
                    recordLoginAttempt();
                    setState((prev) => ({ ...prev, loading: false }));
                    if (error.message.includes("Invalid login credentials")) {
                        return { error: "Incorrect email or password" };
                    }
                    if (error.message.includes("Email not confirmed")) {
                        return { error: "Please confirm your email before signing in" };
                    }
                    return { error: error.message };
                }

                clearLoginAttempts();

                if (remember_me && data.session) {
                    localStorage.setItem("remember_me", "true");
                } else {
                    localStorage.removeItem("remember_me");
                }

                return { error: null };
            } catch {
                setState((prev) => ({ ...prev, loading: false }));
                return { error: "Sign in failed. Please try again." };
            }
        },
        []
    );

    // ── signUp ────────────────────────────────────────────────
    const signUp = useCallback(
        async ({ email, password, full_name, org_name }: SignUpOptions) => {
            setState((prev) => ({ ...prev, loading: true }));

            try {
                if (password.length < 8) {
                    setState((prev) => ({ ...prev, loading: false }));
                    return { error: "Password must be at least 8 characters" };
                }

                const { error } = await supabase.auth.signUp({
                    email: email.trim().toLowerCase(),
                    password,
                    options: {
                        data: {
                            org_name: org_name.trim(),
                            full_name: full_name.trim(),
                        },
                        emailRedirectTo: `${window.location.origin}/dashboard`,
                    },
                });

                if (error) {
                    setState((prev) => ({ ...prev, loading: false }));

                    // Supabase wraps trigger errors in the message
                    // Pass the full message so Auth.tsx can parse it
                    if (error.message.includes("already registered")) {
                        return { error: "An account with this email already exists" };
                    }

                    // DB trigger errors come through here
                    // e.g. "ORG_NAME_TAKEN: Restaurant name..."
                    if (error.message.includes("ORG_NAME_TAKEN")) {
                        return { error: "ORG_NAME_TAKEN: " + error.message };
                    }

                    return { error: error.message };
                }

                setState((prev) => ({ ...prev, loading: false }));
                return { error: null };
            } catch {
                setState((prev) => ({ ...prev, loading: false }));
                return { error: "Sign up failed. Please try again." };
            }
        },
        []
    );

    // ── signOut ───────────────────────────────────────────────
    const signOut = useCallback(async () => {
        try {
            setState((prev) => ({ ...prev, loading: true }));
            localStorage.removeItem("remember_me");
            await supabase.auth.signOut();
        } catch (err) {
            if (import.meta.env.DEV) console.error("Sign out error:", err);
            setState({ user: null, org: null, loading: false });
        }
    }, []);

    return (
        <AuthContext.Provider
            value={{ ...state, signIn, signUp, signOut }}
        >
            {children}
        </AuthContext.Provider>
    );
}

// ── Hook ──────────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
    return ctx;
}