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

const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
] as const;

const pad = (value: number) => String(value).padStart(2, "0");

const formatUtcDate = (date: Date) =>
	`${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;

const parseEpochMilliseconds = (value: number | string): number => {
	const epoch = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(epoch)) {
		throw new Error(`Invalid epoch milliseconds: ${value}`);
	}
	return epoch;
};

const epochMillisecondsToDate = (
	epochMsByKey: Record<string, number | string>,
) =>
	Object.fromEntries(
		Object.entries(epochMsByKey).map(([key, value]) => {
			const epochMs = parseEpochMilliseconds(value);
			const date = new Date(epochMs);
			if (!Number.isFinite(date.getTime())) {
				throw new Error(`Invalid epoch milliseconds: ${value}`);
			}
			return [
				key,
				{
					epoch_ms: epochMs,
					iso: date.toISOString(),
					utc: formatUtcDate(date),
				},
			];
		}),
	);

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

export const epochMillisecondsToDateTool = createTool({
	id: "epochMillisecondsToDate",
	description:
		"Convert one or more epoch millisecond timestamps from Autumn responses into UTC date formats. Use this before explaining starts_at, expires_at, next_reset_at, or other millisecond timestamp fields to users.",
	inputSchema: z
		.object({
			timestamps: z.record(z.string(), z.union([z.number(), z.string()])).meta({
				description:
					"Object keyed by semantic timestamp names, with epoch millisecond values.",
			}),
		})
		.strict(),
	execute: async ({ timestamps }) => epochMillisecondsToDate(timestamps),
});
