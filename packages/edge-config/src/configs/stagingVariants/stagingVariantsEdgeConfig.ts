import { z } from "zod/v4";
import { STAGING_VARIANTS_CONFIG_KEY } from "../../keys.js";

/** Loose on purpose: one malformed experiment falls back to A alone instead of failing the whole file. */
export const StagingVariantsConfigSchema = z.object({
	experiments: z.record(z.string(), z.object({ arms: z.array(z.string()) })),
	updatedAt: z.string(),
	updatedBy: z.string().optional(),
	reason: z.string().optional(),
});

export type StagingVariantsConfig = z.infer<typeof StagingVariantsConfigSchema>;

export const defaultStagingVariantsConfig = (): StagingVariantsConfig => ({
	experiments: {},
	updatedAt: new Date(0).toISOString(),
});

export const stagingVariantsEdgeConfig = {
	key: STAGING_VARIANTS_CONFIG_KEY,
	schema: StagingVariantsConfigSchema,
	defaultValue: defaultStagingVariantsConfig,
	/** Polled on its own timer: the writer doesn't bump the registry timestamp. */
	pollIntervalMs: 5_000,
} as const;
