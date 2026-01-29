import {
	BILLING_CYCLE_INTERVALS,
	type BillingCycleIntervalEnum,
	type BillingCycleResult,
	type ClickHouseResult,
	type DateRangeResult,
	type TotalEventsParams,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { format, startOfDay, startOfHour, sub } from "date-fns";
import { Decimal } from "decimal.js";
import { getClickhouseClient } from "@/external/tinybird/initClickhouse.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getBillingCycleStartDate } from "../analyticsUtils.js";

const DATE_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

const intervalTypeToDaysMap = (gap = 0): Record<string, number> => ({
	"24h": 1,
	"7d": 7,
	"30d": 30,
	"90d": 90,
	"1bc": gap + 1,
	"3bc": gap + 1,
	last_cycle: gap + 1,
});

const calculateDateRange = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: TotalEventsParams;
}): Promise<DateRangeResult> => {
	const { db } = ctx;
	const intervalType = params.interval ?? "24h";
	const binSize = params.bin_size ?? (intervalType === "24h" ? "hour" : "day");

	// Handle custom range
	if (params.custom_range) {
		return {
			startDate: format(new UTCDate(params.custom_range.start), DATE_FORMAT),
			endDate: format(new UTCDate(params.custom_range.end), DATE_FORMAT),
		};
	}

	// Handle billing cycle intervals
	const isBillingCycle = BILLING_CYCLE_INTERVALS.includes(
		intervalType as BillingCycleIntervalEnum,
	);

	const billingCycleResult =
		isBillingCycle && !params.aggregateAll && params.customer
			? ((await getBillingCycleStartDate(
					params.customer,
					db,
					intervalType as "1bc" | "3bc" | "last_cycle",
				)) as BillingCycleResult | null)
			: null;

	if (billingCycleResult?.startDate && billingCycleResult?.endDate) {
		return {
			startDate: billingCycleResult.startDate,
			endDate: billingCycleResult.endDate,
		};
	}

	// Calculate based on interval type
	const daysMap = intervalTypeToDaysMap(0);
	const days = daysMap[intervalType as keyof typeof daysMap];

	const now = new UTCDate();
	const endDate = format(now, DATE_FORMAT);

	const startTime = sub(now, { days });
	const truncatedStartTime =
		binSize === "day" ? startOfDay(startTime) : startOfHour(startTime);
	const startDate = format(truncatedStartTime, DATE_FORMAT);

	return { startDate, endDate };
};

/** Gets total count and sum per event name for a date range */
export const getCountAndSum = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: TotalEventsParams;
}) => {
	const ch = getClickhouseClient();
	const { org, env } = ctx;

	const { startDate, endDate } = await calculateDateRange({ ctx, params });

	const query = `
		WITH customer_events AS (
			SELECT *
			FROM events
			WHERE org_id = {org_id:String} AND env = {env:String}
			${params.aggregateAll ? "" : "AND customer_id = {customer_id:String}"}
		)
		SELECT
			e.event_name,
			COUNT(*) as count,
			SUM(e.value) as sum
		FROM customer_events e
		WHERE e.timestamp >= {start_date:DateTime}
			AND e.timestamp <= {end_date:DateTime}
			AND e.event_name IN {event_names:Array(String)}
		GROUP BY e.event_name
	`;

	ctx.logger.debug("Getting count and sum", {
		eventNames: params.event_names,
		customerId: params.customer_id,
		aggregateAll: params.aggregateAll,
		startDate,
		endDate,
	});

	const result = await ch.query({
		query,
		query_params: {
			org_id: org.id,
			env,
			customer_id: params.customer_id,
			start_date: startDate,
			end_date: endDate,
			event_names: params.event_names,
		},
		format: "JSON",
	});

	const resultJson = (await result.json()) as ClickHouseResult;
	const rows = resultJson.data as Array<{
		event_name: string;
		count: string;
		sum: string;
	}>;

	const summary = rows.reduce(
		(acc, row) => {
			acc[row.event_name] = {
				count: new Decimal(row.count).toDecimalPlaces(10).toNumber(),
				sum: new Decimal(row.sum ?? 0).toDecimalPlaces(10).toNumber(),
			};
			return acc;
		},
		{} as Record<string, { count: number; sum: number }>,
	);

	ctx.logger.debug("Count and sum result", {
		eventCount: Object.keys(summary).length,
		events: Object.keys(summary),
	});

	return summary;
};
