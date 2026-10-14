import { z } from "zod/v4";
import {
	type Price,
	PriceSchema,
} from "../productModels/priceModels/priceModels";
import {
	type FullProductWithoutLicenses,
	FullProductWithoutLicensesSchema,
	type FullProductWithoutParentLicenses,
} from "../productModels/productModels";
import type { DbPlanLicense } from "./planLicenseTable";

export type FullPlanLicense = DbPlanLicense & {
	product: FullProductWithoutLicenses;
	base_product?: FullProductWithoutLicenses;
};

export const PlanLicenseRowSchema = z.object({
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
});

export const FullPlanLicenseSchema: z.ZodType<FullPlanLicense> =
	PlanLicenseRowSchema.extend({
		product: z.lazy(() => FullProductWithoutLicensesSchema),
		base_product: z.lazy(() => FullProductWithoutLicensesSchema).optional(),
	});
export type ParentPlanLicense = DbPlanLicense & {
	product: FullProductWithoutParentLicenses;
	license_prices: Price[];
};

export const ParentPlanLicenseSchema: z.ZodType<ParentPlanLicense> =
	z.intersection(
		FullPlanLicenseSchema,
		z.object({ license_prices: z.array(PriceSchema) }),
	);
