import { z } from "zod/v4";
import {
	type Price,
	PriceSchema,
} from "../productModels/priceModels/priceModels";
import {
	type FullProductWithoutLicenses,
	FullProductWithoutLicensesSchema,
} from "../productModels/productModels";
import type { DbPlanLicense } from "./planLicenseTable";

export type FullPlanLicense = DbPlanLicense & {
	product: FullProductWithoutLicenses;
	base_product?: FullProductWithoutLicenses;
};

export const FullPlanLicenseSchema: z.ZodType<FullPlanLicense> = z.object({
	id: z.string(),
	parent_internal_product_id: z.string(),
	is_custom: z.boolean(),
	license_internal_product_id: z.string(),
	included: z.number(),
	prepaid_only: z.boolean(),
	customized: z.boolean(),
	metadata: z.record(z.string(), z.unknown()).nullable(),
	created_at: z.number(),
	updated_at: z.number(),
	// Defers module initialization only; the product shape cannot nest licenses.
	product: z.lazy(() => FullProductWithoutLicensesSchema),
	base_product: z.lazy(() => FullProductWithoutLicensesSchema).optional(),
});
/** The same catalog link seen from the license side: product is the PARENT
 * plan offering this license. */
export type ParentPlanLicense = DbPlanLicense & {
	product: FullProductWithoutLicenses;
	license_prices: Price[];
};

export const ParentPlanLicenseSchema: z.ZodType<ParentPlanLicense> =
	z.intersection(
		FullPlanLicenseSchema,
		z.object({ license_prices: z.array(PriceSchema) }),
	);
