import { z } from "zod/v4";
import { CatalogActionSchema } from "../../components/catalogAction.js";

export const CatalogRewardKindSchema = z
	.enum(["coupon", "feature_grant"])
	.meta({
		description:
			"Which branch of the reward the config states. Free-product rewards have no branch and never appear here.",
	});

export const CatalogRewardUpdatePreviewSchema = z.object({
	id: z.string(),
	internal_id: z.string().nullable().meta({
		description:
			"Stable id of the row this preview is about. Null on create — the applied result carries the id the row received.",
		internal: true,
	}),
	name: z.string().nullish(),
	kind: CatalogRewardKindSchema,
	action: CatalogActionSchema,
	previous_attributes: z.record(z.string(), z.unknown()).nullable().meta({
		description:
			"Changed reward fields holding their previous values. Null when nothing changed or the reward is new.",
	}),
});

export const CatalogReferralProgramUpdatePreviewSchema = z.object({
	id: z.string(),
	internal_id: z.string().nullable().meta({
		description: "Stable id of the row this preview is about. Null on create.",
		internal: true,
	}),
	reward_id: z.string().nullish(),
	action: CatalogActionSchema,
	previous_attributes: z.record(z.string(), z.unknown()).nullable().meta({
		description:
			"Changed referral program fields holding their previous values. Null when nothing changed or the program is new.",
	}),
});

export type CatalogRewardKind = z.infer<typeof CatalogRewardKindSchema>;
export type CatalogRewardUpdatePreview = z.infer<
	typeof CatalogRewardUpdatePreviewSchema
>;
export type CatalogReferralProgramUpdatePreview = z.infer<
	typeof CatalogReferralProgramUpdatePreviewSchema
>;
