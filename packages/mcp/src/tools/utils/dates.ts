import { createTool } from "@mastra/core/tools";
import { isValid, parseISO } from "date-fns";
import * as z from "zod/v4";

/**
 * Parses an ISO date/timestamp string to UTC epoch milliseconds. Date-only
 * values (`YYYY-MM-DD`) and zone-less timestamps are treated as UTC. Returns
 * `null` when the input is not a valid date.
 */
const parseToEpochMilliseconds = (value: string): number | null => {
	const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
		? `${value}T00:00:00.000`
		: value;
	const hasExplicitZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(normalized);
	const parsed = parseISO(hasExplicitZone ? normalized : `${normalized}Z`);
	return isValid(parsed) ? parsed.getTime() : null;
};

/** Accepts epoch milliseconds or an ISO date/timestamp string; outputs epoch ms. */
export const epochMillisecondsSchema = z
	.union([z.number(), z.string()])
	.transform((value, context) => {
		if (typeof value === "number") {
			if (Number.isFinite(value)) return value;
		} else {
			const epoch = parseToEpochMilliseconds(value);
			if (epoch !== null) return epoch;
		}

		context.addIssue({
			code: "custom",
			message: "Expected epoch milliseconds or an ISO date/timestamp string.",
		});
		return z.NEVER;
	});

const toEpochMilliseconds = (date: string): number => {
	const epoch = parseToEpochMilliseconds(date);
	if (epoch === null) throw new Error(`Invalid date: ${date}`);
	return epoch;
};

export const dateToEpochMillisecondsTool = createTool({
	id: "dateToEpochMilliseconds",
	description:
		"Convert a calendar date or ISO timestamp to UTC epoch milliseconds for API timestamp fields. Date-only values default to midnight UTC; include an explicit offset in the date string when timezone matters.",
	inputSchema: z
		.object({
			date: z.string(),
		})
		.strict(),
	execute: async ({ date }) => toEpochMilliseconds(date),
});
