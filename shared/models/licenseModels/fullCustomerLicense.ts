import { z } from "zod/v4";
import type { DbCustomerLicense } from "./customerLicenseTable";
import {
	type FullPlanLicense,
	FullPlanLicenseSchema,
} from "./fullPlanLicenseModel";

/** Customer license row hydrated with its effective plan license (customer
 * override when one exists, else the catalog link) and that license's
 * product. planLicense is null when the link was removed — reconcile owns
 * those. */
export type FullCustomerLicense = DbCustomerLicense & {
	planLicense: FullPlanLicense | null;
};

/** Schema mirror of the drizzle row, used by the cache sanitize walker —
 * keep fields in sync with customerLicenseTable. */
const dbCustomerLicenseShape = z.object({
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
	dbCustomerLicenseShape;

export const FullCustomerLicenseSchema: z.ZodType<FullCustomerLicense> =
	dbCustomerLicenseShape.extend({
		planLicense: FullPlanLicenseSchema.nullable(),
	});
