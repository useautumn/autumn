import { z } from "zod/v4";
import { RolloutPercentSchema } from "@/internal/misc/rollouts/rolloutSchemas.js";

/** Destination Redis the ramp targets. Stored in the edge config; admin-editable.
 *  `connectionString` is AES-256-CBC encrypted (same scheme as per-org redis_config).
 *  `url` is a plain host:port for logs/visibility — no scheme, no credentials.
 *  Schema rejects scheme/credentials so secrets never accidentally land in this
 *  field (which is logged + surfaced in Axiom). */
export const RampDestinationSchema = z.object({
	connectionString: z.string().min(1),
	url: z
		.string()
		.min(1)
		.refine(
			(value) =>
				!value.includes("://") && !value.includes("@") && !/\s/.test(value),
			{
				message:
					"url must be a credential-free host:port (no scheme, no '@', no whitespace)",
			},
		),
});

export const DragonflyRampConfigSchema = z.object({
	destination: RampDestinationSchema.nullable().default(null),
	percent: z.number().min(0).max(100).default(0),
	previousPercent: z.number().min(0).max(100).default(0),
	changedAt: z.number().default(0),
	orgs: z.record(z.string(), RolloutPercentSchema).default({}),
});

export type RampDestination = z.infer<typeof RampDestinationSchema>;
export type DragonflyRampConfig = z.infer<typeof DragonflyRampConfigSchema>;
export type DragonflyRampPercent = z.infer<typeof RolloutPercentSchema>;
