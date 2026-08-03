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
import { validatePropertyPathForJSON } from "@/internal/analytics/actions/eventValidationUtils.js";
import { getBillingCycleStartDate } from "../analyticsUtils.js";
import {
	buildCountAndSumQuery,
	hasCompleteUtcDay,
	selectCountAndSumSource,
} from "./dailyRollupRouting.js";

const DATE_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

type CountAndSumRow = {
	event_name: string;
	count: string;
	sum: string;
	actual_daily_event_count?: string | number;
	expected_daily_event_count?: string | number;
};

const hasCompleteDailyCoverage = ({
	rows,
}: {
	rows: CountAndSumRow[];
}): boolean =>
	rows.every((row) => {
		const actualDailyEventCount = Number(row.actual_daily_event_count);
		const expectedDailyEventCount = Number(row.expected_daily_event_count);
		return (
			Number.isFinite(actualDailyEventCount) &&
			Number.isFinite(expectedDailyEventCount) &&
			actualDailyEventCount === expectedDailyEventCount
		);
	});

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
			? ((await getBillingCycleStartDate({
					customer: params.customer,
					db,
					intervalType: intervalType as "1bc" | "3bc" | "last_cycle",
					ctx,
				})) as BillingCycleResult | null)
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
	dateRange,
}: {
	ctx: AutumnContext;
	params: TotalEventsParams;
	// Callers comparing these totals against another query's result must pass that
	// query's window; resolving it here independently drifts by up to one bin.
	dateRange?: DateRangeResult;
}) => {
	const ch = getClickhouseClient();
	const { org, env } = ctx;

	const { startDate, endDate } =
		dateRange ?? (await calculateDateRange({ ctx, params }));

	// Build dynamic filter_by clauses using native JSON sub-column access
	let filterBySql = "";
	const filterByParams: Record<string, string> = {};
	if (params.filter_by) {
		const entries = Object.entries(params.filter_by).slice(0, 5);
		for (let i = 0; i < entries.length; i++) {
			const [key, value] = entries[i];
			validatePropertyPathForJSON({ propertyKey: key });
			filterBySql += `\n\t\t\tAND properties.${key}::String = {filter_value_${i}:String}`;
			filterByParams[`filter_value_${i}`] = value;
		}
	}

	const hasFilters = filterBySql !== "";

	const source = selectCountAndSumSource({
		containsCompleteUtcDay: hasCompleteUtcDay({ startDate, endDate }),
		hasCustomerId: Boolean(params.customer_id),
		hasEntityId: Boolean(params.entity_id),
		hasPropertyFilters: hasFilters,
	});
	const query = buildCountAndSumQuery({
		source,
		aggregateAll: Boolean(params.aggregateAll),
		filterBySql,
		hasEntityId: Boolean(params.entity_id),
	});
	const queryParams = {
		org_id: org.id,
		env,
		customer_id: params.customer_id,
		entity_id: params.entity_id,
		start_date: startDate,
		end_date: endDate,
		event_names: params.event_names,
		...filterByParams,
	};

	ctx.logger.debug("Getting count and sum", {
		eventNames: params.event_names,
		customerId: params.customer_id,
		aggregateAll: params.aggregateAll,
		startDate,
		endDate,
	});

	const executeQuery = async ({ query }: { query: string }) => {
		const result = await ch.query({
			query,
			query_params: queryParams,
			format: "JSON",
		});
		const resultJson =
			(await result.json()) as ClickHouseResult<CountAndSumRow>;
		return resultJson.data;
	};

	const executeHourlyFallback = async () => {
		ctx.logger.warn("Daily analytics totals unavailable; using hourly rollup", {
			type: "daily_rollup_fallback",
			reason: "incomplete_daily_coverage",
			orgId: org.id,
			customerId: params.customer_id,
		});
		return executeQuery({
			query: buildCountAndSumQuery({
				source: "customer_hourly",
				aggregateAll: Boolean(params.aggregateAll),
				hasEntityId: Boolean(params.entity_id),
			}),
		});
	};

	let rows = await executeQuery({ query });

	if (source === "customer_daily" && !hasCompleteDailyCoverage({ rows })) {
		rows = await executeHourlyFallback();
	}

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
