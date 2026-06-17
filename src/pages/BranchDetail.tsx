// ============================================================
// BranchDetail.tsx
// 4 tabs: Details | Staff | Menu (inventory) | Tables
// QR print: uses canvas.toDataURL() — no external API, no load delay
// ============================================================

import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase, callFunction } from "../lib/supabase";
import {
    Button, Input, Modal, ConfirmDialog,
    Spinner, Badge, Toggle, TabBar, EmptyState, toast,
} from "../components/UI";
import { sanitizeInput, formatCurrency, buildQrUrl } from "../utils/helpers";
import type {
    Branch, Profile, BranchStaff, Product,
    BranchInventory, RestaurantTable,
    CreateStaffResponse, RegenerateQrResponse,
} from "../lib/types";

// ── Staff row ─────────────────────────────────────────────────
function StaffRow({
    profile,
    branchRole,
    onRemove,
}: {
    profile: Profile;
    branchRole: string;
    onRemove: () => void;
}) {
    const roleColors: Record<string, string> = {
        branch_manager: "bg-purple-100 text-purple-700",
        kitchen: "bg-orange-100 text-orange-700",
        waiter: "bg-blue-100 text-blue-700",
    };

    return (
        <div className="flex items-center justify-between py-3
                        border-b border-gray-50 last:border-0">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-green-100 flex items-center
                                justify-center text-green-700 font-bold text-sm">
                    {profile.full_name?.charAt(0).toUpperCase() || "?"}
                </div>
                <div>
                    <p className="text-sm font-medium text-gray-900">
                        {profile.full_name || "Unknown"}
                    </p>
                    <p className="text-xs text-gray-400">{profile.email}</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Badge className={roleColors[branchRole] || "bg-gray-100 text-gray-600"}>
                    {branchRole.replace("_", " ")}
                </Badge>
                <Button size="sm" variant="danger" onClick={onRemove}>
                    Remove
                </Button>
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────
export default function BranchDetail() {
    const { id } = useParams<{ id: string }>();
    const { user, org } = useAuth();
    const navigate = useNavigate();

    const [branch, setBranch] = useState<Branch | null>(null);
    const [activeTab, setActiveTab] = useState("details");
    const [loading, setLoading] = useState(true);

    // ── Staff state ───────────────────────────────────────────
    const [staffList, setStaffList] = useState<
        (BranchStaff & { profiles: Profile })[]
    >([]);
    const [staffModal, setStaffModal] = useState(false);
    const [staffForm, setStaffForm] = useState({
        email: "", password: "", full_name: "",
        branch_role: "kitchen" as "kitchen" | "waiter" | "branch_manager",
    });
    const [staffErrors, setStaffErrors] = useState<Record<string, string>>({});
    const [creatingStaff, setCreatingStaff] = useState(false);
    const [removingStaff, setRemovingStaff] = useState<string | null>(null);

    // ── Inventory state ───────────────────────────────────────
    const [inventory, setInventory] = useState<
        (BranchInventory & { products: Product })[]
    >([]);
    const [savingInv, setSavingInv] = useState<string | null>(null);

    // ── Tables state ──────────────────────────────────────────
    const [tables, setTables] = useState<RestaurantTable[]>([]);
    const [tableModal, setTableModal] = useState(false);
    const [tableForm, setTableForm] = useState({ table_name: "" });
    const [tableErrors, setTableErrors] = useState<Record<string, string>>({});
    const [creatingTable, setCreatingTable] = useState(false);
    const [regeneratingQr, setRegeneratingQr] = useState<string | null>(null);
    const [deleteTable, setDeleteTable] = useState<RestaurantTable | null>(null);
    const [deletingTable, setDeletingTable] = useState(false);

    // ── Hidden QR canvas refs for printing ───────────────────
    // One hidden <QRCodeCanvas> is rendered per table (off-screen).
    // On print, we grab its canvas element and call toDataURL()
    // to get a base64 PNG — no network request, no load delay.
    const qrWrapperRefs = useRef<Record<string, HTMLDivElement | null>>({});

    // ── Load all data ─────────────────────────────────────────
    useEffect(() => {
        if (id && (org || user)) loadAll();
    }, [id, org, user?.id]);

    async function loadAll() {
        setLoading(true);
        await Promise.all([
            loadBranch(),
            loadStaff(),
            loadInventory(),
            loadTables(),
        ]);
        setLoading(false);
    }

    async function loadBranch() {
        const query = supabase
            .from("branches")
            .select("*")
            .eq("id", id!)
            .is("deleted_at", null);

        if (org?.id) query.eq("org_id", org.id);

        const { data, error } = await query.single();
        if (error || !data) { navigate("/branches"); return; }
        setBranch(data as Branch);
    }

    async function loadStaff() {
        const { data } = await supabase
            .from("branch_staff")
            .select("*, profiles(*)")
            .eq("branch_id", id!);
        setStaffList((data as any) || []);
    }

    async function loadInventory() {
        const { data } = await supabase
            .from("branch_inventory")
            .select("*, products(*)")
            .eq("branch_id", id!)
            .order("products(name)");
        setInventory((data as any) || []);
    }

    async function loadTables() {
        const { data } = await supabase
            .from("restaurant_tables")
            .select("*")
            .eq("branch_id", id!)
            .order("table_name");
        setTables((data as RestaurantTable[]) || []);
    }

    // ── Print QR ──────────────────────────────────────────────
    // Strategy:
    //   1. Each table card renders a hidden <QRCodeCanvas> (400×400px,
    //      positioned off-screen via the hidden wrapper div).
    //   2. On print click, we find that canvas, call .toDataURL("image/png")
    //      to get a base64 string — this is instant, no network needed.
    //   3. We open a print window and embed the PNG as a data: URL directly
    //      in the <img src>. The image is already fully loaded before
    //      window.print() is called — no broken image.
    const handlePrintQr = useCallback((table: RestaurantTable) => {
        const menuUrl = buildQrUrl(table.qr_identifier);

        // Grab the hidden wrapper div for this table
        const wrapper = qrWrapperRefs.current[table.id];
        const canvas = wrapper?.querySelector("canvas") as HTMLCanvasElement | null;

        if (!canvas) {
            // Fallback: canvas not mounted yet (shouldn't happen after loadTables)
            toast.error("QR not ready — please try again");
            return;
        }

        // Convert canvas pixels → base64 PNG (synchronous, instant)
        const pngDataUrl = canvas.toDataURL("image/png");

        const printWindow = window.open("", "_blank");
        if (!printWindow) {
            toast.error("Please allow popups to print QR codes");
            return;
        }

        // Embed PNG as data: URL — no network request in print window
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>QR Code — ${table.table_name}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                        font-family: -apple-system, BlinkMacSystemFont,
                                     'Segoe UI', sans-serif;
                        background: #fff;
                        padding: 24px;
                    }
                    .card {
                        text-align: center;
                        padding: 36px 40px;
                        border: 3px solid #111;
                        border-radius: 20px;
                        width: 300px;
                    }
                    .restaurant {
                        font-size: 12px;
                        color: #888;
                        letter-spacing: 0.05em;
                        text-transform: uppercase;
                        margin-bottom: 4px;
                    }
                    .table-name {
                        font-size: 26px;
                        font-weight: 700;
                        color: #111;
                        margin-bottom: 20px;
                    }
                    /* data: URL image — already loaded, prints perfectly */
                    .qr-img {
                        width: 200px;
                        height: 200px;
                        display: block;
                        margin: 0 auto;
                        image-rendering: crisp-edges;
                        image-rendering: pixelated;
                    }
                    .scan-hint {
                        margin-top: 18px;
                        font-size: 14px;
                        color: #444;
                        font-weight: 500;
                    }
                    .url {
                        margin-top: 10px;
                        font-size: 9px;
                        color: #bbb;
                        word-break: break-all;
                        font-family: monospace;
                    }
                    @media print {
                        body { padding: 0; }
                        .card { border: 3px solid #111; }
                        /* Force black ink for QR */
                        .qr-img { -webkit-print-color-adjust: exact;
                                  print-color-adjust: exact; }
                    }
                </style>
            </head>
            <body>
                <div class="card">
                    <p class="restaurant">${branch?.name ?? "Restaurant"}</p>
                    <p class="table-name">${table.table_name}</p>

                    <!--
                        src is a base64 PNG generated from the canvas.
                        It is embedded in this HTML string — the browser
                        does NOT make a network request to load it.
                        It is 100% ready when window.print() fires.
                    -->
                    <img
                        class="qr-img"
                        src="${pngDataUrl}"
                        alt="QR Code for ${table.table_name}"
                    />

                    <p class="scan-hint">📱 Scan to order</p>
                    <p class="url">${menuUrl}</p>
                </div>

                <script>
                    setTimeout(function () {
                        window.print();
                        window.onafterprint = function () { window.close(); };
                    }, );
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }, [branch]);

    // ── Staff handlers ────────────────────────────────────────
    async function handleCreateStaff() {
        const email = sanitizeInput(staffForm.email);
        const full_name = sanitizeInput(staffForm.full_name);
        const password = staffForm.password;
        const branch_role = staffForm.branch_role;

        const errs: Record<string, string> = {};
        if (!email) errs.email = "Email is required";
        if (!full_name) errs.full_name = "Full name is required";
        if (!password || password.length < 6) errs.password = "Min 6 characters";
        if (Object.keys(errs).length) { setStaffErrors(errs); return; }

        setStaffErrors({});
        setCreatingStaff(true);

        try {
            const { data, error } = await callFunction<CreateStaffResponse>(
                "create-staff",
                { email, password, full_name, role: "staff", branch_role, branch_id: id }
            );

            if (error) { toast.error(error); return; }
            if (!data) { toast.error("Something went wrong — please try again"); return; }

            toast.success(`${full_name} added as ${branch_role.replace("_", " ")}! 🎉`);
            setStaffModal(false);
            setStaffForm({ email: "", password: "", full_name: "", branch_role: "kitchen" });
            await loadStaff();
        } catch (err) {
            console.error("handleCreateStaff:", err);
            toast.error("An unexpected error occurred");
        } finally {
            setCreatingStaff(false);
        }
    }

    async function handleRemoveStaff(branchStaffId: string) {
        setRemovingStaff(branchStaffId);
        const { error } = await supabase
            .from("branch_staff").delete().eq("id", branchStaffId);
        if (error) toast.error("Failed to remove staff member");
        else { toast.success("Staff member removed"); loadStaff(); }
        setRemovingStaff(null);
    }

    // ── Inventory handlers ────────────────────────────────────
    async function toggleAvailability(invId: string, current: boolean) {
        setSavingInv(invId);
        const { error } = await supabase
            .from("branch_inventory")
            .update({ is_available: !current })
            .eq("id", invId);

        if (error) toast.error("Failed to update availability");
        else setInventory((prev) =>
            prev.map((inv) =>
                inv.id === invId ? { ...inv, is_available: !current } : inv
            )
        );
        setSavingInv(null);
    }

    async function updateOverridePrice(invId: string, value: string) {
        const price = value === "" ? null : parseFloat(value);
        if (price !== null && (isNaN(price) || price < 0)) return;

        const { error } = await supabase
            .from("branch_inventory")
            .update({ override_price: price })
            .eq("id", invId);

        if (error) toast.error("Failed to update price");
        else { toast.success("Price updated"); loadInventory(); }
    }

    // ── Table handlers ────────────────────────────────────────
    async function handleCreateTable() {
        const table_name = sanitizeInput(tableForm.table_name);
        if (!table_name) {
            setTableErrors({ table_name: "Table name is required" });
            return;
        }

        setCreatingTable(true);
        const { error } = await supabase
            .from("restaurant_tables")
            .insert({ table_name, branch_id: id });

        if (error) toast.error("Failed to create table");
        else {
            toast.success("Table created with QR code! 📱");
            setTableModal(false);
            setTableForm({ table_name: "" });
            loadTables();
        }
        setCreatingTable(false);
    }

    async function handleRegenerateQr(tableId: string) {
        setRegeneratingQr(tableId);
        const { data, error } = await callFunction<RegenerateQrResponse>(
            "regenerate-qr", { table_id: tableId }
        );

        if (error || !data) toast.error(error || "Failed to regenerate QR code");
        else { toast.success("QR regenerated! Old QR is now invalid ✅"); loadTables(); }
        setRegeneratingQr(null);
    }

    async function handleDeleteTable() {
        if (!deleteTable) return;
        setDeletingTable(true);

        const { error } = await supabase
            .from("restaurant_tables").delete().eq("id", deleteTable.id);

        if (error) {
            if (error.code === "23503")
                toast.error("Cannot delete — table has order history");
            else
                toast.error("Failed to delete table");
        } else {
            toast.success("Table deleted");
            loadTables();
        }

        setDeletingTable(false);
        setDeleteTable(null);
    }

    // ── Render ────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="page-container flex items-center justify-center min-h-64">
                <Spinner size="lg" />
            </div>
        );
    }

    if (!branch) return null;

    const tabs = [
        { id: "details", label: "Details", icon: "ℹ️" },
        { id: "staff", label: "Staff", icon: "👥" },
        { id: "menu", label: "Menu", icon: "🍽️" },
        { id: "tables", label: "Tables", icon: "📱" },
    ];

    return (
        <div className="page-container">

            {/*
                ── Hidden QR canvases (off-screen) ──────────────────────
                Rendered for every table. Each one produces a real
                <canvas> element with the QR pixels already drawn.
                handlePrintQr() reads .toDataURL() from these.
                They are invisible to the user (left: -9999px).
            */}
            <div
                aria-hidden="true"
                style={{
                    position: "fixed", left: "-9999px", top: "-9999px",
                    pointerEvents: "none", opacity: 0
                }}
            >
                {tables.map((table) => (
                    <div
                        key={table.id}
                        ref={(el) => { qrWrapperRefs.current[table.id] = el; }}
                    >
                        <QRCodeCanvas
                            value={buildQrUrl(table.qr_identifier)}
                            size={400}
                            level="H"
                            bgColor="#ffffff"
                            fgColor="#000000"
                        />
                    </div>
                ))}
            </div>

            {/* ── Header ──────────────────────────────────── */}
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={() => navigate("/branches")}
                    className="text-gray-400 hover:text-gray-600 p-2 rounded-lg
                               hover:bg-gray-100 transition-colors"
                >
                    ← Back
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">{branch.name}</h1>
                    <p className="text-gray-400 text-sm">{branch.address || "No address"}</p>
                </div>
                <Badge className="bg-green-100 text-green-700 ml-auto">Active</Badge>
            </div>

            {/* ── Tabs ────────────────────────────────────── */}
            <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

            <div className="mt-6">

                {/* ════════════════════════════════════════════
                    DETAILS TAB
                ════════════════════════════════════════════ */}
                {activeTab === "details" && (
                    <div className="max-w-lg space-y-6">
                        <div className="card space-y-4">
                            <h2 className="font-semibold text-gray-900">
                                Branch Information
                            </h2>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-gray-400">Name</p>
                                    <p className="font-medium">{branch.name}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400">Address</p>
                                    <p className="font-medium">{branch.address || "—"}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400">Staff count</p>
                                    <p className="font-medium">{staffList.length}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400">Tables</p>
                                    <p className="font-medium">{tables.length}</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <div className="card text-center p-4">
                                <p className="text-2xl font-bold text-green-700">
                                    {inventory.filter((i) => i.is_available).length}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">Items available</p>
                            </div>
                            <div className="card text-center p-4">
                                <p className="text-2xl font-bold text-gray-900">
                                    {tables.length}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">Tables</p>
                            </div>
                            <div className="card text-center p-4">
                                <p className="text-2xl font-bold text-gray-900">
                                    {staffList.length}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">Staff</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* ════════════════════════════════════════════
                    STAFF TAB
                ════════════════════════════════════════════ */}
                {activeTab === "staff" && (
                    <div className="max-w-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-sm text-gray-500">
                                {staffList.length} staff member
                                {staffList.length !== 1 ? "s" : ""}
                            </p>
                            {["super_admin", "manager"].includes(user?.role || "") && (
                                <Button size="sm" onClick={() => setStaffModal(true)}>
                                    + Add Staff
                                </Button>
                            )}
                        </div>

                        <div className="card">
                            {staffList.length === 0 ? (
                                <EmptyState
                                    icon="👥"
                                    title="No staff assigned"
                                    description="Add kitchen and waiter staff to this branch"
                                    action={
                                        <Button size="sm" onClick={() => setStaffModal(true)}>
                                            Add Staff
                                        </Button>
                                    }
                                />
                            ) : (
                                staffList.map((bs) => (
                                    <StaffRow
                                        key={bs.id}
                                        profile={bs.profiles}
                                        branchRole={bs.role}
                                        onRemove={() => handleRemoveStaff(bs.id)}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* ════════════════════════════════════════════
                    MENU / INVENTORY TAB
                ════════════════════════════════════════════ */}
                {activeTab === "menu" && (
                    <div>
                        <p className="text-sm text-gray-500 mb-4">
                            Toggle items on/off for this branch. Set a custom price
                            to override the base price.
                        </p>

                        {inventory.length === 0 ? (
                            <EmptyState
                                icon="🍽️"
                                title="No products found"
                                description="Add products in Menu Management first"
                            />
                        ) : (
                            <div className="card overflow-hidden p-0">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 border-b border-gray-100">
                                        <tr>
                                            <th className="text-left px-4 py-3 text-xs font-semibold
                                                           text-gray-500 uppercase tracking-wide">
                                                Product
                                            </th>
                                            <th className="text-center px-4 py-3 text-xs font-semibold
                                                           text-gray-500 uppercase tracking-wide">
                                                Available
                                            </th>
                                            <th className="text-right px-4 py-3 text-xs font-semibold
                                                           text-gray-500 uppercase tracking-wide">
                                                Base Price
                                            </th>
                                            <th className="text-right px-4 py-3 text-xs font-semibold
                                                           text-gray-500 uppercase tracking-wide">
                                                Branch Price
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {inventory.map((inv) => (
                                            <tr key={inv.id}
                                                className="hover:bg-gray-50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3">
                                                        {inv.products?.image_url ? (
                                                            <img
                                                                src={inv.products.image_url}
                                                                alt={inv.products.name}
                                                                className="w-8 h-8 rounded-lg object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-8 h-8 bg-gray-100 rounded-lg
                                                                            flex items-center justify-center
                                                                            text-sm">
                                                                🍽️
                                                            </div>
                                                        )}
                                                        <span className="font-medium text-gray-900">
                                                            {inv.products?.name}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <Toggle
                                                        checked={inv.is_available}
                                                        onChange={() =>
                                                            toggleAvailability(inv.id, inv.is_available)
                                                        }
                                                        disabled={savingInv === inv.id}
                                                    />
                                                </td>
                                                <td className="px-4 py-3 text-right text-gray-500">
                                                    {formatCurrency(inv.products?.base_price || 0)}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        placeholder="Same as base"
                                                        defaultValue={
                                                            inv.override_price !== null
                                                                ? String(inv.override_price)
                                                                : ""
                                                        }
                                                        onBlur={(e) =>
                                                            updateOverridePrice(inv.id, e.target.value)
                                                        }
                                                        className="w-28 text-right border border-gray-200
                                                                   rounded-lg px-2 py-1 text-sm
                                                                   focus:outline-none focus:ring-1
                                                                   focus:ring-green-500"
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ════════════════════════════════════════════
                    TABLES TAB
                ════════════════════════════════════════════ */}
                {activeTab === "tables" && (
                    <div className="max-w-4xl">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-sm text-gray-500">
                                {tables.length} table{tables.length !== 1 ? "s" : ""}
                            </p>
                            <Button size="sm" onClick={() => setTableModal(true)}>
                                + Add Table
                            </Button>
                        </div>

                        {tables.length === 0 ? (
                            <EmptyState
                                icon="📱"
                                title="No tables yet"
                                description="Add tables to generate QR codes for customers"
                                action={
                                    <Button size="sm" onClick={() => setTableModal(true)}>
                                        Add Table
                                    </Button>
                                }
                            />
                        ) : (
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {tables.map((table) => {
                                    const menuUrl = buildQrUrl(table.qr_identifier);
                                    return (
                                        <div key={table.id} className="card text-center">

                                            {/* Visible SVG QR — crisp on screen */}
                                            <div className="flex justify-center mb-3">
                                                <div className="p-3 bg-white border-2
                                                                border-gray-100 rounded-xl
                                                                inline-block">
                                                    <QRCodeSVG
                                                        value={menuUrl}
                                                        size={160}
                                                        level="H"
                                                        includeMargin={false}
                                                    />
                                                </div>
                                            </div>

                                            <p className="font-semibold text-gray-900">
                                                {table.table_name}
                                            </p>
                                            <p className="text-xs font-mono text-gray-400
                                                          mt-0.5 mb-4">
                                                {table.qr_identifier}
                                            </p>

                                            {/* Actions */}
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    fullWidth
                                                    onClick={() => handlePrintQr(table)}
                                                >
                                                    🖨️ Print
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => {
                                                        if (navigator.clipboard && window.isSecureContext) {
                                                            navigator.clipboard.writeText(menuUrl);
                                                        } else {
                                                            const el = document.createElement("textarea");
                                                            el.value = menuUrl;
                                                            el.style.position = "fixed";
                                                            el.style.left = "-9999px";
                                                            document.body.appendChild(el);
                                                            el.select();
                                                            document.execCommand("copy");
                                                            document.body.removeChild(el);
                                                        }
                                                        toast.success("URL copied!");
                                                    }}
                                                >
                                                    📋
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => handleRegenerateQr(table.id)}
                                                    loading={regeneratingQr === table.id}
                                                >
                                                    🔄
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="danger"
                                                    onClick={() => setDeleteTable(table)}
                                                >
                                                    🗑️
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

            </div>{/* end tab content */}

            {/* ── Add Staff Modal ──────────────────────────── */}
            <Modal
                open={staffModal}
                onClose={() => setStaffModal(false)}
                title="Add Staff Member"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setStaffModal(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreateStaff} loading={creatingStaff}>
                            Create Account
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <Input
                        label="Full Name"
                        placeholder="Kwame Darko"
                        value={staffForm.full_name}
                        onChange={(e) =>
                            setStaffForm((p) => ({ ...p, full_name: e.target.value }))
                        }
                        error={staffErrors.full_name}
                        required
                        autoFocus
                    />
                    <Input
                        label="Email"
                        type="email"
                        placeholder="staff@restaurant.com"
                        value={staffForm.email}
                        onChange={(e) =>
                            setStaffForm((p) => ({ ...p, email: e.target.value }))
                        }
                        error={staffErrors.email}
                        required
                    />
                    <Input
                        label="Temporary Password"
                        type="password"
                        placeholder="Min 6 characters"
                        value={staffForm.password}
                        onChange={(e) =>
                            setStaffForm((p) => ({ ...p, password: e.target.value }))
                        }
                        error={staffErrors.password}
                        hint="Staff should change this after first login"
                        required
                    />
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">
                            Role <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={staffForm.branch_role}
                            onChange={(e) =>
                                setStaffForm((p) => ({
                                    ...p,
                                    branch_role: e.target.value as typeof staffForm.branch_role,
                                }))
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2
                                       text-sm focus:outline-none focus:ring-2
                                       focus:ring-green-500 bg-white"
                        >
                            <option value="kitchen">Kitchen Staff</option>
                            <option value="waiter">Waiter</option>
                            {user?.role === "super_admin" && (
                                <option value="branch_manager">Branch Manager</option>
                            )}
                        </select>
                    </div>
                </div>
            </Modal>

            {/* ── Add Table Modal ──────────────────────────── */}
            <Modal
                open={tableModal}
                onClose={() => setTableModal(false)}
                title="Add Table"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setTableModal(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreateTable} loading={creatingTable}>
                            Create Table
                        </Button>
                    </>
                }
            >
                <Input
                    label="Table Name"
                    placeholder="e.g. Table 5 or VIP Booth 1"
                    value={tableForm.table_name}
                    onChange={(e) => setTableForm({ table_name: e.target.value })}
                    error={tableErrors.table_name}
                    required
                    autoFocus
                    hint="A QR code will be automatically generated"
                />
            </Modal>

            {/* ── Delete Table Confirm ─────────────────────── */}
            <ConfirmDialog
                open={!!deleteTable}
                title="Delete Table"
                message={`Delete "${deleteTable?.table_name}"? This will fail if the table has order history.`}
                confirmText="Delete"
                variant="danger"
                onConfirm={handleDeleteTable}
                onCancel={() => setDeleteTable(null)}
                loading={deletingTable}
            />
        </div>
    );
}