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
export const CreateProductBody = permissiveObject;
export const UpdateProductBody = permissiveObject;
export const GetProductParams = permissiveObject;
export const CreateProductVariantBody = permissiveObject;
export const UpdateProductVariantBody = permissiveObject;
export const CreatePaymentBody = permissiveObject;
export const CreateOrderBody = permissiveObject;
export const UpdateOrderBody = permissiveObject;
export const UpdateOrderStatusBody = permissiveObject;
export const GetOrderParams = permissiveObject;
export const CreateManufacturerBody = permissiveObject;
export const GetManufacturerParams = permissiveObject;
export const AdjustInventoryBody = permissiveObject;
export const CreateCategoryBody = permissiveObject;
export const UpdateCategoryParams = permissiveObject;
export const CreateBranchBody = permissiveObject;
export const UpdateBranchBody = permissiveObject;
export const GetBranchParams = permissiveObject;
