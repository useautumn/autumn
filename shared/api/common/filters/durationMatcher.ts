import { z } from "zod/v4";

export const DurationBoundSchema = z.strictObject({
	length: z.number().int().positive(),
	unit: z.enum(["day", "month", "year"]),
});

export type DurationBound = z.infer<typeof DurationBoundSchema>;

const DURATION_OPERATORS = ["$eq", "$lt", "$lte", "$gt", "$gte"] as const;

/**
 * A length of time, compared on the calendar: `{ $lt: { length: 2, unit: "month" } }`.
 * Every operator present must hold.
 */
export const DurationMatcherSchema = z
	.strictObject({
		$eq: DurationBoundSchema.optional(),
		$lt: DurationBoundSchema.optional(),
		$lte: DurationBoundSchema.optional(),
		$gt: DurationBoundSchema.optional(),
		$gte: DurationBoundSchema.optional(),
	})
	.refine(
		(matcher) =>
			DURATION_OPERATORS.some((operator) => matcher[operator] !== undefined),
		{ message: "Choose a comparison for the duration." },
	);

export type DurationMatcher = z.infer<typeof DurationMatcherSchema>;
