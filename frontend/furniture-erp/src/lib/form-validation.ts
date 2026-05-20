import { z } from "zod";
import type { ChangeEvent } from "react";

/** Shared max lengths — single source for Zod + input sanitization. */
export const FIELD_LIMITS = {
  customerName: 28,
  personName: 80,
  companyName: 20,
  categoryName: 20,
  roleName: 20,
  branchName: 25,
  branchCode: 20,
  mobile: 10,
  pincode: 6,
  gstNumber: 15,
  chequeNumber: 20,
  email: 254,
  passwordMin: 6,
  passwordMax: 18,
  notes: 2000,
  address: 500,
  city: 60,
  state: 60,
  invoicePrefix: 20,
  attributeText: 20,
} as const;

const LETTERS_REGEX = /^[a-zA-Z\s]+$/;
const DIGITS_REGEX = /^[0-9]+$/;
const MOBILE_REGEX = /^[0-9]{10}$/;
const PINCODE_REGEX = /^[0-9]{6}$/;
const GST_REGEX = /^[0-9A-Z]{15}$/;
const COMPANY_NAME_REGEX = /^[a-zA-Z0-9\s.&,'()-]+$/;
const BRANCH_CODE_REGEX = /^[A-Z0-9_-]+$/;

export function sanitizeLettersOnly(value: string, maxLength: number): string {
  return value.replace(/[^a-zA-Z\s]/g, "").slice(0, maxLength);
}

export function sanitizeDigitsOnly(value: string, maxLength: number): string {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

export function sanitizeAlphanumericUpper(value: string, maxLength: number): string {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, maxLength);
}

export function sanitizeCompanyName(value: string, maxLength: number): string {
  return value.replace(/[^a-zA-Z0-9\s.&,'()-]/g, "").slice(0, maxLength);
}

export function sanitizeBranchCode(value: string, maxLength: number): string {
  return value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, maxLength);
}

export function sanitizePlainText(value: string, maxLength: number): string {
  return value.slice(0, maxLength);
}

/** Colour, fabric, and similar labels — letters, numbers, spaces, hyphens only. */
export function sanitizeAttributeText(value: string, maxLength: number): string {
  return value.replace(/[^a-zA-Z0-9\s-]/g, "").slice(0, maxLength);
}

export type InputRuleKey =
  | "customerName"
  | "personName"
  | "companyName"
  | "categoryName"
  | "roleName"
  | "branchName"
  | "branchCode"
  | "mobile"
  | "pincode"
  | "gstNumber"
  | "chequeNumber"
  | "city"
  | "state"
  | "plainText"
  | "address"
  | "notes"
  | "invoicePrefix"
  | "attributeText";

export type InputRule = {
  sanitize: (value: string) => string;
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  type?: string;
  pattern?: string;
};

export const INPUT_RULES: Record<InputRuleKey, InputRule> = {
  customerName: {
    sanitize: (v) => sanitizeLettersOnly(v, FIELD_LIMITS.customerName),
    maxLength: FIELD_LIMITS.customerName,
    inputMode: "text",
  },
  personName: {
    sanitize: (v) => sanitizeLettersOnly(v, FIELD_LIMITS.personName),
    maxLength: FIELD_LIMITS.personName,
    inputMode: "text",
  },
  companyName: {
    sanitize: (v) => sanitizeCompanyName(v, FIELD_LIMITS.companyName),
    maxLength: FIELD_LIMITS.companyName,
    inputMode: "text",
  },
  categoryName: {
    sanitize: (v) => sanitizeLettersOnly(v, FIELD_LIMITS.categoryName),
    maxLength: FIELD_LIMITS.categoryName,
    inputMode: "text",
  },
  roleName: {
    sanitize: (v) => sanitizePlainText(v, FIELD_LIMITS.roleName),
    maxLength: FIELD_LIMITS.roleName,
    inputMode: "text",
  },
  branchName: {
    sanitize: (v) => sanitizeCompanyName(v, FIELD_LIMITS.branchName),
    maxLength: FIELD_LIMITS.branchName,
    inputMode: "text",
  },
  branchCode: {
    sanitize: (v) => sanitizeBranchCode(v, FIELD_LIMITS.branchCode),
    maxLength: FIELD_LIMITS.branchCode,
    inputMode: "text",
  },
  mobile: {
    sanitize: (v) => sanitizeDigitsOnly(v, FIELD_LIMITS.mobile),
    maxLength: FIELD_LIMITS.mobile,
    inputMode: "numeric",
    type: "tel",
    pattern: "[0-9]*",
  },
  pincode: {
    sanitize: (v) => sanitizeDigitsOnly(v, FIELD_LIMITS.pincode),
    maxLength: FIELD_LIMITS.pincode,
    inputMode: "numeric",
    pattern: "[0-9]*",
  },
  gstNumber: {
    sanitize: (v) => sanitizeAlphanumericUpper(v, FIELD_LIMITS.gstNumber),
    maxLength: FIELD_LIMITS.gstNumber,
    inputMode: "text",
  },
  chequeNumber: {
    sanitize: (v) => sanitizeAlphanumericUpper(v, FIELD_LIMITS.chequeNumber),
    maxLength: FIELD_LIMITS.chequeNumber,
    inputMode: "text",
  },
  city: {
    sanitize: (v) => sanitizeLettersOnly(v, FIELD_LIMITS.city),
    maxLength: FIELD_LIMITS.city,
    inputMode: "text",
  },
  state: {
    sanitize: (v) => sanitizeLettersOnly(v, FIELD_LIMITS.state),
    maxLength: FIELD_LIMITS.state,
    inputMode: "text",
  },
  plainText: {
    sanitize: (v) => sanitizePlainText(v, 500),
    maxLength: 500,
  },
  address: {
    sanitize: (v) => sanitizePlainText(v, FIELD_LIMITS.address),
    maxLength: FIELD_LIMITS.address,
  },
  notes: {
    sanitize: (v) => sanitizePlainText(v, FIELD_LIMITS.notes),
    maxLength: FIELD_LIMITS.notes,
  },
  invoicePrefix: {
    sanitize: (v) => v.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, FIELD_LIMITS.invoicePrefix),
    maxLength: FIELD_LIMITS.invoicePrefix,
    inputMode: "text",
  },
  attributeText: {
    sanitize: (v) => sanitizeAttributeText(v, FIELD_LIMITS.attributeText),
    maxLength: FIELD_LIMITS.attributeText,
    inputMode: "text",
  },
};

type FieldLike = { value?: string | null; onChange: (value: string) => void };

/** Props for `<Input />` with live sanitization (use inside FormField render). */
export function applyInputRule(
  rule: InputRuleKey,
  field: FieldLike,
  extra?: Omit<React.ComponentProps<"input">, "value" | "onChange">,
) {
  const r = INPUT_RULES[rule];
  return {
    ...extra,
    value: field.value ?? "",
    maxLength: r.maxLength,
    inputMode: r.inputMode,
    type: r.type ?? extra?.type,
    pattern: r.pattern,
    onChange: (e: ChangeEvent<HTMLInputElement>) => field.onChange(r.sanitize(e.target.value)),
  };
}

/** Reusable Zod field builders — pair with matching `INPUT_RULES` / `applyInputRule`. */
export const zodFields = {
  customerName: () =>
    z
      .string()
      .trim()
      .min(1, "Customer name is required")
      .max(FIELD_LIMITS.customerName, `Use at most ${FIELD_LIMITS.customerName} characters`)
      .regex(LETTERS_REGEX, "Customer name can only contain letters"),

  personName: (label = "Name") =>
    z
      .string()
      .trim()
      .min(1, `${label} is required`)
      .max(FIELD_LIMITS.personName, `Use at most ${FIELD_LIMITS.personName} characters`)
      .regex(LETTERS_REGEX, `${label} can only contain letters`),

  personNameOptional: (label = "Name") =>
    z
      .string()
      .trim()
      .max(FIELD_LIMITS.personName, `Use at most ${FIELD_LIMITS.personName} characters`)
      .optional()
      .nullable()
      .refine((v) => !v || LETTERS_REGEX.test(v), `${label} can only contain letters`),

  companyName: (label = "Name") =>
    z
      .string()
      .trim()
      .min(1, `${label} is required`)
      .max(FIELD_LIMITS.companyName, `Use at most ${FIELD_LIMITS.companyName} characters`)
      .regex(COMPANY_NAME_REGEX, `${label} has invalid characters`),

  mobileRequired: () =>
    z
      .string()
      .trim()
      .regex(MOBILE_REGEX, "Mobile must be a 10-digit number"),

  mobileOptional: () =>
    z
      .string()
      .trim()
      .optional()
      .nullable()
      .refine((v) => !v || MOBILE_REGEX.test(v), "Mobile must be a 10-digit number"),

  pincodeOptional: () =>
    z
      .string()
      .trim()
      .optional()
      .nullable()
      .refine((v) => !v || PINCODE_REGEX.test(v), "Pincode must be 6 digits"),

  gstNumberOptional: () =>
    z
      .string()
      .trim()
      .optional()
      .nullable()
      .refine((v) => !v || GST_REGEX.test(v), "GST number must be 15 characters"),

  gstNumberRequired: () =>
    z.string().trim().regex(GST_REGEX, "GST number must be 15 characters"),

  emailOptional: () =>
    z.union([z.literal(""), z.string().trim().email("Invalid email")]).optional().nullable(),

  addressOptional: () =>
    z.string().trim().max(FIELD_LIMITS.address, "Address is too long").optional().nullable(),

  addressRequired: () =>
    z.string().trim().min(1, "Address is required").max(FIELD_LIMITS.address, "Address is too long"),

  branchCode: () =>
    z
      .string()
      .trim()
      .min(1, "Branch code is required")
      .max(FIELD_LIMITS.branchCode, `Use at most ${FIELD_LIMITS.branchCode} characters`)
      .regex(BRANCH_CODE_REGEX, "Use letters, numbers, hyphens, or underscores"),

  cityOptional: () =>
    z
      .string()
      .trim()
      .max(FIELD_LIMITS.city)
      .optional()
      .nullable()
      .refine((v) => !v || LETTERS_REGEX.test(v), "City can only contain letters"),

  stateOptional: () =>
    z
      .string()
      .trim()
      .max(FIELD_LIMITS.state)
      .optional()
      .nullable()
      .refine((v) => !v || LETTERS_REGEX.test(v), "State can only contain letters"),

  chequeNumberOptional: () =>
    z
      .string()
      .trim()
      .max(FIELD_LIMITS.chequeNumber)
      .optional()
      .nullable()
      .refine((v) => !v || /^[0-9A-Z]+$/.test(v), "Cheque number can only contain letters and numbers"),

  notesOptional: () =>
    z.string().trim().max(FIELD_LIMITS.notes, "Notes are too long").optional().nullable(),

  passwordOptional: () =>
    z
      .string()
      .optional()
      .refine((v) => !v || (v.length >= FIELD_LIMITS.passwordMin && v.length <= FIELD_LIMITS.passwordMax), {
        message: `Password must be ${FIELD_LIMITS.passwordMin}–${FIELD_LIMITS.passwordMax} characters`,
      }),
};

/** Supplier / manufacturer contact forms */
export const partnerContactSchema = z.object({
  name: zodFields.companyName("Company name"),
  contactPerson: zodFields.personNameOptional("Contact person"),
  mobile: zodFields.mobileOptional(),
  email: zodFields.emailOptional(),
  address: zodFields.addressOptional(),
  gstNumber: zodFields.gstNumberOptional(),
});

export type PartnerContactFormValues = z.infer<typeof partnerContactSchema>;

export const manufacturerFormSchema = partnerContactSchema.extend({
  specialization: z.string().trim().max(200, "Specialization is too long").optional().nullable(),
});

export type ManufacturerFormValues = z.infer<typeof manufacturerFormSchema>;

export const branchFormSchema = z.object({
  name: zodFields.companyName("Branch name"),
  code: zodFields.branchCode(),
  address: zodFields.addressOptional(),
  city: zodFields.cityOptional(),
  state: zodFields.stateOptional(),
  phone: zodFields.mobileOptional(),
  email: zodFields.emailOptional(),
});

export type BranchFormValues = z.infer<typeof branchFormSchema>;

export const userFormSchema = z
  .object({
    name: zodFields.personName("Full name"),
    mobile: zodFields.mobileRequired(),
    email: zodFields.emailOptional(),
    password: zodFields.passwordOptional(),
    roleId: z.coerce.number().min(1, "Role is required"),
    branchIds: z.array(z.coerce.number()).default([]),
    supplierId: z.number().nullable().optional(),
    manufacturerId: z.number().nullable().optional(),
  })
  .refine((d) => !(d.supplierId != null && d.manufacturerId != null), {
    message: "Link a supplier or a manufacturer, not both.",
    path: ["manufacturerId"],
  });

export type UserFormValues = z.infer<typeof userFormSchema>;

export const profileFormSchema = z.object({
  name: zodFields.personName("Name"),
  mobile: zodFields.mobileRequired(),
  email: zodFields.emailOptional(),
  avatarUrl: z
    .string()
    .optional()
    .nullable()
    .or(z.literal(""))
    .refine((value) => {
      if (!value) return true;
      if (value.startsWith("/uploads/")) return true;
      try {
        // eslint-disable-next-line no-new
        new URL(value);
        return true;
      } catch {
        return false;
      }
    }, "Avatar URL must be valid"),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export const categoryFormSchema = z.object({
  name: zodFields.personName("Category name"),
  parentId: z.number().nullable().optional(),
});

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;

export const settingsFormSchema = z.object({
  companyName: zodFields.companyName("Company name"),
  gstNumber: zodFields.gstNumberOptional(),
  address: zodFields.addressOptional(),
  phone: zodFields.mobileOptional(),
  email: zodFields.emailOptional(),
  defaultGstPercent: z.coerce.number().min(0).max(100),
  invoicePrefix: z
    .string()
    .trim()
    .min(1, "Prefix is required")
    .max(FIELD_LIMITS.invoicePrefix, `Use at most ${FIELD_LIMITS.invoicePrefix} characters`)
    .regex(/^[A-Z0-9_-]+$/, "Use letters, numbers, hyphens, or underscores"),
});

export type SettingsFormValues = z.infer<typeof settingsFormSchema>;
