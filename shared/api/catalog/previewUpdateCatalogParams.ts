/** biome-ignore-all assist/source/organizeImports: schema initialization order avoids a cycle */
import { CreateFeatureV2ParamsSchema } from "@api/features/crud/createFeatureParams.js";
import { UpdatePlanParamsV2Schema } from "@api/products/crud/updatePlanParamsV1.js";
import { MigrationParamsSchema } from "@api/products/crud/migrationParams.js";
import { PreviewUpdatePlanDetailParamsSchema } from "@api/products/previewUpdatePlan/previewUpdatePlanParamsV2.js";
import { CreateReferralProgramParamsSchema } from "@api/referralPrograms/referralProgramsCreateOpModels.js";
import { CreateRewardParamsSchema } from "@api/rewards/rewardsCreateOpModels.js";
import { z } from "zod/v4";

export const CatalogPlanParamsSchema = UpdatePlanParamsV2Schema.extend(
	PreviewUpdatePlanDetailParamsSchema.shape,
);

/**
 * A batch change to the org's catalog (features + plans), applied/previewed in
 * one call. Plans are upserted by `plan_id` (exists → update, else create);
 * features by `feature_id`. `disable_version` per plan controls in-place vs
 * versioned updates (same semantics as plans.update).
 */
export const CatalogUpdateParamsSchema = z
	.object({
		features: z.array(CreateFeatureV2ParamsSchema).optional().default([]),
		plans: z.array(CatalogPlanParamsSchema).optional().default([]),
		rewards: z.array(CreateRewardParamsSchema).optional(),
		referral_programs: z.array(CreateReferralProgramParamsSchema).optional(),
		skip_deletions: z.boolean().optional().default(true),
		skip_feature_ids: z.array(z.string()).optional().default([]),
		skip_plan_ids: z.array(z.string()).optional().default([]),
		expand: z.array(z.string()).optional(),
		migration: MigrationParamsSchema.optional(),
	})
	.superRefine(({ rewards, referral_programs }, ctx) => {
		for (const [path, ids] of [
			[
				"rewards",
				rewards?.flatMap((reward) => {
					const id = reward.coupon?.id ?? reward.feature_grant?.id;
					return id ? [id] : [];
				}) ?? [],
			],
			["referral_programs", referral_programs?.map(({ id }) => id) ?? []],
		] as const) {
			if (new Set(ids).size !== ids.length) {
				ctx.addIssue({
					code: "custom",
					message: `${path} IDs must be unique`,
					path: [path],
				});
			}
		}
	});

export type CatalogPlanParams = z.infer<typeof CatalogPlanParamsSchema>;
export type CatalogUpdateParams = z.infer<typeof CatalogUpdateParamsSchema>;
export type CatalogUpdateParamsInput = z.input<
	typeof CatalogUpdateParamsSchema
>;
