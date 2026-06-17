// ============================================================
// Menu.tsx
// Categories sidebar + products grid
// super_admin + manager only
// Features: create/edit/delete categories & products,
//           image upload, drag-reorder (sort_order update)
// ============================================================

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { supabase, uploadProductImage, deleteProductImage } from "../lib/supabase";
import {
    Button, Input, Textarea, Modal, ConfirmDialog,
    EmptyState, Spinner, ImageUpload, toast,
} from "../components/UI";
import { formatCurrency, sanitizeInput } from "../utils/helpers";
import type { Category, Product } from "../lib/types";

// ── Types ──────────────────────────────────────────────────────
interface ProductForm {
    name: string;
    description: string;
    base_price: string;
    category_id: string;
}

interface CategoryForm {
    name: string;
}

// ── Category sidebar item ──────────────────────────────────────
function CategoryItem({
    category,
    active,
    onClick,
    onEdit,
    onDelete,
}: {
    category: Category;
    active: boolean;
    onClick: () => void;
    onEdit: (c: Category) => void;
    onDelete: (c: Category) => void;
}) {
    return (
        <div
            className={`
        group flex items-center justify-between px-3 py-2.5 rounded-lg
        cursor-pointer transition-colors
        ${active
                    ? "bg-green-50 text-green-700"
                    : "hover:bg-gray-50 text-gray-700"
                }
      `}
            onClick={onClick}
        >
            <span className="text-sm font-medium truncate">{category.name}</span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={(e) => { e.stopPropagation(); onEdit(category); }}
                    className="p-1 rounded hover:bg-gray-200 text-gray-400
                     hover:text-gray-600 transition-colors"
                    title="Edit category"
                >
                    ✏️
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(category); }}
                    className="p-1 rounded hover:bg-red-100 text-gray-400
                     hover:text-red-600 transition-colors"
                    title="Delete category"
                >
                    🗑️
                </button>
            </div>
        </div>
    );
}

