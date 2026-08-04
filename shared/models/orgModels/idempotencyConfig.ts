import { z } from "zod/v4";
import { RouteGroup } from "../genModels/routeGroups.js";

export const DEFAULT_IDEMPOTENCY_TTL_HOURS = 24;

export const IdempotencyConfigEntrySchema = z.object({
	routeGroup: z.enum(RouteGroup),
	/** How long a claimed idempotency key blocks duplicates, in hours.
	 *  Capped at 30 days for now. */
	idempotencyTtl: z
		.number()
		.min(1)
		.max(24 * 30)
		.default(DEFAULT_IDEMPOTENCY_TTL_HOURS),
});

export const IdempotencyConfigSchema = z.array(IdempotencyConfigEntrySchema);

export type IdempotencyConfigEntry = z.infer<
	typeof IdempotencyConfigEntrySchema
>;
export type IdempotencyConfig = z.infer<typeof IdempotencyConfigSchema>;
