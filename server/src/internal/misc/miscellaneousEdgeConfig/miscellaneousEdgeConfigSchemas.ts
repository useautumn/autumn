import { z } from "zod/v4";

export const MiscellaneousEdgeConfigSchema = z.object({
	newFlatCusModel: z.array(z.string()).default([]),
	/** Global switch: coalesce balance syncs via per-customer Redis dirty state
	 *  (signal-only SQS messages). Dark by default. */
	syncCoalesce: z.boolean().default(false),
	/** Global switch: customer get_or_create and entity get read the subject
	 *  straight from Postgres, bypassing the FullSubject cache entirely. */
	subjectLookupDbOnly: z.boolean().default(false),
	/** Global switch: when Redis is unavailable, subject reads fall back to
	 *  Postgres instead of shedding a 503. Dark by default — turning this on
	 *  converts a cache outage into full primary read load. */
	redisFallbackToDb: z.boolean().default(false),
	/** In-process L1 TTL (ms) for pure-GET subject reads; 0 disables the L1
	 *  cache only — singleflight is gated by subjectReadSingleflight. */
	subjectReadL1TtlMs: z.number().default(1000),
	/** Global switch: concurrent same-key pure-GET subject reads share one
	 *  in-flight fetch. Independent of the L1 TTL. */
	subjectReadSingleflight: z.boolean().default(true),
});

export type MiscellaneousEdgeConfig = z.infer<
	typeof MiscellaneousEdgeConfigSchema
>;
