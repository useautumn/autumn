import { z } from "zod/v4";

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
