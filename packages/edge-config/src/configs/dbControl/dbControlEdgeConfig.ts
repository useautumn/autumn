import { z } from "zod/v4";
import { DB_CONTROL_CONFIG_KEY } from "../../keys.js";

export const DbControlEdgeConfigSchema = z
	.object({
		balanceCommitter: z
			.object({
				concurrency: z.number().int().positive().nullable().default(null),
				applyLingerMs: z
					.number()
					.int()
					.min(0)
					.max(5_000)
					.nullable()
					.default(null),
				maxBatchesPerFlush: z
					.number()
					.int()
					.min(1)
					.max(64)
					.nullable()
					.default(null),
			})
			.default({
				concurrency: null,
				applyLingerMs: null,
				maxBatchesPerFlush: null,
			}),
	})
	.strict();

export type DbControlEdgeConfig = z.infer<typeof DbControlEdgeConfigSchema>;

export const defaultDbControlEdgeConfig = (): DbControlEdgeConfig => ({
	balanceCommitter: {
		concurrency: null,
		applyLingerMs: null,
		maxBatchesPerFlush: null,
	},
});

export const dbControlEdgeConfig = {
	key: DB_CONTROL_CONFIG_KEY,
	schema: DbControlEdgeConfigSchema,
	defaultValue: defaultDbControlEdgeConfig,
} as const;
