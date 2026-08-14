import { ApiPlanLicenseV1Schema } from "@api/products/apiPlanV1.js";
import { PlanChangeV0Schema } from "@api/products/components/planChange/planChangeV0.js";
import { z } from "zod/v4";
import { CatalogActionSchema } from "../catalogAction.js";
import { CatalogPlanVersioningSchema } from "./catalogPlanVersioning.js";
import { CatalogSiblingVersionPreviewSchema } from "./catalogSiblingVersionPreview.js";

/**
 * One direct `plans[]` entry from the request.
 * Related versions nest under `sibling_versions`; this plan's own license links under `licenses`.
 */
export const CatalogPlanUpdatePreviewSchema = z.object({
	plan_id: z.string(),
	name: z.string().optional(),
	action: CatalogActionSchema,
	state: z.object({
		has_customers: z.boolean(),
		will_archive: z.boolean().default(false).meta({
			description:
				"For deletes: archive (customers exist) instead of hard delete.",
		}),
	}),
	versioning: CatalogPlanVersioningSchema.nullable(),
	plan_change: PlanChangeV0Schema.nullish().meta({
		description:
			"Diff between the current and desired plan definition. Omitted (or null) when the plan is new, removed, or unchanged.",
	}),
	sibling_versions: z
		.array(CatalogSiblingVersionPreviewSchema)
		.optional()
		.meta({
			description:
				"Other existing versions of this plan. Omitted when there are none, or when more than one entry in this update targets the same plan (`all_versions` is unavailable then).",
		}),
	licenses: z.array(ApiPlanLicenseV1Schema).optional().meta({
		internal: true,
		description:
			"License links this plan offers after the update. Omitted when it has none.",
	}),
});

export type CatalogPlanUpdatePreview = z.infer<
	typeof CatalogPlanUpdatePreviewSchema
>;
