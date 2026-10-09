import { z } from "zod/v4";

export const ListAtomChecksParamsSchema = z.object({});

export const AtomCheckSchema = z.object({
	at: z.number().describe("When Atom answered, in epoch milliseconds."),
	customer_id: z.string().nullable(),
	feature_id: z.string().nullable(),
	answered_by: z
		.enum(["atom", "api"])
		.describe("Atom, or the Autumn API when Atom forwarded the check."),
});

export const ListAtomChecksResponseSchema = z.object({
	checks: z
		.array(AtomCheckSchema)
		.describe(
			"The Atom's latest checks from the last few minutes, newest first.",
		),
});

export const ATOM_METRICS_RANGES = ["1h", "24h", "7d"] as const;

/** How a period's 10s windows fold into one value: its busiest window, or its mean rate. */
export const ATOM_METRICS_STATISTICS = ["maximum", "average"] as const;

export const GetAtomMetricsParamsSchema = z.object({
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
	maximum: AtomMetricsRatesSchema.describe(
		"The period's busiest 10s window, split as that window was.",
	),
	average: AtomMetricsRatesSchema.describe(
		"The period's totals over the seconds it covers.",
	),
});

export const AtomMetricsLatestSchema = AtomMetricsRatesSchema.extend({
	at: z
		.number()
		.describe("The start of the 10s window, in epoch milliseconds."),
});

export const GetAtomMetricsResponseSchema = z.object({
	period_seconds: z.number(),
	points: z.array(AtomMetricsPointSchema).describe("Oldest first."),
	latest: AtomMetricsLatestSchema.nullable().describe(
		"The latest 10s window, or null when the Atom logged none in the last minute.",
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
export type GetAtomMetricsResponse = z.infer<
	typeof GetAtomMetricsResponseSchema
>;
