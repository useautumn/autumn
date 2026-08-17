import { z } from "zod/v4";
import { CatalogConflictPreviewSchema } from "./catalogConflictPreview.js";
import { CatalogCorePreviewSchema } from "./catalogCorePreview.js";

export const CatalogVariantActionSchema = z
	.enum(["unchanged", "propagated", "explicit"])
	.meta({
		description:
			"How this variant resolved against the base edit: frozen (`unchanged`), followed the base (`propagated`), or the base sent `variants[]` (`explicit`).",
	});

/**
 * One variant a base-plan edit fans out to, nested under the base's
 * direct preview row.
 */
export const CatalogVariantPreviewSchema = CatalogCorePreviewSchema.extend({
	variant_action: CatalogVariantActionSchema.optional().meta({
		internal: true,
		description: "How this variant treated the base edit.",
	}),
	conflicts: z.array(CatalogConflictPreviewSchema).optional().meta({
		description:
			"Base-edit slots this variant already overrides. Surfaced, never blocking.",
	}),
});

export type CatalogVariantAction = z.infer<typeof CatalogVariantActionSchema>;
export type CatalogVariantPreview = z.infer<typeof CatalogVariantPreviewSchema>;
