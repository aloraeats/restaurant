// ============================================================
// types.ts
// Updated for flat-fee billing model.
// Billing: 1 branch = GH₵500/30days, 2+ branches = GH₵1000/branch/30days
// Pro-rated for mid-cycle branch additions and deletions.
// Countdown starts when first branch is created.
// ============================================================

// ── Database Row Types ────────────────────────────────────────

export interface Organization {
    id: string;
    name: string;
    normalized_name: string;
    subscription_status: SubscriptionStatus;
    billing_cycle_start: string | null; // DATE: set when first branch created
    next_invoice_date: string | null; // DATE: billing_cycle_start + 30 days
    created_at: string;
}

export type SubscriptionStatus = "active" | "suspended" | "expired";

export interface Profile {
    id: string;
    email: string;
    full_name: string | null;
    org_id: string | null;
    role: OrgRole;
    created_at: string;
    updated_at: string;
}

export type OrgRole = "super_admin" | "manager" | "staff";

// Subscriptions table still exists in DB but is no longer
// actively used for billing. Kept for future use.
export interface Subscription {
    id: string;
    org_id: string;
    plan_type: PlanType;
    status: SubscriptionStatusDetail;
    branch_count: number;
    amount_paid: number;
    paystack_reference: string | null;
    start_date: string;
    end_date: string;
    created_at: string;
    updated_at: string;
}

export type PlanType = "monthly" | "yearly";
export type SubscriptionStatusDetail =
    "pending" | "active" | "suspended" | "expired";

export interface PaymentHistory {
    id: string;
    subscription_id: string | null;
    org_id: string;
    amount: number;
    paystack_reference: string;
    status: PaymentStatus;
    metadata: Record<string, unknown> | null;
    paid_at: string | null;
    created_at: string;
}

export type PaymentStatus = "pending" | "success" | "failed";

export interface Branch {
    id: string;
    org_id: string;
    name: string;
    address: string | null;
    deleted_at: string | null;
    created_at: string;
    billing_start_date: string | null; // DATE: set when branch created
    billing_end_date: string | null; // DATE: set when branch soft-deleted
}

export interface BranchStaff {
    id: string;
    branch_id: string;
    profile_id: string;
    role: BranchRole;
    created_at: string;
}

export type BranchRole = "kitchen" | "waiter" | "branch_manager";

export interface Category {
    id: string;
    org_id: string;
    name: string;
    sort_order: number;
    created_at: string;
}

export interface Product {
    id: string;
    org_id: string;
    category_id: string;
    name: string;
    description: string | null;
    base_price: number;
    image_url: string | null;
    sort_order: number;
    created_at: string;
}

export interface BranchInventory {
    id: string;
    branch_id: string;
    product_id: string;
    is_available: boolean;
    override_price: number | null;
    created_at: string;
    updated_at: string;
}

export interface RestaurantTable {
    id: string;
    branch_id: string;
    table_name: string;
    qr_identifier: string;
    created_at: string;
}

export interface Order {
    id: string;
    branch_id: string;
    table_id: string;
    session_id: string;
    status: OrderStatus;
    order_type: string;
    notes: string | null;
    total_amount: number;
    created_at: string;
    updated_at: string;
}

export type OrderStatus = "pending" | "preparing" | "served" | "cancelled";

export interface OrderItem {
    id: string;
    order_id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
    notes: string | null;
    created_at: string;
}

export interface AuditLog {
    id: string;
    org_id: string | null;
    actor_id: string | null;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    old_data: Record<string, unknown> | null;
    new_data: Record<string, unknown> | null;
    ip_address: string | null;
    created_at: string;
}

// ── Monthly Invoice ───────────────────────────────────────────
// Generated every 30 days from billing_cycle_start.
// Flat fee model:
//   1 branch  → GH₵500 flat
//   2+ branches → GH₵1,000 × branch count
// Pro-rated for mid-cycle additions and deletions.
// branch_snapshot records every branch's contribution.

