import { CatalogFeatureUpdatePreviewReasonSchema } from "@api/catalogV2/components/catalogFeatureUpdatePreview/catalogFeatureUpdatePreview.js";
import { ApiPlanLicenseV1Schema } from "@api/products/apiPlanLicenseV1.js";
import { z } from "zod/v4";
import { CatalogActionSchema } from "../../components/catalogAction.js";
import { CatalogCorePreviewSchema, CatalogPreviewStateSchema } from "./catalogCorePreview.js";
import { CatalogLicenseParentPreviewSchema } from "./catalogLicenseParentPreview.js";
import {
	CatalogPlanUsageSchema,
	emptyCatalogPlanUsage,
} from "./catalogPlanUsage.js";
import { CatalogPlanSiblingVersionPreviewSchema } from "./catalogPlanSiblingVersionPreview.js";
import { CatalogVariantPreviewSchema } from "./catalogVariantPreview.js";
import { CatalogPlanVersioningSchema } from "./catalogVersioningPreview.js";
import { PlanAliasReplacementSchema } from "./planAliasReplacement.js";

/**
 * One direct `plans[]` entry from the request.
 * Related versions nest under `sibling_versions`.
 */
export const CatalogPlanUpdatePreviewSchema = CatalogCorePreviewSchema.extend({
	name: z.string().optional(),
	action: CatalogActionSchema,
	state: CatalogPreviewStateSchema.extend({
		usage: CatalogPlanUsageSchema.default(() => emptyCatalogPlanUsage()).meta({
			description:
				"Capped dependency counts/samples (customers, license parents, reward programs, variants).",
		}),
		reasons: z
			.array(CatalogFeatureUpdatePreviewReasonSchema)
			.default(() => [])
			.meta({
				description:
					"Ready-made dialog lines explaining why a delete archives (or other blockers).",
			}),
	}),
	versioning: CatalogPlanVersioningSchema.nullable(),
	sibling_versions: z
		.array(CatalogPlanSiblingVersionPreviewSchema)
		.optional()
		.meta({
			description:
				"Other existing versions of this plan. Each may carry `license_parents` for links that still point at that version. Omitted when there are none, or when more than one entry in this update targets the same plan (`all_versions` is unavailable then).",
		}),
	license_parents: z.array(CatalogLicenseParentPreviewSchema).optional().meta({
		internal: true,
		description:
			"Parents whose planLicense currently points at this version row, and how each resolves against this entry's change. Omitted when none do.",
	}),
	variants: z.array(CatalogVariantPreviewSchema).optional().meta({
		internal: true,
		description:
			"Variants of this plan and how each resolved against this entry's change. Omitted when the plan has none.",
	}),
	licenses: z.array(ApiPlanLicenseV1Schema).optional().meta({
		description:
			"planLicenses on this plan after the update. Omitted when there are none.",
	}),
	alias_replacement: PlanAliasReplacementSchema.optional().meta({
		description:
			"This create/rename claims a reserved alias. Omitted when the id is free.",
	}),
});

export type CatalogPlanUpdatePreview = z.infer<
	typeof CatalogPlanUpdatePreviewSchema
>;
