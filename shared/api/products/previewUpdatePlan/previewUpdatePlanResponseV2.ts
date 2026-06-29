import { DiffedCustomizePlanV1Schema } from "@utils/planV1Utils/diff/diffPlanV1.js";
import { z } from "zod/v4";

export const PreviewUpdatePlanResponseV2Schema = z.object({
	will_version: z.boolean().meta({
		description: "Whether the update would create a new version.",
	}),
	current_version: z.number().meta({
		description: "The current version number of the plan.",
	}),
	diff: DiffedCustomizePlanV1Schema,
	affected_variants: z
		.array(
			z.object({
				id: z.string(),
				name: z.string(),
				latest_version: z.number(),
				would_version: z.boolean(),
			}),
		)
		.meta({
			description:
				"Variants that would be affected by propagation. Always present (possibly empty).",
		}),
});

export type PreviewUpdatePlanResponseV2 = z.infer<
	typeof PreviewUpdatePlanResponseV2Schema
>;