export interface MonthlyInvoice {
    id: string;
    org_id: string;
    period_start: string;               // DATE: cycle start
    period_end: string;               // DATE: cycle end
    base_amount: number;               // full-cycle branches cost
    prorated_amount: number;               // mid-cycle additions/deletions
    amount_due: number;               // base_amount + prorated_amount
    status: InvoiceStatus;
    paystack_reference: string | null;
    payment_link: string | null;        // always null — pay via dashboard
    paid_at: string | null;
    due_date: string;               // period_end + 7 days grace
    branch_snapshot: BranchSnapshotItem[]; // per-branch billing breakdown
    created_at: string;
    updated_at: string;
}

export type InvoiceStatus = "unpaid" | "paid" | "overdue" | "waived";

// One entry per branch that was active at any point in the cycle
export interface BranchSnapshotItem {
    branch_id: string;
    branch_name: string;
    days_active: number;   // days within this cycle
    cycle_days: number;   // always 30
    rate: number;   // 500 or 1000 depending on org branch count
    amount: number;   // pro-rated or full amount for this branch
    is_full_cycle: boolean;  // true = active entire cycle
    is_deleted: boolean;  // true = was deleted during cycle
    was_added: boolean;  // true = was added mid-cycle
    action: "base" | "added" | "deleted";
}

// Lightweight version for dashboard invoice list
export interface InvoiceSummary {
    id: string;
    period_start: string;
    period_end: string;
    base_amount: number;
    prorated_amount: number;
    amount_due: number;
    status: InvoiceStatus;
    due_date: string;
    paid_at: string | null;
    paystack_reference: string | null;
    branch_snapshot: BranchSnapshotItem[];
}

// ── Joined / Enriched Types ───────────────────────────────────

export interface ProfileWithBranchRole extends Profile {
    branch_staff: BranchStaff[];
}

export interface BranchWithStaff extends Branch {
    branch_staff: (BranchStaff & { profiles: Profile })[];
}

export interface CategoryWithProducts extends Category {
    products: Product[];
}

export interface ProductWithInventory extends Product {
    branch_inventory: BranchInventory[];
}

export interface OrderWithItems extends Order {
    order_items: (OrderItem & { products: Product })[];
    restaurant_tables: RestaurantTable;
}

// ── Customer Menu Types ───────────────────────────────────────

export interface MenuProduct {
    id: string;
    name: string;
    description: string | null;
    price: number;
    image_url: string | null;
    sort_order: number;
}

export interface MenuCategory {
    id: string;
    name: string;
    sort_order: number;
    products: MenuProduct[];
}

export interface MenuData {
    restaurant: { id: string; name: string };
    branch: { id: string; name: string; address: string | null };
    table: { id: string; name: string; qr_identifier: string };
    categories: MenuCategory[];
}

// ── Cart Types ────────────────────────────────────────────────

export interface CartItem {
    product_id: string;
    name: string;
    price: number;
    quantity: number;
    notes?: string;
    image_url: string | null;
}

// ── Edge Function Response Types ──────────────────────────────

export interface PlaceOrderResponse {
    order_id: string;
    total_amount: number;
    status: OrderStatus;
    message: string;
}

export interface CreateStaffResponse {
    user_id: string;
    email: string;
    full_name: string;
    role: OrgRole;
    branch_role: BranchRole | null;
    branch_id: string | null;
    message: string;
}

// pay-invoice edge function response
// super_admin clicks Pay → redirected to Paystack authorization_url
export interface PayInvoiceResponse {
    authorization_url: string;
    reference: string;
    amount_due: number;
    invoice_id: string;
}

export interface RegenerateQrResponse {
    table_id: string;
    table_name: string;
    qr_identifier: string;
    qr_url: string;
    message: string;
}

export interface EdgeFunctionError {
    error: string;
    message: string;
}

// generate-invoice edge function response
// Used for manual trigger + cron result logging
export interface GenerateInvoiceResponse {
    invoices_generated: number;
    skipped: number;
    failed: number;
    period: string;
    results: Array<{
        org_id: string;
        org_name: string;
        amount_due?: number;
        status: "created" | "skipped" | "failed";
        reason?: string;
    }>;
}

// ── UI State Types ────────────────────────────────────────────

