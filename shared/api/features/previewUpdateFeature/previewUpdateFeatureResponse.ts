import { ApiFeatureV1Schema } from "../apiFeatureV1.js";
import { z } from "zod/v4";

export const PreviewUpdateFeatureReasonSchema = z
	.enum([
		"has_customers",
		"used_in_products",
		"used_in_credit_system",
		"has_usage_price",
		"id_already_exists",
		"credit_system_type_change",
		"unsupported_dependency",
	])
	.nullable();

export const PreviewUpdateFeatureActionSchema = z.enum([
	"create",
	"update",
	"remove",
	"none",
]);

export const PreviewUpdateFeatureResponseSchema = z.object({
	feature_id: z.string().meta({
		description: "The ID of the feature being previewed.",
	}),
	feature: ApiFeatureV1Schema.nullable().optional().meta({
		description:
			"The resolved feature after the previewed update. Only present when expand includes 'feature'. Null for remove actions.",
	}),
	action: PreviewUpdateFeatureActionSchema,
	will_archive: z.boolean().meta({
		description:
			"Whether applying this derived removal archives the feature instead of deleting it.",
	}),
	blocked: z.boolean().meta({
		description: "Whether this feature update would be skipped by catalog.update.",
	}),
	blocked_reason: PreviewUpdateFeatureReasonSchema.meta({
		description: "Concise reason the feature update is skipped, or null.",
	}),
	previous_attributes: z.record(z.string(), z.unknown()).nullable().meta({
		description:
			"Sparse map of changed feature fields and their previous values. For remove, contains the removed feature identity.",
	}),
});

export type PreviewUpdateFeatureResponse = z.infer<
	typeof PreviewUpdateFeatureResponseSchema
>;
export type PreviewUpdateFeatureReason = z.infer<
	typeof PreviewUpdateFeatureReasonSchema
>;
export type PreviewUpdateFeatureAction = z.infer<
	typeof PreviewUpdateFeatureActionSchema
>;
