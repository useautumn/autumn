import { z } from "zod/v4";
import { CatalogLicenseParentPreviewSchema } from "./catalogLicenseParentPreview.js";
import { CatalogSiblingVersionPreviewSchema } from "./catalogSiblingVersionPreview.js";

/**
 * Another version of a plan `plans[]` row. `license_parents` is who
 * currently points at THIS version — not the edited row.
 */
export const CatalogPlanSiblingVersionPreviewSchema =
	CatalogSiblingVersionPreviewSchema.extend({
		license_parents: z
			.array(CatalogLicenseParentPreviewSchema)
			.optional()
			.meta({
				internal: true,
				description:
					"Parents whose planLicense still points at this sibling version. Omitted when none do, or when this version is itself a direct `plans[]` entry.",
			}),
	});

export type CatalogPlanSiblingVersionPreview = z.infer<
	typeof CatalogPlanSiblingVersionPreviewSchema
>;
