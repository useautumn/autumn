import { z } from "zod/v4";
import { CatalogConflictPreviewSchema } from "./catalogConflictPreview.js";
import { CatalogCorePreviewSchema } from "./catalogCorePreview.js";
import { CatalogSiblingVersionPreviewSchema } from "./catalogSiblingVersionPreview.js";
import { CatalogPlanVersioningSchema } from "./catalogVersioningPreview.js";

export const CatalogVariantActionSchema = z
	.enum(["unchanged", "propagated", "explicit"])
	.meta({
		description:
			"How this variant resolved against the base edit: frozen (`unchanged`), followed the base (`propagated`), or the base sent `variants[]` (`explicit`).",
	});

/** Another existing version of this variant that could receive the base edit. */
export const CatalogVariantVersionPreviewSchema =
	CatalogSiblingVersionPreviewSchema.extend({
		variant_action: CatalogVariantActionSchema.optional().meta({
			internal: true,
			description: "How this variant version treated the base edit.",
		}),
		conflicts: z.array(CatalogConflictPreviewSchema).optional().meta({
			description:
				"Base-edit slots this variant version already overrides. Surfaced for scope decisions, never blocking.",
		}),
	});

/**
 * One variant plan a base edit could fan out to. Reports the latest/current
 * target, with every other existing version under `sibling_versions`.
 */
export const CatalogVariantPreviewSchema = CatalogCorePreviewSchema.extend({
	versioning: CatalogPlanVersioningSchema.optional().meta({
		description:
			"How this variant plan's inherited target scope resolved, including whether new_version minted or fell back to existing.",
	}),
	variant_action: CatalogVariantActionSchema.optional().meta({
		internal: true,
		description: "How this variant treated the base edit.",
	}),
	conflicts: z.array(CatalogConflictPreviewSchema).optional().meta({
		description:
			"Base-edit slots this variant already overrides. Surfaced, never blocking.",
	}),
	sibling_versions: z
		.array(CatalogVariantVersionPreviewSchema)
		.optional()
		.meta({
			description:
				"Other existing versions of this variant that could receive the base edit. Each version reports whether it is unchanged, propagated, or explicit.",
		}),
});

export type CatalogVariantAction = z.infer<typeof CatalogVariantActionSchema>;
export type CatalogVariantVersionPreview = z.infer<
	typeof CatalogVariantVersionPreviewSchema
>;
export type CatalogVariantPreview = z.infer<typeof CatalogVariantPreviewSchema>;
