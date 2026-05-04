// ============================================================
// useAuth.tsx - FIXED
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
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

interface UseAuthReturn extends AuthState {
    signIn: (opts: SignInOptions) => Promise<{ error: string | null }>;
    signUp: (opts: SignUpOptions) => Promise<{ error: string | null }>;
    signOut: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
    const [state, setState] = useState<AuthState>({
        user: null,
        org: null,
        loading: true,
    });

    // Use a ref to track the current userId being loaded
    // prevents duplicate loads and race conditions
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
            console.warn("Org load warning (may be RLS):", orgError.message);
            setState({ user: profile, org: null, loading: false });
            return;
        }

        setState({
            user: profile,
            org: orgData as Organization,
            loading: false,
        });
    }, []);

    // ── Load profile + org for a user id ──────────────────────
    const loadUserData = useCallback(async (userId: string) => {
        // ✅ Skip if we're already loading this exact user
        if (loadingUserIdRef.current === userId) return;
        loadingUserIdRef.current = userId;

        try {
            const { data: profile, error: profileError } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", userId)
                .single();

            if (profileError || !profile) {
                // PGRST116 = no rows — profile trigger may not have fired yet
                if (profileError?.code === "PGRST116") {
                    console.warn("Profile not ready, retrying in 1s...");
                    await new Promise((r) => setTimeout(r, 1000));

                    const { data: retry, error: retryErr } = await supabase
                        .from("profiles")
                        .select("*")
                        .eq("id", userId)
                        .single();

                    if (retryErr || !retry) {
                        console.error("Profile load failed:", retryErr?.message);
                        setState({ user: null, org: null, loading: false });
                        loadingUserIdRef.current = null;
                        return;
                    }

                    await loadOrgForProfile(retry as Profile);
                    loadingUserIdRef.current = null;
                    return;
                }

                console.error("Profile error:", profileError?.message);
                setState({ user: null, org: null, loading: false });
                loadingUserIdRef.current = null;
                return;
            }

            await loadOrgForProfile(profile as Profile);
        } catch (err) {
            console.error("loadUserData error:", err);
            setState({ user: null, org: null, loading: false });
        } finally {
            loadingUserIdRef.current = null;
        }
    }, [loadOrgForProfile]);

    // ── Auth state listener ───────────────────────────────────
    useEffect(() => {
        let mounted = true;

        // ✅ STEP 1: Set up the listener FIRST before getSession
        // This prevents missing events that fire during getSession
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                if (!mounted) return;
                console.log("Auth event:", event);

                if (event === "SIGNED_OUT") {
                    loadingUserIdRef.current = null;
                    setState({ user: null, org: null, loading: false });
                    return;
                }

                if (
                    (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
                    session?.user
                ) {
                    // loadUserData is deduplicated by ref — safe to call
                    loadUserData(session.user.id);
                    return;
                }

                // INITIAL_SESSION fires once on mount with current session
                if (event === "INITIAL_SESSION") {
                    if (session?.user) {
                        loadUserData(session.user.id);
                    } else {
                        // No session — stop loading immediately
                        setState({ user: null, org: null, loading: false });
                    }
                }
            }
        );

        // ✅ STEP 2: getSession as a fallback for older Supabase versions
        // that don't fire INITIAL_SESSION
        supabase.auth.getSession().then(({ data, error }) => {
            if (!mounted) return;

            if (error) {
                console.error("getSession error:", error.message);
                setState({ user: null, org: null, loading: false });
                return;
            }

            if (data?.session?.user) {
                // loadUserData deduplication handles if INITIAL_SESSION
                // already triggered this
                loadUserData(data.session.user.id);
            } else {
                setState({ user: null, org: null, loading: false });
            }
        }).catch((err) => {
            if (!mounted) return;
            console.error("getSession threw:", err);
            setState({ user: null, org: null, loading: false });
        });

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

                // onAuthStateChange SIGNED_IN handles the rest
                return { error: null };
            } catch (err) {
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
                    if (error.message.includes("already registered")) {
                        return {
                            error: "An account with this email already exists",
                        };
                    }
                    return { error: error.message };
                }

                setState((prev) => ({ ...prev, loading: false }));
                return { error: null };
            } catch (err) {
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
            console.error("Sign out error:", err);
            setState({ user: null, org: null, loading: false });
        }
    }, []);

    return { ...state, signIn, signUp, signOut };
}