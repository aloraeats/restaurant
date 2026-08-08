// ============================================================
// A4Invoice.tsx
// Formal A4 invoice layout — for testing without thermal printer
// or printing official tax invoices on standard office paper.
// ============================================================

import { forwardRef } from "react";
import { formatCurrency, stripMetadataFromNotes } from "../utils/helpers";
import type { Order, OrderItem, Product, RestaurantTable } from "../lib/types";

type OrderWithDetails = Order & {
    order_items: (OrderItem & { products: Product })[];
    restaurant_tables: RestaurantTable;
};

interface A4InvoiceProps {
    order: OrderWithDetails;
    orgVatRate: number;
}

const A4Invoice = forwardRef<HTMLDivElement, A4InvoiceProps>(
    ({ order, orgVatRate }, ref) => {
        const grossTotal = order.total_amount;
        const vatComponent = grossTotal * (orgVatRate / (1 + orgVatRate));
        const netTotal = grossTotal - vatComponent;
        const cleanNotes = stripMetadataFromNotes(order.notes);

        const dateFormatted = new Date(order.created_at).toLocaleDateString("en-GH", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });

        return (
            <div ref={ref} className="a4-invoice-root">
                {/* Inject A4-specific print styles — only active during @media print */}
                <style>{`
                    @media screen {
                        .a4-invoice-root { display: none !important; }
                    }
                    @media print {
                        body * {
                            visibility: hidden !important;
                        }
                        .a4-invoice-root, .a4-invoice-root * {
                            visibility: visible !important;
                        }
                        .a4-invoice-root {
                            position: absolute !important;
                            left: 0 !important;
                            top: 0 !important;
                            width: 210mm !important;
                            min-height: 297mm !important;
                            padding: 20mm 25mm !important;
                            margin: 0 !important;
                            background: #ffffff !important;
                            font-family: 'Inter', Arial, Helvetica, sans-serif !important;
                            font-size: 11pt !important;
                            line-height: 1.5 !important;
                            color: #111111 !important;
                        }
                        .a4-invoice-root h1 {
                            font-size: 22pt !important;
                            font-weight: 800 !important;
                            margin: 0 0 2pt 0 !important;
                            letter-spacing: 1pt !important;
                        }
                        .a4-invoice-root h2 {
                            font-size: 14pt !important;
                            font-weight: 700 !important;
                            margin: 0 0 12pt 0 !important;
                        }
                        .a4-invoice-root table {
                            width: 100% !important;
                            border-collapse: collapse !important;
                            margin: 16pt 0 !important;
                        }
                        .a4-invoice-root th {
                            background: #f5f5f5 !important;
                            font-weight: 600 !important;
                            font-size: 10pt !important;
                            text-align: left !important;
                            padding: 8pt 10pt !important;
                            border: 1pt solid #ddd !important;
                        }
                        .a4-invoice-root td {
                            padding: 8pt 10pt !important;
                            border: 1pt solid #ddd !important;
                            font-size: 10.5pt !important;
                        }
                        .a4-invoice-root .total-row td {
                            font-weight: 700 !important;
                            font-size: 12pt !important;
                            border-top: 2pt solid #111 !important;
                        }
                        .a4-invoice-root .footer {
                            position: absolute !important;
                            bottom: 20mm !important;
                            left: 25mm !important;
                            right: 25mm !important;
                            border-top: 1pt solid #ddd !important;
                            padding-top: 10pt !important;
                            text-align: center !important;
                            font-size: 9pt !important;
                            color: #666 !important;
                        }
                        @page {
                            margin: 0 !important;
                            size: A4 !important;
                        }
                    }
                `}</style>

                {/* ── Header ───────────────────────────────────── */}
                <div style={{ textAlign: "center", marginBottom: "24pt" }}>
                    <h1>ALORA EAT</h1>
                    <p style={{ fontSize: "10pt", color: "#666", margin: "4pt 0 0 0" }}>
                        Ghana's Favorite Multi-Branch Diner
                    </p>
                </div>

                <hr style={{ border: "none", borderTop: "2pt solid #111", margin: "0 0 16pt 0" }} />

                {/* ── Invoice Metadata ─────────────────────────── */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "20pt",
                        fontSize: "10pt",
                    }}
                >
                    <div>
                        <p style={{ margin: "2pt 0" }}>
                            <strong>Invoice #:</strong> {order.id.slice(0, 8).toUpperCase()}
                        </p>
                        <p style={{ margin: "2pt 0" }}>
                            <strong>Date:</strong> {dateFormatted}
                        </p>
                        <p style={{ margin: "2pt 0" }}>
                            <strong>Order Type:</strong>{" "}
                            {order.order_type.replace("_", " ").toUpperCase()}
                        </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                        <p style={{ margin: "2pt 0" }}>
                            <strong>Station:</strong>{" "}
                            {order.restaurant_tables?.table_name || "TAKEOUT"}
                        </p>
                        <p style={{ margin: "2pt 0" }}>
                            <strong>Order ID:</strong> #{order.id.slice(0, 4).toUpperCase()}
                        </p>
                    </div>
                </div>

                {/* ── Items Table ──────────────────────────────── */}
                <table>
                    <thead>
                        <tr>
                            <th style={{ width: "50%" }}>Item</th>
                            <th style={{ width: "10%", textAlign: "center" }}>Qty</th>
                            <th style={{ width: "18%", textAlign: "right" }}>Unit Price</th>
                            <th style={{ width: "22%", textAlign: "right" }}>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {order.order_items.map((item) => (
                            <tr key={item.id}>
                                <td>
                                    {item.products?.name}
                                    {item.notes && (
                                        <span
                                            style={{
                                                fontSize: "9pt",
                                                color: "#888",
                                                fontStyle: "italic",
                                                display: "block",
                                                marginTop: "2pt",
                                            }}
                                        >
                                            * {item.notes}
                                        </span>
                                    )}
                                </td>
                                <td style={{ textAlign: "center" }}>{item.quantity}</td>
                                <td style={{ textAlign: "right" }}>
                                    {formatCurrency(item.unit_price)}
                                </td>
                                <td style={{ textAlign: "right" }}>
                                    {formatCurrency(item.unit_price * item.quantity)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* ── Totals ───────────────────────────────────── */}
                <div
                    style={{
                        width: "55%",
                        marginLeft: "auto",
                        marginTop: "4pt",
                        fontSize: "10.5pt",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "3pt 0",
                        }}
                    >
                        <span>Subtotal (excl. VAT):</span>
                        <span style={{ fontWeight: 500 }}>{formatCurrency(netTotal)}</span>
                    </div>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "3pt 0",
                            borderTop: "1pt solid #ddd",
                        }}
                    >
                        <span>VAT ({(orgVatRate * 100).toFixed(1)}% Incl.):</span>
                        <span style={{ fontWeight: 500 }}>{formatCurrency(vatComponent)}</span>
                    </div>
                    <div
                        className="total-row"
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "6pt 0",
                            borderTop: "2pt solid #111",
                            fontWeight: 700,
                            fontSize: "13pt",
                        }}
                    >
                        <span>Total Due:</span>
                        <span>{formatCurrency(grossTotal)}</span>
                    </div>
                </div>

                {/* ── Notes ────────────────────────────────────── */}
                {cleanNotes && (
                    <div
                        style={{
                            marginTop: "20pt",
                            padding: "10pt 14pt",
                            background: "#f9f9f9",
                            border: "1pt solid #ddd",
                            borderRadius: "3pt",
                        }}
                    >
                        <p style={{ fontWeight: 600, fontSize: "10pt", margin: "0 0 4pt 0" }}>
                            Notes:
                        </p>
                        <p style={{ fontSize: "10pt", margin: 0, lineHeight: 1.4 }}>
                            {cleanNotes}
                        </p>
                    </div>
                )}

                {/* ── Footer ───────────────────────────────────── */}
                <div className="footer">
                    <p style={{ margin: "0 0 2pt 0" }}>
                        Thank you for your patronage!
                    </p>
                    <p style={{ margin: 0, fontSize: "8pt", color: "#999" }}>
                        Alora Eat — Multi-Branch Dining &bull; Tax Invoice &bull; E&amp;OE
                    </p>
                </div>
            </div>
        );
    }
);

A4Invoice.displayName = "A4Invoice";

export default A4Invoice;