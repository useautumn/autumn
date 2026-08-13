import { PlanChangeV0Schema } from "@api/products/components/planChange/planChangeV0.js";
import { z } from "zod/v4";
import { CatalogActionSchema } from "../catalogAction.js";
import { CatalogPlanVersioningSchema } from "./catalogPlanVersioning.js";

export const CatalogPlanUpdatePreviewSchema = z.object({
	plan_id: z.string(),
	name: z.string().optional(),
	action: CatalogActionSchema,
	state: z.object({
		has_customers: z.boolean(),
		will_archive: z.boolean().default(false).meta({
			description:
				"For deletes: archive (customers exist) instead of hard delete.",
		}),
	}),
	versioning: CatalogPlanVersioningSchema.nullable(),
	plan_change: PlanChangeV0Schema.nullish().meta({
		description:
			"Diff between the current and desired plan definition. Omitted (or null) when the plan is new, removed, or unchanged.",
	}),
});

export type CatalogPlanUpdatePreview = z.infer<
	typeof CatalogPlanUpdatePreviewSchema
>;
