import { z } from "zod/v4";

/** Global cache V2 ramp config — mirrors per-org `redis_config` exactly.
 *  `connectionString` is AES-256-CBC encrypted (same scheme as per-org).
 *  `url` is a plain host:port for logs.
 *  The whole config is `null` when no ramp is configured. */
export const CacheV2RampConfigSchema = z
	.object({
		connectionString: z.string().min(1),
		url: z.string().min(1),
		migrationPercent: z.number().min(0).max(100).default(0),
		previousMigrationPercent: z.number().min(0).max(100).default(0),
		migrationChangedAt: z.number().default(0),
	})
	.nullable();

export type CacheV2RampConfig = z.infer<typeof CacheV2RampConfigSchema>;
