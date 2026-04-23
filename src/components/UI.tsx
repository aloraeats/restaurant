// ============================================================
// UI.tsx
// Reusable primitive components — the building blocks
// Button, Input, Select, Modal, Badge, Spinner, Toast, etc.
// ============================================================

import React, { useEffect, useRef, useState } from "react";

// ── Button ────────────────────────────────────────────────────

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "danger" | "ghost";
    size?: "sm" | "md" | "lg";
    loading?: boolean;
    fullWidth?: boolean;
}

export function Button({
    variant = "primary",
    size = "md",
    loading = false,
    fullWidth = false,
    children,
    className = "",
    disabled,
    ...props
}: ButtonProps) {
    const base = "inline-flex items-center justify-center font-medium rounded-lg \
transition-all duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 \
disabled:opacity-50 disabled:cursor-not-allowed gap-2";

    const variants = {
        primary: "bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-500",
        secondary: "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 \
                focus-visible:ring-gray-400",
        danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
        ghost: "text-gray-600 hover:bg-gray-100 focus-visible:ring-gray-400",
    };

    const sizes = {
        sm: "px-3 py-1.5 text-sm",
        md: "px-4 py-2 text-sm",
        lg: "px-6 py-3 text-base",
    };

    return (
        <button
            className={`
        ${base}
        ${variants[variant]}
        ${sizes[size]}
        ${fullWidth ? "w-full" : ""}
        ${className}
      `}
            disabled={disabled || loading}
            {...props}
        >
            {loading && (
                <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                >
                    <circle
                        className="opacity-25"
                        cx="12" cy="12" r="10"
                        stroke="currentColor" strokeWidth="4"
                    />
                    <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                </svg>
            )}
            {children}
        </button>
    );
}

// ── Input ─────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    hint?: string;
    leftIcon?: React.ReactNode;
}

export function Input({
    label,
    error,
    hint,
    leftIcon,
    className = "",
    ...props
}: InputProps) {
    return (
        <div className="flex flex-col gap-1">
            {label && (
                <label className="text-sm font-medium text-gray-700">
                    {label}
                    {props.required && <span className="text-red-500 ml-1">*</span>}
                </label>
            )}
            <div className="relative">
                {leftIcon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {leftIcon}
                    </div>
                )}
                <input
                    className={`
            w-full rounded-lg border px-3 py-2 text-sm text-gray-900
            placeholder:text-gray-400 transition-colors
            focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent
            disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
            ${error
                            ? "border-red-300 bg-red-50 focus:ring-red-500"
                            : "border-gray-300 bg-white"
                        }
            ${leftIcon ? "pl-10" : ""}
            ${className}
          `}
                    {...props}
                />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
        </div>
    );
}

// ── Textarea ──────────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
    hint?: string;
}

export function Textarea({ label, error, hint, className = "", ...props }: TextareaProps) {
    return (
        <div className="flex flex-col gap-1">
            {label && (
                <label className="text-sm font-medium text-gray-700">
                    {label}
                    {props.required && <span className="text-red-500 ml-1">*</span>}
                </label>
            )}
            <textarea
                rows={3}
                className={`
          w-full rounded-lg border px-3 py-2 text-sm text-gray-900
          placeholder:text-gray-400 transition-colors resize-none
          focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent
          disabled:bg-gray-50 disabled:cursor-not-allowed
          ${error ? "border-red-300 bg-red-50" : "border-gray-300 bg-white"}
          ${className}
        `}
                {...props}
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
        </div>
    );
}

// ── Select ────────────────────────────────────────────────────

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    error?: string;
    hint?: string;
    options: { value: string; label: string }[];
    placeholder?: string;
}

