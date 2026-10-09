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

export const GetAtomMetricsParamsSchema = z.object({
	range: z.enum(ATOM_METRICS_RANGES),
});

export const AtomMetricsPointSchema = z.object({
	at: z.number().describe("The start of the bucket, in epoch milliseconds."),
	cpu: z.number().nullable().describe("Share of the CPU limit used, 0–1."),
	memory: z
		.number()
		.nullable()
		.describe("Share of the memory limit used, 0–1."),
	requests_per_second: z
		.number()
		.describe("Checks the org's app sent with an accepted key."),
	forwarded_per_second: z
		.number()
		.describe("Of those, the ones the Autumn API answered instead of Atom."),
	pushes_per_second: z
		.number()
		.describe("Customer and catalog updates Autumn pushed to Atom."),
});

export const GetAtomMetricsResponseSchema = z.object({
	bucket_seconds: z.number(),
	points: z.array(AtomMetricsPointSchema).describe("Oldest first."),
});

export type AtomCheck = z.infer<typeof AtomCheckSchema>;
export type ListAtomChecksResponse = z.infer<
	typeof ListAtomChecksResponseSchema
>;
export type AtomMetricsRange = (typeof ATOM_METRICS_RANGES)[number];
export type GetAtomMetricsParams = z.infer<typeof GetAtomMetricsParamsSchema>;
export type AtomMetricsPoint = z.infer<typeof AtomMetricsPointSchema>;
export type GetAtomMetricsResponse = z.infer<
	typeof GetAtomMetricsResponseSchema
>;
