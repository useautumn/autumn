import { z } from "zod/v4";

export const ListAtomChecksParamsSchema = z.object({
	atom_id: z.string().optional(),
});

export const AtomCheckSchema = z.object({
	at: z.number().describe("When Atom answered, in epoch milliseconds."),
	customer_id: z.string().nullable(),
	feature_id: z.string().nullable(),
	answered_by: z
		.enum(["atom", "api"])
		.describe("Atom, or the Autumn API when Atom forwarded the check."),
});

export const ListAtomChecksResponseSchema = z.object({
	first_check_seen_at: z
		.number()
		.nullable()
		.describe(
			"When Atom first counted a check from your app, in epoch milliseconds; null until it does.",
		),
	checks: z
		.array(AtomCheckSchema)
		.describe(
			"A sample of the Atom's latest checks, newest first; empty once the first check has been seen.",
		),
});

export const ATOM_METRICS_RANGES = ["1h", "24h", "7d"] as const;

/** How a period's windows (10s, or 60s for 7d) fold into one value: its busiest window, or its mean rate. */
export const ATOM_METRICS_STATISTICS = ["maximum", "average"] as const;

export const GetAtomMetricsParamsSchema = z.object({
	atom_id: z.string().optional(),
	range: z.enum(ATOM_METRICS_RANGES),
});

export const AtomMetricsRatesSchema = z.object({
	requests: z
		.number()
		.describe("Checks per second the org's app sent with an accepted key."),
	forwarded: z
		.number()
		.describe("Of those, the ones the Autumn API answered instead of Atom."),
	pushes: z
		.number()
		.describe("Customer and catalog updates per second Autumn pushed to Atom."),
});

export const AtomMetricsPointSchema = z.object({
	at: z.number().describe("The start of the period, in epoch milliseconds."),
	cpu: z
		.number()
		.nullable()
		.describe("Average share of the CPU limit used, 0–1."),
	memory: z
		.number()
		.nullable()
		.describe("Average share of the memory limit used, 0–1."),
	disk: z
		.number()
		.nullable()
		.describe(
			"The fullest replica's used share of its data volume at its fullest in the period, 0–1; null when no replica reported its volume.",
		),
	evicted: z
		.number()
		.describe(
			"Customers the replicas evicted from disk to stay under 80% full, summed across replicas: eviction events, not unique customers.",
		),
	maximum: AtomMetricsRatesSchema.describe(
		"The period's busiest window, 10s or 60s for 7d, split as that window was.",
	),
	average: AtomMetricsRatesSchema.describe(
		"The period's totals over the seconds it covers.",
	),
});

export const AtomMetricsLatestSchema = AtomMetricsRatesSchema.extend({
	at: z
		.number()
		.describe(
			"The start of the newest 10s window in the last minute, in epoch milliseconds.",
		),
});

export const AtomVolumeSchema = z.object({
	replica_id: z.string(),
	used_bytes: z.number(),
	total_bytes: z.number(),
	at: z
		.number()
		.describe("When the replica last reported it, in epoch milliseconds."),
});

export const GetAtomMetricsResponseSchema = z.object({
	period_seconds: z
		.number()
		.describe(
			"Each point's period: the finest that plots the range, or the Atom's life if shorter, in at most 120 points.",
		),
	points: z.array(AtomMetricsPointSchema).describe("Oldest first."),
	latest: AtomMetricsLatestSchema.nullable().describe(
		"Rates over the last minute, or null when the Atom logged nothing in it.",
	),
	volumes: z
		.array(AtomVolumeSchema)
		.describe(
			"Each replica's data volume as it last reported it in the last 5 minutes, fullest first; a replica that reported nothing is missing.",
		),
});

export type AtomCheck = z.infer<typeof AtomCheckSchema>;
export type ListAtomChecksResponse = z.infer<
	typeof ListAtomChecksResponseSchema
>;
export type AtomMetricsRange = (typeof ATOM_METRICS_RANGES)[number];
export type AtomMetricsStatistic = (typeof ATOM_METRICS_STATISTICS)[number];
export type GetAtomMetricsParams = z.infer<typeof GetAtomMetricsParamsSchema>;
export type AtomMetricsRates = z.infer<typeof AtomMetricsRatesSchema>;
export type AtomMetricsPoint = z.infer<typeof AtomMetricsPointSchema>;
export type AtomMetricsLatest = z.infer<typeof AtomMetricsLatestSchema>;
export type AtomVolume = z.infer<typeof AtomVolumeSchema>;
export type GetAtomMetricsResponse = z.infer<
	typeof GetAtomMetricsResponseSchema
>;
