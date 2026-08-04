import { z } from "zod/v4";
import { RouteGroup } from "../genModels/routeGroups.js";

export const DEFAULT_IDEMPOTENCY_TTL_HOURS = 24;

export const IdempotencyConfigEntrySchema = z.object({
	routeGroup: z.enum(RouteGroup),
	/** How long a claimed idempotency key blocks duplicates, in hours.
	 *  Capped at 30 days for now. */
	idempotencyTtl: z
		.number()
		.min(1, "Idempotency key duration must be at least 1 hour")
		.max(24 * 30, "Idempotency key duration cannot exceed 30 days")
		.default(DEFAULT_IDEMPOTENCY_TTL_HOURS),
});

export const IdempotencyConfigSchema = z
	.array(IdempotencyConfigEntrySchema)
	.superRefine((entries, refinementCtx) => {
		const seenRouteGroups = new Set<RouteGroup>();
		for (const entry of entries) {
			if (seenRouteGroups.has(entry.routeGroup)) {
				refinementCtx.addIssue({
					code: "custom",
					message: `Duplicate route group: ${entry.routeGroup}`,
				});
			}
			seenRouteGroups.add(entry.routeGroup);
		}
	});

export type IdempotencyConfigEntry = z.infer<
	typeof IdempotencyConfigEntrySchema
>;
export type IdempotencyConfig = z.infer<typeof IdempotencyConfigSchema>;
