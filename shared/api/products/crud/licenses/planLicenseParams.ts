import { z } from "zod/v4";

/** One `licenses[]` entry on plan create/update: the link config for a
 * license plan offered under the parent. Editing the license plan's own items
 * happens on the license plan directly (plans.update with its id). */
export const PlanLicenseParamsSchema = z.object({
	license_plan_id: z.string(),
	included: z.number().int().min(0).optional(),
	prepaid_only: z.boolean().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
	version: z.number().int().min(1).optional().meta({
		description:
			"Pin the link to a specific version of the license plan. Omitted, an existing link keeps its pinned version and a new link resolves to the latest.",
	}),
});

export type PlanLicenseParams = z.infer<typeof PlanLicenseParamsSchema>;
