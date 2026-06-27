import { ApiPlanV1Schema } from "../../apiPlanV1.js";
import { ApiPlanItemV1Schema } from "../../items/apiPlanItemV1.js";
import { z } from "zod/v4";

export const PlanUpdatePreviewPriceChangeSchema = z.object({
	previous: ApiPlanV1Schema.shape.price.meta({
		description: "The plan's base price before the previewed update.",
	}),
	current: ApiPlanV1Schema.shape.price.meta({
		description: "The plan's base price after the previewed update.",
	}),
});

export const PlanUpdatePreviewItemChangeSchema = z.object({
	action: z.enum(["created", "deleted"]).meta({
		description: "Whether the item was added to or removed from the plan.",
	}),
	feature_id: z.string().meta({
		description: "The ID of the feature that was added or removed.",
	}),
	item: ApiPlanItemV1Schema.meta({
		description: "The plan item snapshot that was added or removed.",
	}),
});

export type PlanUpdatePreviewItemChange = z.infer<
	typeof PlanUpdatePreviewItemChangeSchema
>;

export type PlanUpdatePreviewPriceChange = z.infer<
	typeof PlanUpdatePreviewPriceChangeSchema
>;
