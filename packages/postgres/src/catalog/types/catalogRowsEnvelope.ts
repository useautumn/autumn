import {
	EntitlementSchema,
	FeatureSchema,
	FreeTrialSchema,
	PlanLicenseRowSchema,
	PriceSchema,
	ProductSchema,
} from "@autumn/shared";
import { z } from "zod/v4";

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
	free_trials: z.array(
		FreeTrialSchema.extend({ org_id: z.string(), env: z.string() }),
	),
});

export type CatalogRowsEnvelope = z.infer<typeof catalogRowsEnvelopeSchema>;

export type CatalogRowIds = {
	entitlementIds: string[];
	productInternalIds: string[];
	featureInternalIds: string[];
	priceIds: string[];
	planLicenseIds: string[];
	freeTrialIds: string[];
};
