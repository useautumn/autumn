import { z } from "zod/v4";
import { CatalogLicenseParentPreviewSchema } from "./catalogLicenseParentPreview.js";
import { CatalogSiblingVersionPreviewSchema } from "./catalogSiblingVersionPreview.js";
import { CatalogVariantPreviewSchema } from "./catalogVariantPreview.js";

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
		variants: z
			.array(CatalogVariantPreviewSchema)
			.optional()
			.meta({
				internal: true,
				description:
					"Variant rows anchored to this sibling version. Only present on `all_versions` edits, where each sibling receives its own follow diff.",
			}),
	});

export type CatalogPlanSiblingVersionPreview = z.infer<
	typeof CatalogPlanSiblingVersionPreviewSchema
>;
