import {
	PlanUpdatePreviewItemChangeSchema,
	PlanUpdatePreviewPriceChangeSchema,
} from "@api/products/previewUpdatePlan/components/planUpdatePreviewChanges.js";
import { DiffedCustomizePlanV1Schema } from "@utils/planV1Utils/diff/diffPlanV1.js";
import { z } from "zod/v4";

/** Everything that would change about the plan's content. Null on the parent when nothing changes. */
export const CatalogPlanChangesSchema = z.object({
	customize: DiffedCustomizePlanV1Schema.nullable().meta({
		description:
			"Diff that would transform the current plan into the desired plan.",
	}),
	previous_attributes: z.record(z.string(), z.unknown()).nullable().meta({
		description:
			"Changed scalar plan fields holding their previous values. Null when the plan is new.",
	}),
	price_change: PlanUpdatePreviewPriceChangeSchema.optional(),
	item_changes: z.array(PlanUpdatePreviewItemChangeSchema).default([]),
});

export type CatalogPlanChanges = z.infer<typeof CatalogPlanChangesSchema>;
