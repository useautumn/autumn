import { z } from "zod/v4";
import type { DbCustomerLicense } from "./customerLicenseTable";
import {
	type FullPlanLicense,
	FullPlanLicenseSchema,
} from "./fullPlanLicenseModel";

export type FullCustomerLicense = DbCustomerLicense & {
	planLicense: FullPlanLicense | null;
};

export const CustomerLicenseRowSchema = z.object({
	id: z.string(),
	link_id: z.string(),
	internal_customer_id: z.string(),
	parent_customer_product_id: z.string(),
	license_internal_product_id: z.string(),
	plan_license_id: z.string().nullable(),
	granted: z.number(),
	remaining: z.number(),
	paid_quantity: z.number(),
	created_at: z.number(),
	updated_at: z.number(),
});

export const DbCustomerLicenseSchema: z.ZodType<DbCustomerLicense> =
	CustomerLicenseRowSchema;

export const FullCustomerLicenseSchema: z.ZodType<FullCustomerLicense> =
	CustomerLicenseRowSchema.extend({
		planLicense: FullPlanLicenseSchema.nullable(),
	});