// ── Product card ───────────────────────────────────────────────
function ProductCard({
    product,
    onEdit,
    onDelete,
}: {
    product: Product;
    onEdit: (p: Product) => void;
    onDelete: (p: Product) => void;
}) {
    return (
        <div className="card group relative hover:shadow-md transition-shadow p-4">
            {/* Image */}
            <div className="w-full h-40 bg-gray-100 rounded-xl overflow-hidden mb-3">
                {product.image_url ? (
                    <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl">
                        🍽️
                    </div>
                )}
            </div>

            {/* Info */}
            <h3 className="font-semibold text-gray-900 text-sm truncate">
                {product.name}
            </h3>
            {product.description && (
                <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                    {product.description}
                </p>
            )}
            <p className="text-green-700 font-bold mt-2">
                {formatCurrency(product.base_price)}
            </p>

            {/* Actions */}
            <div className="flex gap-2 mt-3">
                <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => onEdit(product)}
                >
                    Edit
                </Button>
                <Button
                    size="sm"
                    variant="danger"
                    onClick={() => onDelete(product)}
                >
                    🗑️
                </Button>
            </div>
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────
export default function MenuManagement() {
    const { user, org } = useAuth();

    const [categories, setCategories] = useState<Category[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [imageUploading, setImageUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Category modal
    const [catModalOpen, setCatModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [catForm, setCatForm] = useState<CategoryForm>({ name: "" });
    const [catErrors, setCatErrors] = useState<Record<string, string>>({});

    // Product modal
    const [prodModalOpen, setProdModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [prodForm, setProdForm] = useState<ProductForm>({
        name: "", description: "", base_price: "", category_id: "",
    });
    const [prodErrors, setProdErrors] = useState<Record<string, string>>({});
    const [pendingImage, setPendingImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    // Delete confirms
    const [deleteCat, setDeleteCat] = useState<Category | null>(null);
    const [deleteProd, setDeleteProd] = useState<Product | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (org) loadData();
    }, [org]);

    async function loadData() {
        setLoading(true);
        const [{ data: cats }, { data: prods }] = await Promise.all([
            supabase
                .from("categories")
                .select("*")
                .eq("org_id", org!.id)
                .order("sort_order"),
            supabase
                .from("products")
                .select("*")
                .eq("org_id", org!.id)
                .order("sort_order"),
        ]);

        const catList = (cats as Category[]) || [];
        setCategories(catList);
        setProducts((prods as Product[]) || []);
        if (catList.length > 0 && !activeCategory) {
            setActiveCategory(catList[0].id);
        }
        setLoading(false);
    }

    // ── Category CRUD ──────────────────────────────────────────
    function openNewCategory() {
        setEditingCategory(null);
        setCatForm({ name: "" });
        setCatErrors({});
        setCatModalOpen(true);
    }

    function openEditCategory(cat: Category) {
        setEditingCategory(cat);
        setCatForm({ name: cat.name });
        setCatErrors({});
        setCatModalOpen(true);
    }

    async function handleSaveCategory() {
        const name = sanitizeInput(catForm.name);
        if (!name) {
            setCatErrors({ name: "Category name is required" });
            return;
        }

        setSubmitting(true);

        if (editingCategory) {
            const { error } = await supabase
                .from("categories")
                .update({ name })
                .eq("id", editingCategory.id);

            if (error) {
                toast.error("Failed to update category");
            } else {
                toast.success("Category updated!");
                setCatModalOpen(false);
                loadData();
            }
        } else {
            const { error } = await supabase
                .from("categories")
                .insert({ name, org_id: org!.id });

            if (error) {
                toast.error("Failed to create category");
            } else {
                toast.success("Category created!");
                setCatModalOpen(false);
                loadData();
            }
        }

        setSubmitting(false);
    }

    async function handleDeleteCategory() {
        if (!deleteCat) return;
        setDeleting(true);

        const { error } = await supabase
            .from("categories")
            .delete()
            .eq("id", deleteCat.id);

        if (error) {
            // FK RESTRICT: category has products
            if (error.code === "23503") {
                toast.error("Remove all products in this category first");
            } else {
                toast.error("Failed to delete category");
            }
        } else {
            toast.success("Category deleted");
            if (activeCategory === deleteCat.id) setActiveCategory(null);
            loadData();
        }

        setDeleting(false);
        setDeleteCat(null);
    }

    // ── Product CRUD ───────────────────────────────────────────
    function openNewProduct() {
        setEditingProduct(null);
        setProdForm({
            name: "",
            description: "",
            base_price: "",
            category_id: activeCategory || "",
        });
        setProdErrors({});
        setPendingImage(null);
        setImagePreview(null);
        setProdModalOpen(true);
    }

    function openEditProduct(product: Product) {
        setEditingProduct(product);
        setProdForm({
            name: product.name,
            description: product.description || "",
            base_price: String(product.base_price),
            category_id: product.category_id,
        });
        setProdErrors({});
        setPendingImage(null);
        setImagePreview(product.image_url);
        setProdModalOpen(true);
    }

    function handleImageSelect(file: File) {
        // Preview before upload
        const url = URL.createObjectURL(file);
        setImagePreview(url);
        setPendingImage(file);
    }

    async function handleSaveProduct() {
        const name = sanitizeInput(prodForm.name);
        const description = sanitizeInput(prodForm.description);
        const price = parseFloat(prodForm.base_price);
        const category_id = prodForm.category_id;

        // Validate
        const errs: Record<string, string> = {};
        if (!name) errs.name = "Product name is required";
        if (!category_id) errs.category_id = "Select a category";
        if (isNaN(price) || price < 0)
            errs.base_price = "Enter a valid price (0 or more)";
        if (Object.keys(errs).length) { setProdErrors(errs); return; }

        setSubmitting(true);

        try {
            if (editingProduct) {
                // Update existing product
                const { error } = await supabase
                    .from("products")
                    .update({
                        name,
                        description: description || null,
                        base_price: price,
                        category_id,
                    })
                    .eq("id", editingProduct.id);

                if (error) throw error;

                // Upload new image if selected
                if (pendingImage) {
                    setImageUploading(true);
                    const { url, error: imgErr } = await uploadProductImage(
                        org!.id,
                        editingProduct.id,
                        pendingImage
                    );
                    if (imgErr) {
                        toast.error(`Product saved but image failed: ${imgErr}`);
                    } else if (url) {
                        await supabase
                            .from("products")
                            .update({ image_url: url })
                            .eq("id", editingProduct.id);
                    }
                    setImageUploading(false);
                }

                toast.success("Product updated!");
            } else {
                // Create new product
                const { data: newProduct, error } = await supabase
                    .from("products")
                    .insert({
                        name,
                        description: description || null,
                        base_price: price,
                        category_id,
                        org_id: org!.id,
                    })
                    .select()
                    .single();

                if (error) throw error;

                // Upload image for new product
                if (pendingImage && newProduct) {
                    setImageUploading(true);
                    const { url, error: imgErr } = await uploadProductImage(
                        org!.id,
                        newProduct.id,
                        pendingImage
                    );
                    if (imgErr) {
                        toast.error(`Product created but image failed: ${imgErr}`);
                    } else if (url) {
                        await supabase
                            .from("products")
                            .update({ image_url: url })
                            .eq("id", newProduct.id);
                    }
                    setImageUploading(false);
                }

                toast.success("Product created!");
            }

            setProdModalOpen(false);
            loadData();
        } catch (err: unknown) {
            if (import.meta.env.DEV) console.error(err);
            toast.error("Failed to save product");
        }

        setSubmitting(false);
    }

    async function handleDeleteProduct() {
        if (!deleteProd) return;
        setDeleting(true);

        // Delete image from storage first
        if (deleteProd.image_url) {
            await deleteProductImage(org!.id, deleteProd.id);
        }

        const { error } = await supabase
            .from("products")
            .delete()
            .eq("id", deleteProd.id);

        if (error) {
            if (error.code === "23503") {
                toast.error("Cannot delete — product has existing orders");
            } else {
                toast.error("Failed to delete product");
            }
        } else {
            toast.success("Product deleted");
            loadData();
        }

        setDeleting(false);
        setDeleteProd(null);
    }

    // ── Sort order update (drag not implemented — use up/down) ──
    async function moveCategory(cat: Category, direction: "up" | "down") {
        const idx = categories.findIndex((c) => c.id === cat.id);
        const other = direction === "up" ? categories[idx - 1] : categories[idx + 1];
        if (!other) return;

        await Promise.all([
            supabase
                .from("categories")
                .update({ sort_order: other.sort_order })
                .eq("id", cat.id),
            supabase
                .from("categories")
                .update({ sort_order: cat.sort_order })
                .eq("id", other.id),
        ]);
        loadData();
    }

    const activeCategoryProducts = products.filter(
        (p) => p.category_id === activeCategory
    );

    const categoryOptions = categories.map((c) => ({
        value: c.id,
        label: c.name,
    }));

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
                <h1 className="text-2xl font-bold text-gray-900">🍽️ Menu Management</h1>
            </div>

            <div className="flex gap-6 min-h-[600px]">
                {/* ── Category sidebar ──────────────────── */}
                <aside className="w-56 flex-shrink-0">
                    <div className="card p-3 h-full">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-semibold text-gray-700">
                                Categories
                            </h2>
                            <Button size="sm" onClick={openNewCategory}>+ New</Button>
                        </div>

                        {categories.length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-8">
                                No categories yet
                            </p>
                        ) : (
                            <div className="space-y-0.5">
                                {categories.map((cat, idx) => (
                                    <div key={cat.id} className="flex items-center gap-1">
                                        {/* Reorder buttons */}
                                        <div className="flex flex-col">
                                            <button
                                                onClick={() => moveCategory(cat, "up")}
                                                disabled={idx === 0}
                                                className="text-gray-300 hover:text-gray-500
                                   disabled:opacity-0 text-xs leading-none"
                                            >▲</button>
                                            <button
                                                onClick={() => moveCategory(cat, "down")}
                                                disabled={idx === categories.length - 1}
                                                className="text-gray-300 hover:text-gray-500
                                   disabled:opacity-0 text-xs leading-none"
                                            >▼</button>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <CategoryItem
                                                category={cat}
                                                active={activeCategory === cat.id}
                                                onClick={() => setActiveCategory(cat.id)}
                                                onEdit={openEditCategory}
                                                onDelete={setDeleteCat}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </aside>

                {/* ── Products grid ─────────────────────── */}
                <div className="flex-1 min-w-0">
                    {activeCategory ? (
                        <>
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-gray-900">
                                    {categories.find((c) => c.id === activeCategory)?.name}
                                    <span className="ml-2 text-sm text-gray-400 font-normal">
                                        ({activeCategoryProducts.length} items)
                                    </span>
                                </h2>
                                <Button onClick={openNewProduct}>+ Add Product</Button>
                            </div>

                            {activeCategoryProducts.length === 0 ? (
                                <EmptyState
                                    icon="🍽️"
                                    title="No products yet"
                                    description="Add your first product to this category"
                                    action={
                                        <Button onClick={openNewProduct}>Add Product</Button>
                                    }
                                />
                            ) : (
                                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {activeCategoryProducts.map((product) => (
                                        <ProductCard
                                            key={product.id}
                                            product={product}
                                            onEdit={openEditProduct}
                                            onDelete={setDeleteProd}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <EmptyState
                            icon="👈"
                            title="Select a category"
                            description="Choose a category from the sidebar to view its products"
                            action={
                                <Button onClick={openNewCategory}>
                                    Create First Category
                                </Button>
                            }
                        />
                    )}
                </div>
            </div>

            {/* ── Category Modal ─────────────────────────── */}
            <Modal
                open={catModalOpen}
                onClose={() => setCatModalOpen(false)}
                title={editingCategory ? "Edit Category" : "New Category"}
                size="sm"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => setCatModalOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleSaveCategory} loading={submitting}>
                            {editingCategory ? "Save Changes" : "Create Category"}
                        </Button>
                    </>
                }
            >
                <Input
                    label="Category Name"
                    placeholder="e.g. Main Course"
                    value={catForm.name}
                    onChange={(e) => setCatForm({ name: e.target.value })}
                    error={catErrors.name}
                    required
                    autoFocus
                />
            </Modal>

            {/* ── Product Modal ─────────────────────────── */}
            <Modal
                open={prodModalOpen}
                onClose={() => setProdModalOpen(false)}
                title={editingProduct ? "Edit Product" : "New Product"}
                size="lg"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => setProdModalOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSaveProduct}
                            loading={submitting || imageUploading}
                        >
                            {editingProduct ? "Save Changes" : "Create Product"}
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    {/* Image upload */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 block mb-2">
                            Product Image
                        </label>
                        <ImageUpload
                            currentUrl={imagePreview}
                            onFileSelect={handleImageSelect}
                            loading={imageUploading}
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            Max 5MB, webp/jpg/png. Auto-compressed to 1200px.
                        </p>
                    </div>

                    <Input
                        label="Product Name"
                        placeholder="e.g. Jollof Rice + Chicken"
                        value={prodForm.name}
                        onChange={(e) =>
                            setProdForm((p) => ({ ...p, name: e.target.value }))
                        }
                        error={prodErrors.name}
                        required
                    />

                    <Textarea
                        label="Description"
                        placeholder="Brief description of the dish..."
                        value={prodForm.description}
                        onChange={(e) =>
                            setProdForm((p) => ({ ...p, description: e.target.value }))
                        }
                    />

                    <Input
                        label="Base Price (GH₵)"
                        type="number"
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        value={prodForm.base_price}
                        onChange={(e) =>
                            setProdForm((p) => ({ ...p, base_price: e.target.value }))
                        }
                        error={prodErrors.base_price}
                        required
                        hint="Branches can override this price individually"
                    />

                    {/* Category select */}
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">
                            Category <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={prodForm.category_id}
                            onChange={(e) =>
                                setProdForm((p) => ({ ...p, category_id: e.target.value }))
                            }
                            className={`
                w-full rounded-lg border px-3 py-2 text-sm text-gray-900
                focus:outline-none focus:ring-2 focus:ring-green-500
                focus:border-transparent bg-white
                ${prodErrors.category_id ? "border-red-300" : "border-gray-300"}
              `}
                        >
                            <option value="">Select category...</option>
                            {categoryOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                        {prodErrors.category_id && (
                            <p className="text-xs text-red-600">{prodErrors.category_id}</p>
                        )}
                    </div>
                </div>
            </Modal>

            {/* ── Delete category confirm ──────────────── */}
            <ConfirmDialog
                open={!!deleteCat}
                title="Delete Category"
                message={`Delete "${deleteCat?.name}"? This will fail if it has products.`}
                confirmText="Delete"
                variant="danger"
                onConfirm={handleDeleteCategory}
                onCancel={() => setDeleteCat(null)}
                loading={deleting}
            />

            {/* ── Delete product confirm ────────────────── */}
            <ConfirmDialog
                open={!!deleteProd}
                title="Delete Product"
                message={`Delete "${deleteProd?.name}"? This cannot be undone. The image will also be removed.`}
                confirmText="Delete"
                variant="danger"
                onConfirm={handleDeleteProduct}
                onCancel={() => setDeleteProd(null)}
                loading={deleting}
            />
        </div>
    );
}