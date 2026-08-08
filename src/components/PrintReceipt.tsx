import { useAuth } from "../hooks/useAuth";
import { parseOrderTypeFromNotes, stripMetadataFromNotes, formatCurrency } from "../utils/helpers";
import type { Order, OrderItem, Product, RestaurantTable } from "../lib/types";

type OrderWithDetails = Order & {
    order_items: (OrderItem & { products: Product })[];
    restaurant_tables: RestaurantTable;
};

interface PrintReceiptProps {
    order: OrderWithDetails;
    orgVatRate: number; // Configurable tax rate, e.g. 0.185 (18.5%)
    userBranchRole: string | null; // replaces the email-based role guess
}


export default function PrintReceipt({ order, orgVatRate, userBranchRole }: PrintReceiptProps) {
    const { user } = useAuth();
    
    // Resolve user's contextual printing view mode
    const role = user?.role; // 'super_admin' | 'manager' | 'staff'

    const printMode: "customer" | "kitchen" | "waiter" =
    (role === "super_admin" || role === "manager" || userBranchRole === "branch_manager" || userBranchRole === "cashier")
        ? "customer"
        : userBranchRole === "waiter"
        ? "waiter"
        : "kitchen";
    const dateFormatted = new Date(order.created_at).toLocaleString("en-GH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    });

    const parsedLocation = parseOrderTypeFromNotes(order.notes, order.order_type);
    const cleanNotes = stripMetadataFromNotes(order.notes);

    // Back-out VAT component calculations (Tax inclusive: Gross * (rate / (1+rate)))
    const grossTotal = order.total_amount;
    const vatComponent = grossTotal * (orgVatRate / (1 + orgVatRate));
    const netTotal = grossTotal - vatComponent;

    return (
        <>
            {/* Global injection of styling applied STRICTLY during printer media rendering loops */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media screen {
                    #thermal-receipt-output { display: none !important; }
                }
                @media print {
                    /* Hide everything else on screen */
                    body * {
                        visibility: hidden !important;
                    }
                    /* Render standard thermal receipts page only */
                    #thermal-receipt-output, #thermal-receipt-output * {
                        visibility: visible !important;
                    }
                    #thermal-receipt-output {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 80mm !important; /* Targets standard 80mm/58mm thermal devices */
                        padding: 2mm !important;
                        margin: 0 !important;
                        font-family: 'Courier New', Courier, monospace !important;
                        font-size: 12px !important;
                        line-height: 1.3 !important;
                        color: #000000 !important;
                        background: #ffffff !important;
                    }
                    @page {
                        margin: 0 !important;
                        size: auto !important;
                    }
                }
            `}} />

            <div id="thermal-receipt-output" className="text-black bg-white p-2">
                {/* ── CUSTOMER VIEW (Full pricing details + tax invoice compliance) ── */}
                {printMode === "customer" && (
                    <div className="text-center">
                        <p className="font-bold text-base uppercase tracking-wider">ALORA EAT</p>
                        <p className="text-[10px] leading-tight">Ghana's Favorite Multi-Branch Diner</p>
                        <p className="text-[10px]">{dateFormatted}</p>
                        <p className="border-b border-dashed border-black my-2"></p>
                        
                        <div className="text-left space-y-0.5 text-xs">
                            <p><span className="font-bold">Order ID:</span> #{order.id.slice(0, 8).toUpperCase()}</p>
                            <p><span className="font-bold">Service:</span> {parsedLocation.replace("_", " ").toUpperCase()}</p>
                            <p><span className="font-bold">Station:</span> {order.restaurant_tables?.table_name || "TAKEOUT SCREEN"}</p>
                        </div>

                        <p className="border-b border-dashed border-black my-2"></p>

                        {/* Items Grid */}
                        <div className="text-left space-y-1.5 text-xs">
                            {order.order_items.map((item) => (
                                <div key={item.id}>
                                    <div className="flex justify-between">
                                        <span>{item.quantity}x {item.products?.name}</span>
                                        <span>{formatCurrency(item.unit_price * item.quantity)}</span>
                                    </div>
                                    {item.notes && <p className="text-[10px] italic pl-2">* {item.notes}</p>}
                                </div>
                            ))}
                        </div>

                        <p className="border-b border-dashed border-black my-2"></p>

                        {/* Financial calculation blocks */}
                        <div className="text-right space-y-0.5 text-xs">
                            <p>Subtotal: {formatCurrency(netTotal)}</p>
                            <p>VAT ({(orgVatRate * 100).toFixed(1)}% Incl): {formatCurrency(vatComponent)}</p>
                            <p className="font-bold text-sm">TOTAL PAID: {formatCurrency(grossTotal)}</p>
                        </div>

                        {cleanNotes && (
                            <div className="text-left mt-2 p-1 border border-black text-[10px]">
                                <p className="font-bold">Notes:</p>
                                <p>{cleanNotes}</p>
                            </div>
                        )}

                        <p className="border-b border-dashed border-black my-2"></p>
                        <p className="text-[10px] italic">Thank you for dining with us!</p>
                    </div>
                )}

                {/* ── WAITER VIEW (Table Session Summary - Hides all prices) ── */}
                {printMode === "waiter" && (
                    <div>
                        <p className="text-center font-bold text-sm uppercase">WAITERS RUNNING SLIP</p>
                        <p className="text-center text-[10px]">{dateFormatted}</p>
                        <p className="border-b border-dashed border-black my-2"></p>
                        
                        <div className="space-y-0.5 text-xs">
                            <p><span className="font-bold">Station:</span> {order.restaurant_tables?.table_name || "TAKEOUT SCREEN"}</p>
                            <p><span className="font-bold">Runner ID:</span> {user?.full_name?.toUpperCase()}</p>
                            <p><span className="font-bold">Order ID:</span> #{order.id.slice(0, 8).toUpperCase()}</p>
                        </div>

                        <p className="border-b border-dashed border-black my-2"></p>

                        {/* Items Grid */}
                        <div className="space-y-1 text-xs">
                            {order.order_items.map((item) => (
                                <div key={item.id} className="flex justify-between font-bold">
                                    <span>[ ] {item.quantity}x {item.products?.name}</span>
                                </div>
                            ))}
                        </div>

                        {cleanNotes && (
                            <div className="mt-3 p-1.5 border border-dashed border-black text-xs">
                                <p className="font-bold">Modifications:</p>
                                <p className="italic">{cleanNotes}</p>
                            </div>
                        )}
                        <p className="border-b border-dashed border-black my-3"></p>
                        <p className="text-[10px] text-center font-mono">Verify order checklist matches table layout before serving.</p>
                    </div>
                )}

                {/* ── KITCHEN VIEW (Preparation Ticket - Large high-contrast items list) ── */}
                {printMode === "kitchen" && (
                    <div>
                        <div className="text-center">
                            <p className="font-black text-base uppercase">🍳 KITCHEN TICKET 🍳</p>
                            <p className="text-[10px]">{dateFormatted}</p>
                        </div>
                        <p className="border-b-2 border-black my-2"></p>

                        <div className="text-sm space-y-1">
                            <p><span className="font-bold">STATION:</span> {order.restaurant_tables?.table_name || "TAKEOUT KI"}</p>
                            <p><span className="font-bold">SERVICE:</span> {parsedLocation.replace("_", " ").toUpperCase()}</p>
                            <p><span className="font-bold">TICKET NO:</span> #{order.id.slice(0, 4).toUpperCase()}</p>
                        </div>

                        <p className="border-b-2 border-black my-2"></p>

                        {/* High-visibility items layout */}
                        <div className="space-y-3">
                            {order.order_items.map((item) => (
                                <div key={item.id} className="border-b border-dashed border-gray-300 pb-2 last:border-0">
                                    <div className="flex justify-between text-base font-black">
                                        <span>▶ {item.quantity}x {item.products?.name.toUpperCase()}</span>
                                    </div>
                                    {item.notes && (
                                        <div className="bg-black text-white px-2 py-0.5 mt-1 rounded text-xs font-bold font-mono">
                                            MOD: {item.notes.toUpperCase()}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <p className="border-b-2 border-black my-2"></p>

                        {cleanNotes && (
                            <div className="p-2 bg-gray-100 border border-black rounded text-xs font-bold">
                                <p className="text-red-700">⚠️ GENERAL TICKET INSTRUCTIONS:</p>
                                <p className="text-sm font-mono mt-0.5">{cleanNotes.toUpperCase()}</p>
                            </div>
                        )}
                        <p className="text-xs text-center font-bold mt-2">--- FOOD PREP ONLY ---</p>
                    </div>
                )}
            </div>
        </>
    );
}