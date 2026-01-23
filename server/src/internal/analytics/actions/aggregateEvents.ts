import type { RangeEnum } from "@autumn/shared";
import { startOfDay, startOfHour, sub } from "date-fns";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { type AggregateRow, eventRepo } from "../repos/EventRepo.js";

export type AggregateEventsParams = {
	ctx: AutumnContext;
	eventNames: string[];
	customerId?: string;
	interval: RangeEnum;
	binSize?: "hour" | "day" | "month";
	timezone?: string;
};

export type AggregatedEventData = {
	period: string;
	[eventName: string]: number | string;
};

const INTERVAL_TO_DAYS: Record<string, number> = {
	"24h": 1,
	"7d": 7,
	"30d": 30,
	"90d": 90,
};

/** Calculate start and end dates based on interval */
const calculateDateRange = ({
	interval,
	binSize,
}: {
	interval: RangeEnum;
	binSize: "hour" | "day" | "month";
}): { startDate: Date; endDate: Date } => {
	const now = new Date();
	const endDate = now;

	const days = INTERVAL_TO_DAYS[interval] ?? 7;
	const startTime = sub(now, { days });

	// Truncate start time based on bin size
	const startDate =
		binSize === "hour" ? startOfHour(startTime) : startOfDay(startTime);

	return { startDate, endDate };
};

/** Generate all periods in the date range (for filling gaps) */
const generatePeriods = ({
	startDate,
	endDate,
	binSize,
}: {
	startDate: Date;
	endDate: Date;
	binSize: "hour" | "day" | "month";
}): Date[] => {
	const periods: Date[] = [];
	let current = new Date(startDate);

	while (current <= endDate) {
		periods.push(new Date(current));

		if (binSize === "hour") {
			current = new Date(current.getTime() + 60 * 60 * 1000);
		} else if (binSize === "day") {
			current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
		} else {
			// month
			current = new Date(current.setMonth(current.getMonth() + 1));
		}
	}

	return periods;
};

/** Transform raw aggregate rows into the expected format */
const transformResults = ({
	rows,
	eventNames,
	periods,
}: {
	rows: AggregateRow[];
	eventNames: string[];
	periods: Date[];
}): AggregatedEventData[] => {
	// Create a map for quick lookup: period -> event_name -> { count, sum }
	const dataMap = new Map<
		string,
		Map<string, { count: number; sum: number }>
	>();

	for (const row of rows) {
		const periodKey = row.period.toISOString();
		if (!dataMap.has(periodKey)) {
			dataMap.set(periodKey, new Map());
		}
		dataMap.get(periodKey)!.set(row.event_name, {
			count: row.count,
			sum: row.sum,
		});
	}

	// Build result with all periods, filling gaps with zeros
	return periods.map((period) => {
		const periodKey = period.toISOString();
		const periodData = dataMap.get(periodKey);

		const result: AggregatedEventData = {
			period: periodKey,
		};

		for (const eventName of eventNames) {
			const data = periodData?.get(eventName);
			// Use sum if available, otherwise count
			const value = data?.sum ?? data?.count ?? 0;
			result[eventName] = new Decimal(value).toDecimalPlaces(10).toNumber();
		}

		return result;
	});
};

export const aggregateEvents = async ({
	ctx,
	eventNames,
	customerId,
	interval,
	binSize,
	timezone = "UTC",
}: AggregateEventsParams): Promise<{
	data: AggregatedEventData[];
}> => {
	// Determine bin size based on interval if not provided
	const effectiveBinSize = binSize ?? (interval === "24h" ? "hour" : "day");

	// Calculate date range
	const { startDate, endDate } = calculateDateRange({
		interval,
		binSize: effectiveBinSize,
	});

	// Generate all periods for the range
	const periods = generatePeriods({
		startDate,
		endDate,
		binSize: effectiveBinSize,
	});

	// Fetch aggregated data from the repo
	const rows = await eventRepo.aggregate({
		ctx,
		eventNames,
		customerId,
		startDate,
		endDate,
		binSize: effectiveBinSize,
		timezone,
	});

	// Transform into the expected format
	const data = transformResults({
		rows,
		eventNames,
		periods,
	});

	return { data };
};