export function Select({
    label,
    error,
    hint,
    options,
    placeholder,
    className = "",
    ...props
}: SelectProps) {
    return (
        <div className="flex flex-col gap-1">
            {label && (
                <label className="text-sm font-medium text-gray-700">
                    {label}
                    {props.required && <span className="text-red-500 ml-1">*</span>}
                </label>
            )}
            <select
                className={`
          w-full rounded-lg border px-3 py-2 text-sm text-gray-900
          focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent
          disabled:bg-gray-50 disabled:cursor-not-allowed bg-white
          ${error ? "border-red-300" : "border-gray-300"}
          ${className}
        `}
                {...props}
            >
                {placeholder && (
                    <option value="" disabled>
                        {placeholder}
                    </option>
                )}
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
            {error && <p className="text-xs text-red-600">{error}</p>}
            {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
        </div>
    );
}

// ── Badge ─────────────────────────────────────────────────────

interface BadgeProps {
    children: React.ReactNode;
    className?: string;
}

export function Badge({ children, className = "" }: BadgeProps) {
    return (
        <span
            className={`
        inline-flex items-center px-2.5 py-0.5 rounded-full
        text-xs font-medium ${className}
      `}
        >
            {children}
        </span>
    );
}

// ── Spinner ───────────────────────────────────────────────────

interface SpinnerProps {
    size?: "sm" | "md" | "lg";
    className?: string;
}

export function Spinner({ size = "md", className = "" }: SpinnerProps) {
    const sizes = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-10 h-10" };
    return (
        <div
            className={`
        ${sizes[size]} border-2 border-green-500 border-t-transparent
        rounded-full animate-spin ${className}
      `}
        />
    );
}

// ── Modal ─────────────────────────────────────────────────────

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    size?: "sm" | "md" | "lg" | "xl";
    footer?: React.ReactNode;
}

export function Modal({
    open,
    onClose,
    title,
    children,
    size = "md",
    footer,
}: ModalProps) {
    // Close on Escape key
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        if (open) document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [open, onClose]);

    // Prevent background scroll when modal is open
    useEffect(() => {
        if (open) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => { document.body.style.overflow = ""; };
    }, [open]);

    if (!open) return null;

    const sizes = {
        sm: "max-w-sm",
        md: "max-w-md",
        lg: "max-w-lg",
        xl: "max-w-2xl",
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Dialog */}
            <div
                className={`
          relative w-full ${sizes[size]} bg-white rounded-2xl shadow-xl
          flex flex-col max-h-[90vh]
        `}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <h2 id="modal-title" className="text-lg font-semibold text-gray-900">
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors
                       rounded-lg p-1 hover:bg-gray-100"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24"
                            stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Toast notification ────────────────────────────────────────

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
    id: string;
    type: ToastType;
    message: string;
}

// Simple global toast state — not using context
// Import { toast } and call toast.success("message") anywhere
let toastListeners: ((toasts: Toast[]) => void)[] = [];
let currentToasts: Toast[] = [];

function notifyListeners() {
    toastListeners.forEach((listener) => listener([...currentToasts]));
}

export const toast = {
    success: (message: string) => addToast("success", message),
    error: (message: string) => addToast("error", message),
    info: (message: string) => addToast("info", message),
    warning: (message: string) => addToast("warning", message),
};

function addToast(type: ToastType, message: string) {
    const id = Math.random().toString(36).slice(2);
    currentToasts = [...currentToasts, { id, type, message }];
    notifyListeners();

    // Auto-remove after 4 seconds
    setTimeout(() => {
        currentToasts = currentToasts.filter((t) => t.id !== id);
        notifyListeners();
    }, 4000);
}

export function ToastContainer() {
    const [toasts, setToasts] = useState<Toast[]>([]);

    useEffect(() => {
        toastListeners.push(setToasts);
        return () => {
            toastListeners = toastListeners.filter((l) => l !== setToasts);
        };
    }, []);

    const icons: Record<ToastType, string> = {
        success: "✅",
        error: "❌",
        info: "ℹ️",
        warning: "⚠️",
    };

    const colors: Record<ToastType, string> = {
        success: "bg-green-50 border-green-200 text-green-800",
        error: "bg-red-50 border-red-200 text-red-800",
        info: "bg-blue-50 border-blue-200 text-blue-800",
        warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
    };

    return (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full">
            {toasts.map((t) => (
                <div
                    key={t.id}
                    className={`
            flex items-start gap-3 p-4 rounded-xl border shadow-lg
            animate-in slide-in-from-right-5 duration-300
            ${colors[t.type]}
          `}
                >
                    <span className="text-base flex-shrink-0">{icons[t.type]}</span>
                    <p className="text-sm font-medium">{t.message}</p>
                    <button
                        onClick={() => {
                            currentToasts = currentToasts.filter((x) => x.id !== t.id);
                            notifyListeners();
                        }}
                        className="ml-auto text-current opacity-60 hover:opacity-100"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24"
                            stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            ))}
        </div>
    );
}

