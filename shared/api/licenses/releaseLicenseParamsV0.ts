import { z } from "zod/v4";

export const ReleaseLicenseParamsV0Schema = z.object({
	customer_id: z.string(),
	license_plan_id: z.string().optional().meta({
		description:
			"Scopes the release when an entity holds licenses of multiple plans.",
	}),
	// Each entity's seat is unlinked back to its pool, ready for reuse.
	entity_ids: z.array(z.string()).min(1),
});

export type ReleaseLicenseParamsV0 = z.infer<
	typeof ReleaseLicenseParamsV0Schema
>;
