import { ApiPlanLicenseV1Schema } from "@api/products/apiPlanLicenseV1.js";
import { z } from "zod/v4";
import { CatalogActionSchema } from "../../components/catalogAction.js";
import { CatalogCorePreviewSchema } from "./catalogCorePreview.js";
import { CatalogLicenseParentPreviewSchema } from "./catalogLicenseParentPreview.js";
import { CatalogSiblingVersionPreviewSchema } from "./catalogSiblingVersionPreview.js";
import { CatalogPlanVersioningSchema } from "./catalogVersioningPreview.js";

/**
 * One direct `plans[]` entry from the request.
 * Related versions nest under `sibling_versions`.
 */
export const CatalogPlanUpdatePreviewSchema = CatalogCorePreviewSchema.extend({
	name: z.string().optional(),
	action: CatalogActionSchema,
	versioning: CatalogPlanVersioningSchema.nullable(),
	sibling_versions: z
		.array(CatalogSiblingVersionPreviewSchema)
		.optional()
		.meta({
			description:
				"Other existing versions of this plan. Omitted when there are none, or when more than one entry in this update targets the same plan (`all_versions` is unavailable then).",
		}),
	license_parents: z.array(CatalogLicenseParentPreviewSchema).optional().meta({
		internal: true,
		description:
			"Parents offering this plan as a license and how each one's planLicense resolves against this entry's change. Omitted when the plan is not a license.",
	}),
	licenses: z.array(ApiPlanLicenseV1Schema).optional().meta({
		description:
			"planLicenses on this plan after the update. Omitted when there are none.",
	}),
});

export type CatalogPlanUpdatePreview = z.infer<
	typeof CatalogPlanUpdatePreviewSchema
>;
