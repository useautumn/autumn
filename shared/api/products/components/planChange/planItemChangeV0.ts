import { z } from "zod/v4";
import { ApiPlanItemV1Schema } from "../../items/apiPlanItemV1.js";

export const PlanItemChangeV0Schema = z.object({
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

export type PlanItemChangeV0 = z.infer<typeof PlanItemChangeV0Schema>;
