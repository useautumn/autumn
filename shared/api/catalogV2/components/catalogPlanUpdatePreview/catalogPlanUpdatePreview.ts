import { z } from "zod/v4";
import { CatalogActionSchema } from "../catalogAction.js";
import { CatalogPlanChangesSchema } from "./catalogPlanChanges.js";
import { CatalogPlanVersioningSchema } from "./catalogPlanVersioning.js";

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
	changes: CatalogPlanChangesSchema.nullable(),
});

export type CatalogPlanUpdatePreview = z.infer<
	typeof CatalogPlanUpdatePreviewSchema
>;
