import { idRegex } from "@utils/utils.js";
import { z } from "zod/v4";
import { CatalogPlanVersioningStrategySchema } from "../versioning.js";

/** One follow target: a variant or a license parent of this plan. */
export const CatalogPropagateTargetParamsSchema = z.object({
	plan_id: z.string().nonempty().regex(idRegex).meta({
		description: "The plan that should follow this entry's content change.",
	}),
	version: z.number().int().min(1).optional().meta({
		description:
			"Which version of the target follows. Omit to target latest.",
	}),
	versioning: CatalogPlanVersioningStrategySchema.optional().meta({
		description:
			"How this follow applies across the target's versions. Omit or `existing` = the resolved row only; `all_versions` = every other existing version of the target; `new_version` = mint max+1 on the target.",
	}),
});

/**
 * Who follows this plan's content change. Omitted relatives are frozen.
 * Nested hops (`variants[].propagate`) are out of scope.
 */
export const CatalogPropagateParamsSchema = z.object({
	variants: z.array(CatalogPropagateTargetParamsSchema).optional().meta({
		internal: true,
		description:
			"Variant plans that should follow this base edit. Listed, no customize = keep drift.",
	}),
	license_parents: z
		.array(CatalogPropagateTargetParamsSchema)
		.optional()
		.meta({
			internal: true,
			description:
				"Parent plans offering this plan as a license that should follow this edit.",
		}),
});

export type CatalogPropagateTargetParams = z.infer<
	typeof CatalogPropagateTargetParamsSchema
>;
export type CatalogPropagateParams = z.infer<
	typeof CatalogPropagateParamsSchema
>;
