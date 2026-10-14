import {
	CreateRewardCouponRequestSchema,
	CreateRewardFeatureGrantRequestSchema,
} from "@api/rewards/rewardsCreateOpModels.js";
import { z } from "zod/v4";

export const CatalogCouponParamsSchema = CreateRewardCouponRequestSchema;

export const CatalogFeatureGrantParamsSchema =
	CreateRewardFeatureGrantRequestSchema;

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
