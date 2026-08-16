import { LicenseCustomizeSchema } from "@models/licenseModels/licenseModels.js";
import { idRegex } from "@utils/utils.js";
import { z } from "zod/v4";
import { CatalogPlanVersioningStrategySchema } from "../versioning.js";

/** One `variants[]` entry: declared overlay on a variant of this base. Never follow. */
export const CatalogVariantParamsSchema = z.object({
	variant_plan_id: z.string().nonempty().regex(idRegex).meta({
		description: "The variant plan this overlay applies to.",
	}),
	version: z.number().int().min(1).optional().meta({
		description:
			"Which version of the variant this overlay targets. Omit to target latest.",
	}),
	versioning: CatalogPlanVersioningStrategySchema.optional().meta({
		description:
			"How this overlay applies across the variant's versions. Omit or `existing` = the resolved row only.",
	}),
	name: z.string().nonempty().optional().meta({
		description: "Display name when creating the variant if it does not exist.",
	}),
	customize: LicenseCustomizeSchema.nullish().meta({
		description:
			"Declared overlay on this variant. Independent of whether the variant follows via `propagate`.",
	}),
});

export type CatalogVariantParams = z.infer<typeof CatalogVariantParamsSchema>;
