import { idRegex } from "@utils/utils.js";
import { z } from "zod/v4";

/**
 * One follow target. Pins a row via `version`/`version_slug` under
 * `existing`/`all_versions`; plan-level (no pin) under `new_version`.
 */
export const CatalogPropagateTargetParamsSchema = z
	.object({
		plan_id: z.string().nonempty().regex(idRegex).meta({
			description: "The plan that should follow this entry's content change.",
		}),
		version: z.number().int().min(1).optional().meta({
			description:
				"Which version of the target follows. Required unless the source versioning is `new_version`, where the server resolves the row.",
		}),
		version_slug: z.string().nonempty().regex(idRegex).optional().meta({
			description:
				"Which version of the target follows, by slug. Same pin as `version`; at most one of the two.",
		}),
		new_version_slug: z.string().nonempty().regex(idRegex).optional().meta({
			description:
				"Names the row this follow mints. Defaults to `v{version}`. Errors if another version of the target already holds it.",
		}),
	})
	.refine(
		(target) =>
			target.version === undefined || target.version_slug === undefined,
		{
			message: "Cannot specify both version and version_slug.",
			path: ["version_slug"],
		},
	);

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
	license_parents: z.array(CatalogPropagateTargetParamsSchema).optional().meta({
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
