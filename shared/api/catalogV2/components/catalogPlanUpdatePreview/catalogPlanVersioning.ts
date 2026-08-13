import { z } from "zod/v4";

/** Null on the parent preview when versioning doesn't apply (create / delete / skip). */
export const CatalogPlanVersioningSchema = z.object({
	current_version: z.number().int(),
	new_version: z.number().int().nullable().meta({
		description:
			"Version that applying would create. Null when the update stays in place.",
	}),
	resolved: z.enum(["in_place", "new_version"]).meta({
		description:
			"What actually happens to this plan with the requested params.",
	}),
	options: z.array(
		z.object({
			strategy: z.enum(["in_place", "new_version", "all_versions"]),
			available: z.boolean(),
			reason: z.string().optional().meta({
				description:
					"Why the strategy is unavailable. Only set when available is false.",
			}),
		}),
	),
});

export type CatalogPlanVersioning = z.infer<typeof CatalogPlanVersioningSchema>;
