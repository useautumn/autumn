import { PlanChangeV0Schema } from "@api/products/components/planChange/planChangeV0.js";
import { z } from "zod/v4";
import { CatalogPlanUsageSchema } from "./catalogPlanUsage.js";

export const CatalogPreviewStateSchema = z.object({
	has_customers: z.boolean(),
	will_archive: z.boolean().default(false).meta({
		description:
			"For deletes: archive (customers exist) instead of hard delete.",
	}),
	usage: CatalogPlanUsageSchema.optional().meta({
		description:
			"Capped customer count/samples for this row. Present on upserts and nested migrate targets when preview loaded usage.",
	}),
});

/** Shared kernel for a plan row in catalog preview (direct, sibling, or license parent). */
export const CatalogCorePreviewSchema = z.object({
	plan_id: z.string(),
	version: z.number().int().min(1),
	state: CatalogPreviewStateSchema,
	plan_change: PlanChangeV0Schema.nullish().meta({
		description:
			"Diff between the current and desired plan definition. Omitted (or null) when the plan is new, removed, or unchanged.",
	}),
});

export type CatalogPreviewState = z.infer<typeof CatalogPreviewStateSchema>;
export type CatalogCorePreview = z.infer<typeof CatalogCorePreviewSchema>;
