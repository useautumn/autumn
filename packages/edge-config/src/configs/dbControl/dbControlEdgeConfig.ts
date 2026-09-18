import { z } from "zod/v4";
import { DB_CONTROL_CONFIG_KEY } from "../../keys.js";

/**
 * Live knobs on how our processes drive Postgres. Every field is optional and null means
 * "whatever the process booted with", so an empty file changes nothing. Add a section per client.
 */
export const DbControlEdgeConfigSchema = z
	.object({
		balanceCommitter: z
			.object({
				/** Flushes in flight per worker; clamped to the worker's pool size. */
				concurrency: z.number().int().positive().nullable().default(null),
			})
			.default({ concurrency: null }),
	})
	.strict();

export type DbControlEdgeConfig = z.infer<typeof DbControlEdgeConfigSchema>;

export const defaultDbControlEdgeConfig = (): DbControlEdgeConfig => ({
	balanceCommitter: { concurrency: null },
});

export const dbControlEdgeConfig = {
	key: DB_CONTROL_CONFIG_KEY,
	schema: DbControlEdgeConfigSchema,
	defaultValue: defaultDbControlEdgeConfig,
} as const;
