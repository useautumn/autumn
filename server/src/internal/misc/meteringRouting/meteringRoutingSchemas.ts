import { z } from "zod/v4";

/**
 * - `off` — the API never talks to the metering worker.
 * - `shadow` — same serving behaviour as `off`; the org is only being mirrored
 *   onto the metering topic (the shadow tap is its own config).
 * - `serve_reads` — check is answered from the worker, track still goes to
 *   Redis.
 * - `full` — check and track both go to the worker, with the Redis write kept
 *   warm behind the reply so a rollback has somewhere to land.
 */
export const meteringRoutingModes = [
	"off",
	"shadow",
	"serve_reads",
	"full",
] as const;

export const MeteringRoutingModeSchema = z.enum(meteringRoutingModes);

/** An org listed here is opted in, so `off` is not a value it can hold — remove
 *  the entry instead, and the org falls back to `defaultMode`. */
export const MeteringRoutingOrgModeSchema = z.enum([
	"shadow",
	"serve_reads",
	"full",
]);

export const MeteringRoutingConfigSchema = z.object({
	orgModes: z.record(z.string(), MeteringRoutingOrgModeSchema).default({}),
	defaultMode: MeteringRoutingModeSchema.default("off"),
});

export type MeteringRoutingMode = z.infer<typeof MeteringRoutingModeSchema>;
export type MeteringRoutingConfig = z.infer<typeof MeteringRoutingConfigSchema>;
