import { z } from "zod/v4";
import { CatalogActionSchema } from "../catalogAction.js";
import {
	CatalogFeatureUsageSchema,
	emptyCatalogFeatureUsage,
} from "./catalogFeatureUsageBucket.js";

export const CatalogFeatureUpdatePreviewReasonSchema = z.object({
	message: z.string().meta({
		description: "Presentation-ready explanation for archive/delete dialogs.",
	}),
});

export const CatalogFeatureUpdatePreviewSchema = z.object({
	feature_id: z.string(),
	name: z.string().optional(),
	action: CatalogActionSchema,
	state: z.object({
		has_customers: z.boolean().meta({
			description: "Whether any customer entitlement references this feature.",
		}),
		will_archive: z.boolean().default(false).meta({
			description:
				"For deletes: archive (dependencies exist) instead of hard delete.",
		}),
		usage: CatalogFeatureUsageSchema.default(() =>
			emptyCatalogFeatureUsage(),
		).meta({
			description:
				"Capped dependency counts/samples (plan items, credit systems, customers).",
		}),
		reasons: z
			.array(CatalogFeatureUpdatePreviewReasonSchema)
			.default(() => [])
			.meta({
				description:
					"Ready-made dialog lines explaining why a delete archives (or other blockers).",
			}),
	}),
	previous_attributes: z.record(z.string(), z.unknown()).nullable().meta({
		description:
			"Changed feature fields holding their previous values. Null when nothing changed or the feature is new.",
	}),
});

export type CatalogFeatureUpdatePreview = z.infer<
	typeof CatalogFeatureUpdatePreviewSchema
>;
export type CatalogFeatureUpdatePreviewReason = z.infer<
	typeof CatalogFeatureUpdatePreviewReasonSchema
>;
