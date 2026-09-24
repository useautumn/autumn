import {
	EntitlementSchema,
	FeatureSchema,
	FreeTrialSchema,
	PlanLicenseRowSchema,
	PriceSchema,
	ProductSchema,
} from "@autumn/shared";
import { z } from "zod/v4";

/** The catalog rows a set of ids names, fetched in one round trip. */
export const catalogRowsEnvelopeSchema = z.object({
	entitlements: z.array(EntitlementSchema),
	products: z.array(ProductSchema),
	features: z.array(FeatureSchema),
	prices: z.array(PriceSchema),
	plan_licenses: z.array(
		PlanLicenseRowSchema.extend({
			org_id: z.string(),
			env: z.string(),
			price_ids: z.array(z.string()),
			entitlement_ids: z.array(z.string()),
			internal_feature_ids: z.array(z.string()),
		}),
	),
	/** Scoped by the product each trial belongs to: the table carries no org or env of its own. */
	free_trials: z.array(
		FreeTrialSchema.extend({ org_id: z.string(), env: z.string() }),
	),
});

export type CatalogRowsEnvelope = z.infer<typeof catalogRowsEnvelopeSchema>;

/** Which rows to fetch: entitlements, prices, plan licenses and free trials by id, products and features by internal_id. */
export type CatalogRowIds = {
	entitlementIds: string[];
	productInternalIds: string[];
	featureInternalIds: string[];
	priceIds: string[];
	planLicenseIds: string[];
	freeTrialIds: string[];
};
