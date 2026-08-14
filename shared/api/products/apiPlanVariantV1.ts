import { z } from "zod/v4";
import {
	CustomizePlanV1BaseSchema,
	refineCustomizePlanV1Schema,
} from "../billing/common/customizePlan/customizePlanV1.js";
import { ApiPlanV1Schema } from "./apiPlanV1.js";

export const VariantCustomizeSchema = refineCustomizePlanV1Schema(
	CustomizePlanV1BaseSchema.omit({
		items: true,
		upsert_licenses: true,
	}).strict(),
	{ includeItems: false, includeLicenses: false },
);

/** A base plan's down-link to a variant derived from it. */
export const ApiPlanVariantV1Schema = z.object({
	variant_plan_id: z.string().meta({
		description: "The plan ID of the variant derived from this base plan.",
	}),
	name: z.string().meta({
		description: "Display name of the variant plan.",
	}),
	customize: VariantCustomizeSchema.optional().meta({
		description:
			"The variant's declared divergence from its base plan — exactly what you would re-submit to recreate it.",
	}),
	plan: z
		.lazy(() => ApiPlanV1Schema.omit({ variant_details: true }))
		.optional()
		.meta({
			description:
				"The variant's fully resolved plan (base + customize applied). Present when variants are expanded.",
		}),
});

export type ApiPlanVariantV1 = z.infer<typeof ApiPlanVariantV1Schema>;