// ── Confirm Dialog ────────────────────────────────────────────

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "danger" | "primary";
    onConfirm: () => void;
    onCancel: () => void;
    loading?: boolean;
}

export function ConfirmDialog({
    open,
    title,
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "danger",
    onConfirm,
    onCancel,
    loading = false,
}: ConfirmDialogProps) {
    return (
        <Modal open={open} onClose={onCancel} title={title} size="sm">
            <p className="text-gray-600 text-sm">{message}</p>
            <div className="flex justify-end gap-3 mt-6">
                <Button variant="secondary" onClick={onCancel} disabled={loading}>
                    {cancelText}
                </Button>
                <Button variant={variant} onClick={onConfirm} loading={loading}>
                    {confirmText}
                </Button>
            </div>
        </Modal>
    );
}

// ── Empty State ───────────────────────────────────────────────

interface EmptyStateProps {
    icon?: string;
    title: string;
    description?: string;
    action?: React.ReactNode;
}

export function EmptyState({ icon = "📭", title, description, action }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="text-5xl mb-4">{icon}</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
            {description && (
                <p className="text-gray-500 text-sm max-w-sm mb-6">{description}</p>
            )}
            {action}
        </div>
    );
}

// ── Toggle Switch ─────────────────────────────────────────────

interface ToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
    disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
    return (
        <label className="flex items-center gap-3 cursor-pointer select-none">
            <div className="relative">
                <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.checked)}
                />
                <div
                    className={`
            w-11 h-6 rounded-full transition-colors duration-200
            ${checked ? "bg-green-500" : "bg-gray-200"}
            ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          `}
                />
                <div
                    className={`
            absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full
            shadow transition-transform duration-200
            ${checked ? "translate-x-5" : "translate-x-0"}
          `}
                />
            </div>
            {label && (
                <span className={`text-sm font-medium ${disabled ? "text-gray-400" : "text-gray-700"
                    }`}>
                    {label}
                </span>
            )}
        </label>
    );
}

// ── Tab Bar ───────────────────────────────────────────────────

interface Tab {
    id: string;
    label: string;
    icon?: string;
}

interface TabBarProps {
    tabs: Tab[];
    active: string;
    onChange: (id: string) => void;
}

export function TabBar({ tabs, active, onChange }: TabBarProps) {
    return (
        <div className="flex border-b border-gray-200 gap-1">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => onChange(tab.id)}
                    className={`
            px-4 py-2.5 text-sm font-medium transition-colors
            border-b-2 -mb-px whitespace-nowrap flex items-center gap-2
            ${active === tab.id
                            ? "border-green-500 text-green-600"
                            : "border-transparent text-gray-500 hover:text-gray-700"
                        }
          `}
                >
                    {tab.icon && <span>{tab.icon}</span>}
                    {tab.label}
                </button>
            ))}
        </div>
    );
}

// ── Image Upload ──────────────────────────────────────────────

interface ImageUploadProps {
    currentUrl?: string | null;
    onFileSelect: (file: File) => void;
    loading?: boolean;
}

export function ImageUpload({ currentUrl, onFileSelect, loading }: ImageUploadProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) onFileSelect(file);
    };

    return (
        <div
            className="relative w-32 h-32 rounded-xl border-2 border-dashed
                 border-gray-300 hover:border-green-400 transition-colors
                 cursor-pointer overflow-hidden group"
            onClick={() => inputRef.current?.click()}
        >
            {currentUrl ? (
                <>
                    <img
                        src={currentUrl}
                        alt="Product"
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100
                          transition-opacity flex items-center justify-center">
                        <span className="text-white text-xs font-medium">Change</span>
                    </div>
                </>
            ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                    {loading ? (
                        <Spinner size="sm" />
                    ) : (
                        <>
                            <span className="text-2xl">📷</span>
                            <span className="text-xs text-gray-500 text-center px-2">
                                Click to upload
                            </span>
                        </>
                    )}
                </div>
            )}
            <input
                ref={inputRef}
                type="file"
                accept="image/webp,image/jpeg,image/png"
                className="hidden"
                onChange={handleChange}
            />
        </div>
    );
}