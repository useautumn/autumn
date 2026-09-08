import {
	CreateRewardCouponRequestSchema,
	CreateRewardFeatureGrantRequestSchema,
} from "@api/rewards/rewardsCreateOpModels.js";
import { z } from "zod/v4";

// The create schemas already carry `internal_id`, so the catalog states a
// reward with exactly the body the rewards API takes.
export const CatalogCouponParamsSchema = CreateRewardCouponRequestSchema;

export const CatalogFeatureGrantParamsSchema =
	CreateRewardFeatureGrantRequestSchema;

/**
 * One desired reward. Free-product and invoice-credit rewards have no branch:
 * the catalog neither states nor touches them.
 */
export const UpdateCatalogRewardParamsSchema = z.union([
	z.object({ coupon: CatalogCouponParamsSchema }).strict(),
	z.object({ feature_grant: CatalogFeatureGrantParamsSchema }).strict(),
]);

export type CatalogCouponParams = z.infer<typeof CatalogCouponParamsSchema>;
export type CatalogFeatureGrantParams = z.infer<
	typeof CatalogFeatureGrantParamsSchema
>;
export type UpdateCatalogRewardParams = z.infer<
	typeof UpdateCatalogRewardParamsSchema
>;
