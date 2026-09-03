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
	internal_id: z.string().nullable().meta({
		description:
			"Stable id of this row. Null when the row is minted by this update — the applied result carries the id it received.",
		internal: true,
	}),
	new_plan_id: z.string().optional().meta({
		description: "Present only when this row's public plan id changes.",
	}),
	version: z.number().int().min(1),
	version_slug: z.string().meta({
		description:
			"Current slug of this row. On mint, the default `v{n}` it would receive.",
	}),
	new_version_slug: z.string().optional().meta({
		description: "Present only when this row's version slug changes.",
	}),
	active: z.boolean().meta({
		description: "Whether this row holds the active pointer after apply.",
	}),
	promotion_details: z
		.object({
			previous_active_version_slug: z.string(),
		})
		.optional()
		.meta({
			description:
				"Present when this row takes the active pointer from another version. Object presence is the signal.",
		}),
	state: CatalogPreviewStateSchema,
	plan_change: PlanChangeV0Schema.nullish().meta({
		description:
			"Diff between the current and desired plan definition. Omitted (or null) when the plan is new, removed, or unchanged.",
	}),
});

export type CatalogPreviewState = z.infer<typeof CatalogPreviewStateSchema>;
export type CatalogCorePreview = z.infer<typeof CatalogCorePreviewSchema>;
