// ============================================================
// Branches.tsx
// Branch list page — super_admin only
// Create, view, soft-delete branches
// ============================================================

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import {
    Button, Input, Modal, ConfirmDialog,
    EmptyState, Spinner, Badge, toast,
} from "../components/UI";
import { sanitizeInput, formatDate } from "../utils/helpers";
import type { Branch } from "../lib/types";

export default function Branches() {
    const { org } = useAuth();

    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [deletingBranch, setDeletingBranch] = useState<Branch | null>(null);
    const [deleting, setDeleting] = useState(false);

    const [form, setForm] = useState({ name: "", address: "" });
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (org) loadBranches();
    }, [org]);

    async function loadBranches() {
        setLoading(true);
        const { data } = await supabase
            .from("branches")
            .select("*")
            .eq("org_id", org!.id)
            .is("deleted_at", null)
            .order("created_at");

        setBranches((data as Branch[]) || []);
        setLoading(false);
    }

    function openNewBranch() {
        setForm({ name: "", address: "" });
        setErrors({});
        setModalOpen(true);
    }

    async function handleCreate() {
        const name = sanitizeInput(form.name);
        const address = sanitizeInput(form.address);

        if (!name) {
            setErrors({ name: "Branch name is required" });
            return;
        }

        setSubmitting(true);

        const { error } = await supabase
            .from("branches")
            .insert({ name, address: address || null, org_id: org!.id });

        if (error) {
            toast.error("Failed to create branch");
        } else {
            toast.success("Branch created! 🏪");
            setModalOpen(false);
            loadBranches();
        }

        setSubmitting(false);
    }

    async function handleSoftDelete() {
        if (!deletingBranch) return;
        setDeleting(true);

        // Use the soft_delete_branch RPC
        const { error } = await supabase.rpc("soft_delete_branch", {
            p_branch_id: deletingBranch.id,
        });

        if (error) {
            if (error.message.includes("BRANCH_HAS_ACTIVE_ORDERS")) {
                toast.error("Complete or cancel all active orders first");
            } else {
                toast.error("Failed to delete branch");
            }
        } else {
            toast.success("Branch removed");
            loadBranches();
        }

        setDeleting(false);
        setDeletingBranch(null);
    }

    if (loading) {
        return (
            <div className="page-container flex items-center justify-center min-h-64">
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">🏪 Branches</h1>
                    <p className="text-gray-500 text-sm mt-1">
                        {branches.length} active branch{branches.length !== 1 ? "es" : ""}
                    </p>
                </div>
                <Button onClick={openNewBranch}>+ Add Branch</Button>
            </div>

            {branches.length === 0 ? (
                <EmptyState
                    icon="🏪"
                    title="No branches yet"
                    description="Create your first branch to start adding tables and staff"
                    action={<Button onClick={openNewBranch}>Create Branch</Button>}
                />
            ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {branches.map((branch) => (
                        <div key={branch.id} className="card hover:shadow-md transition-shadow">
                            {/* Branch avatar */}
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 bg-green-100 rounded-xl flex
                                items-center justify-center text-green-700
                                font-bold text-xl">
                                    {branch.name.charAt(0)}
                                </div>
                                <Badge className="bg-green-100 text-green-700">Active</Badge>
                            </div>

                            <h3 className="font-semibold text-gray-900">{branch.name}</h3>
                            <p className="text-sm text-gray-400 mt-0.5 mb-1">
                                {branch.address || "No address set"}
                            </p>
                            <p className="text-xs text-gray-300">
                                Created {formatDate(branch.created_at)}
                            </p>

                            <div className="flex gap-2 mt-4">
                                <Link
                                    to={`/branches/${branch.id}`}
                                    className="flex-1"
                                >
                                    <Button variant="secondary" size="sm" fullWidth>
                                        Manage →
                                    </Button>
                                </Link>
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => setDeletingBranch(branch)}
                                >
                                    🗑️
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create branch modal */}
            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title="Add New Branch"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreate} loading={submitting}>
                            Create Branch
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <Input
                        label="Branch Name"
                        placeholder="e.g. Osu Branch"
                        value={form.name}
                        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                        error={errors.name}
                        required
                        autoFocus
                    />
                    <Input
                        label="Address"
                        placeholder="e.g. Oxford Street, Osu, Accra"
                        value={form.address}
                        onChange={(e) =>
                            setForm((p) => ({ ...p, address: e.target.value }))
                        }
                        hint="Optional but helpful for staff and customers"
                    />
                </div>
            </Modal>

            {/* Delete confirm */}
            <ConfirmDialog
                open={!!deletingBranch}
                title="Remove Branch"
                message={`Remove "${deletingBranch?.name}"? This cannot be undone. All staff assignments and inventory will be removed. Active orders must be completed first.`}
                confirmText="Remove Branch"
                variant="danger"
                onConfirm={handleSoftDelete}
                onCancel={() => setDeletingBranch(null)}
                loading={deleting}
            />
        </div>
    );
}