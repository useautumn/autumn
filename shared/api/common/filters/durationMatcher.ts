import { z } from "zod/v4";

export const DurationSchema = z.strictObject({
	length: z.number().int().positive(),
	unit: z.enum(["day", "month", "year"]),
});

export type Duration = z.infer<typeof DurationSchema>;

const DURATION_OPERATORS = ["$eq", "$lt", "$lte", "$gt", "$gte"] as const;

/**
 * A length of time, compared on the calendar: `{ $lt: { length: 2, unit: "month" } }`.
 * Every operator present must hold.
 */
export const DurationMatcherSchema = z
	.strictObject({
		$eq: DurationSchema.optional(),
		$lt: DurationSchema.optional(),
		$lte: DurationSchema.optional(),
		$gt: DurationSchema.optional(),
		$gte: DurationSchema.optional(),
	})
	.refine(
		(matcher) =>
			DURATION_OPERATORS.some((operator) => matcher[operator] !== undefined),
		{ message: "Choose a comparison for the duration." },
	);

export type DurationMatcher = z.infer<typeof DurationMatcherSchema>;
