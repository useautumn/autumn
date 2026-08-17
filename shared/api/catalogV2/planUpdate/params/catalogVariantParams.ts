import { CustomizePlanV1Schema } from "@api/billing/common/customizePlan/customizePlanV1.js";
import { idRegex } from "@utils/utils.js";
import { z } from "zod/v4";

/** One `variants[]` entry: declared overlay on a variant of this base. Never follow. */
export const CatalogVariantParamsSchema = z.object({
	variant_plan_id: z.string().nonempty().regex(idRegex).meta({
		description: "The variant plan this overlay applies to.",
	}),
	version: z.number().int().min(1).optional().meta({
		description:
			"Which version of the variant this overlay targets. Omit to target latest.",
	}),
	name: z.string().nonempty().optional().meta({
		description: "Display name when creating the variant if it does not exist.",
	}),
	customize: CustomizePlanV1Schema.nullish().meta({
		description:
			"Declared overlay on this variant (items, licenses, trial, controls). Independent of `propagate`.",
	}),
});

export type CatalogVariantParams = z.infer<typeof CatalogVariantParamsSchema>;
