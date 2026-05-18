import { z } from "zod";

const permissiveObject = z.any();

export const HealthCheckResponse = z.object({ status: z.literal("ok") });
export const LoginBody = z.object({
  mobile: z.string().min(1),
  password: z.string().min(1),
});

export const CreateUserBody = permissiveObject;
export const UpdateUserBody = permissiveObject;
export const GetUserParams = permissiveObject;
export const ResetUserPasswordBody = permissiveObject;

export const CreateSupplierBody = permissiveObject;
export const GetSupplierParams = permissiveObject;
export const UpdateSettingsBody = permissiveObject;
export const CreateRoleBody = permissiveObject;
export const GetRoleParams = permissiveObject;
export const CreatePurchaseOrderBody = permissiveObject;
export const UpdatePurchaseOrderBody = permissiveObject;
export const UpdatePurchaseOrderStatusBody = permissiveObject;
export const GetPurchaseOrderParams = permissiveObject;
const OptionalImageUrl = z
  .preprocess((v) => (v === "" ? null : v), z.union([z.string(), z.null()]).optional())
  .refine((v) => {
    if (v == null) return true;
    if (typeof v !== "string") return false;
    if (v.startsWith("/uploads/")) return v.length <= 500;
    return z.string().url().safeParse(v).success && v.length <= 500;
  }, "Invalid image URL");

const InitialVariantInput = z.object({
  name: z.string().min(1, "Variant name is required"),
  sku: z.string().min(1, "Variant SKU is required"),
  imageUrl: OptionalImageUrl,
  imageUrls: z.array(z.string()).optional(),
  price: z.union([z.coerce.number().min(0), z.null()]).optional(),
  stockQty: z.coerce.number().int().min(0).optional().default(0),
  lowStockThreshold: z.coerce.number().int().min(0).optional().default(10),
  attributes: z.union([z.string(), z.null()]).optional(),
});

/**
 * Create product. Simple SKUs: set `inventoryMode: simple` and `stockQty`. Variant SKUs: `inventoryMode: variants` and optional `initialVariants`.
 */
export const CreateProductBody = z
  .object({
    name: z.string().min(1, "Name is required"),
    sku: z.string().min(1, "SKU is required"),
    categoryId: z.union([z.number().int().positive(), z.null()]).optional(),
    imageUrl: OptionalImageUrl,
    imageUrls: z.array(z.string()).optional(),
    price: z.coerce.number().min(0, "Price must be ≥ 0"),
    gstPercent: z.coerce.number().min(0).max(100),
    lowStockThreshold: z.coerce.number().int().min(0),
    description: z.union([z.string(), z.null()]).optional(),
    inventoryMode: z.enum(["simple", "variants"]).optional().default("simple"),
    stockQty: z.coerce.number().int().min(0).optional(),
    initialVariants: z.array(InitialVariantInput).optional(),
    attributes: z.union([z.string(), z.null()]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.inventoryMode === "simple" && data.initialVariants && data.initialVariants.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Simple products cannot include initial variants",
        path: ["initialVariants"],
      });
    }
  });

export const UpdateProductBody = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "SKU is required"),
  categoryId: z.union([z.number().int().positive(), z.null()]).optional(),
  imageUrl: OptionalImageUrl,
  imageUrls: z.array(z.string()).optional(),
  price: z.coerce.number().min(0, "Price must be ≥ 0"),
  gstPercent: z.coerce.number().min(0).max(100),
  lowStockThreshold: z.coerce.number().int().min(0),
  description: z.union([z.string(), z.null()]).optional(),
  /** When the product has no variants, updates on-hand quantity. */
  stockQty: z.coerce.number().int().min(0).optional(),
  attributes: z.union([z.string(), z.null()]).optional(),
});

export const GetProductParams = z.object({
  id: z.preprocess(
    (v) => (Array.isArray(v) ? v[0] : v),
    z.coerce.number().int().positive(),
  ),
});

export const CreateProductVariantBody = z.object({
  name: z.string().min(1, "Variant name is required"),
  sku: z.string().min(1, "SKU is required"),
  imageUrl: OptionalImageUrl,
  imageUrls: z.array(z.string()).optional(),
  price: z.union([z.coerce.number().min(0), z.null()]).optional(),
  stockQty: z.coerce.number().int().min(0).optional().default(0),
  lowStockThreshold: z.coerce.number().int().min(0).optional().default(10),
  attributes: z.union([z.string(), z.null()]).optional(),
  isActive: z.boolean().optional().default(true),
});

/** PATCH variant — all fields optional */
export const UpdateProductVariantBody = z.object({
  name: z.string().min(1).optional(),
  sku: z.string().min(1).optional(),
  imageUrl: OptionalImageUrl,
  imageUrls: z.array(z.string()).optional(),
  price: z.union([z.coerce.number().min(0), z.null()]).optional(),
  stockQty: z.coerce.number().int().min(0).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
  attributes: z.union([z.string(), z.null()]).optional(),
  isActive: z.boolean().optional(),
});
export const CreatePaymentBody = permissiveObject;
export const CreateOrderBody = permissiveObject;
export const UpdateOrderBody = permissiveObject;
export const UpdateOrderStatusBody = permissiveObject;
export const GetOrderParams = z.object({
  id: z.preprocess(
    (v) => (Array.isArray(v) ? v[0] : v),
    z.coerce.number().int().positive(),
  ),
});
export const CreateManufacturerBody = permissiveObject;
export const GetManufacturerParams = permissiveObject;
export const AdjustInventoryBody = permissiveObject;
export const CreateCategoryBody = permissiveObject;
export const UpdateCategoryParams = permissiveObject;
export const CreateBranchBody = permissiveObject;
export const UpdateBranchBody = permissiveObject;
export const GetBranchParams = permissiveObject;
