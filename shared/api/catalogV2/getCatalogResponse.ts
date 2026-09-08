import { ApiFeatureV1Schema } from "@api/features/apiFeatureV1.js";
import { ApiPlanExpandedV1Schema } from "@api/products/apiPlanV1.js";
import { z } from "zod/v4";
import {
	CatalogReferralProgramV1Schema,
	CatalogRewardV1Schema,
} from "./rewardUpdate/components/catalogRewardV1.js";

/**
 * The entire catalog: features plus the latest version of each top-level plan,
 * with license plans and variants expanded. Variants appear ONLY nested under
 * their base — never as top-level plans.
 */
export const GetCatalogResponseSchema = z.object({
	features: z.array(ApiFeatureV1Schema),
	plans: z.array(ApiPlanExpandedV1Schema),
	rewards: z.array(CatalogRewardV1Schema).meta({
		description:
			"Coupons and feature grants. Free-product rewards are omitted — the catalog does not state them.",
	}),
	referral_programs: z.array(CatalogReferralProgramV1Schema),
});

export type GetCatalogResponse = z.infer<typeof GetCatalogResponseSchema>;
