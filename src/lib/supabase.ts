// ============================================================
// supabase.ts
// ============================================================

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnon) {
    throw new Error("Application configuration error. Please contact support.");
}

// ── Secure fetch wrapper ──────────────────────────────────────
// Intercepts all SDK HTTP calls.
// Prevents failed requests from logging raw URLs to console.
const silentFetch: typeof fetch = async (input, init) => {
    try {
        return await fetch(input, init);
    } catch (err) {
        if (err instanceof TypeError && err.message === "Failed to fetch") {
            throw new TypeError("Network unavailable");
        }
        throw err;
    }
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnon, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        lock: async (_name, _acquireTimeout, fn) => fn(),
    },
    global: {
        fetch: silentFetch,   // ← add this line only
    },
    realtime: {
        params: {
            eventsPerSecond: 10,
        },
    },
});

// ── Call Edge Functions with explicit auth header ─────────────
// Explicit header prevents ES256 JWT verification errors
// that happen when SDK tries to verify token locally
export async function callFunction<T>(
    name: string,
    payload: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
    try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            return {
                data: null,
                error: "Not logged in. Please sign in again.",
            };
        }

        const { data, error } = await supabase.functions.invoke<T>(name, {
            body: payload,
            headers: {
                // ✅ Explicit token — no SDK auto-attach race condition
                Authorization: `Bearer ${session.access_token}`,
            },
        });

        if (error) {
            const message = await parseEdgeFunctionError(error);
            return { data: null, error: message };
        }

        return { data, error: null };

    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Network error";
        return { data: null, error: message };
    }
}

// ── Parse error body from Edge Function response ──────────────
async function parseEdgeFunctionError(error: unknown): Promise<string> {
    try {
        const context = (error as { context?: Response })?.context;

        if (context && typeof context.json === "function") {
            const body = await context.json() as {
                message?: string;
                error?: string;
            };
            return body?.message || body?.error || "An unexpected error occurred";
        }

        return (error as { message?: string })?.message
            || "An unexpected error occurred";

    } catch {
        return "An unexpected error occurred";
    }
}

// ── Storage helpers ───────────────────────────────────────────

export const PRODUCT_IMAGES_BUCKET = "product-images";

export function getProductImageUrl(orgId: string, productId: string): string {
    const { data } = supabase.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .getPublicUrl(`${orgId}/${productId}.webp`);
    return data.publicUrl;
}

export async function uploadProductImage(
    orgId: string,
    productId: string,
    file: File
): Promise<{ url: string | null; error: string | null }> {
    try {
        if (file.size > 5 * 1024 * 1024) {
            return { url: null, error: "Image must be under 5MB" };
        }

        const allowedTypes = ["image/webp", "image/jpeg", "image/png"];
        if (!allowedTypes.includes(file.type)) {
            return { url: null, error: "Image must be webp, jpg, or png" };
        }

        const compressed = await compressImage(file);
        const path = `${orgId}/${productId}.webp`;

        const { error: uploadError } = await supabase.storage
            .from(PRODUCT_IMAGES_BUCKET)
            .upload(path, compressed, {
                contentType: "image/webp",
                upsert: true,
            });

        if (uploadError) {
            return { url: null, error: uploadError.message };
        }

        const { data } = supabase.storage
            .from(PRODUCT_IMAGES_BUCKET)
            .getPublicUrl(path);

        return {
            url: `${data.publicUrl}?t=${Date.now()}`,
            error: null,
        };
    } catch (err) {
        return {
            url: null,
            error: err instanceof Error ? err.message : "Upload failed",
        };
    }
}

export async function deleteProductImage(
    orgId: string,
    productId: string
): Promise<void> {
    await supabase.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .remove([`${orgId}/${productId}.webp`]);
}

async function compressImage(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);

            const MAX_DIM = 1200;
            let { width, height } = img;

            if (width > MAX_DIM || height > MAX_DIM) {
                if (width > height) {
                    height = Math.round((height * MAX_DIM) / width);
                    width = MAX_DIM;
                } else {
                    width = Math.round((width * MAX_DIM) / height);
                    height = MAX_DIM;
                }
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d");
            if (!ctx) {
                reject(new Error("Canvas context unavailable"));
                return;
            }

            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
                (blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error("Compression failed"));
                },
                "image/webp",
                0.8
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Failed to load image"));
        };

        img.src = url;
    });
}