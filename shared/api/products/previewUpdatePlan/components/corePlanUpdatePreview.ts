import { DiffedCustomizePlanV1Schema } from "@utils/planV1Utils/diff/diffPlanV1.js";
import { z } from "zod/v4";
import { ApiPlanV1Schema } from "../../apiPlanV1.js";
import {
	PlanUpdatePreviewItemChangeSchema,
	PlanUpdatePreviewLicenseChangeSchema,
	PlanUpdatePreviewPriceChangeSchema,
} from "./planUpdatePreviewChanges.js";

export const CorePlanUpdatePreviewSchema = z.object({
	plan_id: z.string().meta({
		description: "The ID of the plan being previewed.",
	}),
	plan: ApiPlanV1Schema.optional().meta({
		description:
			"The resolved plan after the previewed update. Only present when expand includes 'plan'.",
	}),
	has_customers: z.boolean().meta({
		description:
			"Whether the current plan has customers that could be affected by applying this update.",
	}),
	customer_count: z.number().default(0).meta({
		description:
			"Number of customers on this plan version that are eligible to be migrated by this update.",
	}),
	versionable: z.boolean().meta({
		description:
			"Whether applying this update would create a new plan version under the current versioning flags.",
	}),
	customize: DiffedCustomizePlanV1Schema.nullable().meta({
		description:
			"The customize patch that would transform the current plan into the previewed plan.",
	}),
	previous_attributes: z.record(z.string(), z.unknown()).nullable().meta({
		description:
			"Sparse map of non-price scalar plan fields whose values changed, holding their previous values. Null when there is no previous plan.",
	}),
	price_change: PlanUpdatePreviewPriceChangeSchema.optional().meta({
		description:
			"The resolved previous and current base price when the update changes the plan's base price. Omitted when price is unchanged.",
	}),
	item_changes: z.array(PlanUpdatePreviewItemChangeSchema).default([]).meta({
		description: "Items that would be added to or removed from this plan.",
	}),
	license_changes: z
		.array(PlanUpdatePreviewLicenseChangeSchema)
		.default([])
		.meta({
			description: "License links that would be created, updated, or removed.",
		}),
});

export type CorePlanUpdatePreview = z.infer<typeof CorePlanUpdatePreviewSchema>;