export interface AuthState {
    user: Profile | null;
    org: Organization | null;
    loading: boolean;
}

export type BranchTab = "details" | "staff" | "menu" | "tables";
export type CustomerView = "menu" | "cart" | "confirmation";

export interface SetupStep {
    id: string;
    title: string;
    description: string;
    completed: boolean;
    href: string;
}

// ── Form Types ────────────────────────────────────────────────

export interface CreateStaffForm {
    email: string;
    password: string;
    full_name: string;
    role: OrgRole;
    branch_role?: BranchRole;
    branch_id?: string;
}

export interface CreateProductForm {
    name: string;
    description: string;
    base_price: string;
    category_id: string;
    image?: File;
}

export interface CreateBranchForm {
    name: string;
    address: string;
}

export interface CreateTableForm {
    table_name: string;
    branch_id: string;
}

// ── Supabase Database Type Map ────────────────────────────────

export interface Database {
    public: {
        Tables: {
            organizations: {
                Row: Organization;
                Insert: Omit<Organization, "id" | "created_at" | "normalized_name">;
                Update: Partial<Omit<Organization, "id" | "created_at">>;
            };
            profiles: {
                Row: Profile;
                Insert: Omit<Profile, "created_at" | "updated_at">;
                Update: Partial<Omit<Profile, "id" | "created_at">>;
            };
            subscriptions: {
                Row: Subscription;
                Insert: Omit<Subscription, "id" | "created_at" | "updated_at">;
                Update: Partial<Omit<Subscription, "id" | "created_at">>;
            };
            payment_history: {
                Row: PaymentHistory;
                Insert: Omit<PaymentHistory, "id" | "created_at">;
                Update: Partial<Omit<PaymentHistory, "id" | "created_at">>;
            };
            branches: {
                Row: Branch;
                Insert: Omit<Branch, "id" | "created_at">;
                Update: Partial<Omit<Branch, "id" | "created_at">>;
            };
            branch_staff: {
                Row: BranchStaff;
                Insert: Omit<BranchStaff, "id" | "created_at">;
                Update: Partial<Omit<BranchStaff, "id" | "created_at">>;
            };
            categories: {
                Row: Category;
                Insert: Omit<Category, "id" | "created_at">;
                Update: Partial<Omit<Category, "id" | "created_at">>;
            };
            products: {
                Row: Product;
                Insert: Omit<Product, "id" | "created_at">;
                Update: Partial<Omit<Product, "id" | "created_at">>;
            };
            branch_inventory: {
                Row: BranchInventory;
                Insert: Omit<BranchInventory, "id" | "created_at" | "updated_at">;
                Update: Partial<Omit<BranchInventory, "id" | "created_at">>;
            };
            restaurant_tables: {
                Row: RestaurantTable;
                Insert: Omit<RestaurantTable, "id" | "created_at" | "qr_identifier">;
                Update: Partial<Omit<RestaurantTable, "id" | "created_at">>;
            };
            orders: {
                Row: Order;
                Insert: Omit<Order, "id" | "created_at" | "updated_at">;
                Update: Partial<Omit<Order, "id" | "created_at">>;
            };
            order_items: {
                Row: OrderItem;
                Insert: Omit<OrderItem, "id" | "created_at">;
                Update: never;
            };
            audit_logs: {
                Row: AuditLog;
                Insert: Omit<AuditLog, "id" | "created_at">;
                Update: never;
            };
            monthly_invoices: {
                Row: MonthlyInvoice;
                Insert: Omit<MonthlyInvoice, "id" | "created_at" | "updated_at">;
                Update: Partial<Omit<MonthlyInvoice, "id" | "created_at">>;
            };
        };
        Functions: {
            get_menu_by_qr: {
                Args: { qr_code: string };
                Returns: MenuData;
            };
            soft_delete_branch: {
                Args: { p_branch_id: string };
                Returns: void;
            };
            current_user_org_id: {
                Args: Record<string, never>;
                Returns: string;
            };
            current_user_role: {
                Args: Record<string, never>;
                Returns: string;
            };
        };
    };
}