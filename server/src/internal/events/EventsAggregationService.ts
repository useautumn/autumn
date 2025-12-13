import {
	type BillingCycleResult,
	type CalculateCustomRangeParamsInput,
	type CalculateCustomRangeParamsOutput,
	type CalculateDateRangeParams,
	type ClickHouseResult,
	type DateRangeResult,
	ErrCode,
	RecaseError,
	type TimeseriesEventsParams,
	type TotalEventsParams,
} from "@autumn/shared";
import type { ClickHouseClient } from "@clickhouse/client";
import { UTCDate } from "@date-fns/utc";
import {
	add,
	differenceInDays,
	differenceInHours,
	format,
	startOfDay,
	startOfHour,
	sub,
} from "date-fns";
import { Decimal } from "decimal.js";
import { StatusCodes } from "http-status-codes";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	generateEventCountExpressions,
	getBillingCycleStartDate,
} from "../analytics/analyticsUtils.js";

export class EventsAggregationService {
	private static async calculateDateRange({
		ctx,
		params,
	}: {
		ctx: AutumnContext;
		params: CalculateDateRangeParams;
	}): Promise<DateRangeResult> {
		const { db } = ctx;
		const intervalType = params.interval;
		const binSize =
			params.bin_size ?? (intervalType === "24h" ? "hour" : "day");

		if (params.custom_range) {
			return {
				startDate: format(
					new UTCDate(params.custom_range.start),
					"yyyy-MM-dd'T'HH:mm:ss",
				),
				endDate: format(
					new UTCDate(params.custom_range.end),
					"yyyy-MM-dd'T'HH:mm:ss",
				),
			};
		}

		const isBillingCycle = intervalType === "1bc" || intervalType === "3bc";
		const getBCResults =
			isBillingCycle && !params.aggregateAll && params.customer
				? ((await getBillingCycleStartDate(
						params.customer,
						db,
						intervalType as "1bc" | "3bc",
					)) as BillingCycleResult | null)
				: null;

		if (getBCResults?.startDate && getBCResults?.endDate) {
			return {
				startDate: getBCResults.startDate,
				endDate: getBCResults.endDate,
			};
		}

		const intervalTypeToDaysMap =
			EventsAggregationService.intervalTypeToDaysMap({
				gap: 0,
			});
		const days =
			intervalTypeToDaysMap[intervalType as keyof typeof intervalTypeToDaysMap];

		const now = new UTCDate();
		const endDate = format(now, "yyyy-MM-dd'T'HH:mm:ss");

		const startTime = sub(now, { days });
		const truncatedStartTime =
			binSize === "day" ? startOfDay(startTime) : startOfHour(startTime);
		const startDate = format(truncatedStartTime, "yyyy-MM-dd'T'HH:mm:ss");

		return { startDate, endDate };
	}

	static intervalTypeToDaysMap({
		gap,
	}: {
		gap?: number;
	} = {}): Record<string, number> {
		return {
			"24h": 1,
			"7d": 7,
			"30d": 30,
			"90d": 90,
			"1bc": (gap ?? 0) + 1,
			"3bc": (gap ?? 0) + 1,
		};
	}

	private static calculateCustomRangeParams({
		customRange,
		binSize,
	}: CalculateCustomRangeParamsInput): CalculateCustomRangeParamsOutput {
		const startDate = new UTCDate(customRange.start);
		const endDate = new UTCDate(customRange.end);

		// Original epoch times for filtering events (preserve exact user input)
		const filterStartDate = format(startDate, "yyyy-MM-dd'T'HH:mm:ss");
		const filterEndDate = format(endDate, "yyyy-MM-dd'T'HH:mm:ss");

		if (binSize === "hour") {
			const truncStart = startOfHour(startDate);
			const truncEnd = startOfHour(endDate);
			const endPlusOne = add(truncEnd, { hours: 1 });
			const hours = differenceInHours(endPlusOne, truncStart);
			// Return exact number of hourly bins needed
			return {
				binCount: hours,
				binEndDate: format(endPlusOne, "yyyy-MM-dd'T'HH:mm:ss"),
				filterStartDate,
				filterEndDate,
			};
		}

		const truncStart = startOfDay(startDate);
		const truncEnd = startOfDay(endDate);
		const endPlusOne = add(truncEnd, { days: 1 });
		return {
			binCount: differenceInDays(endPlusOne, truncStart),
			binEndDate: format(endPlusOne, "yyyy-MM-dd'T'HH:mm:ss"),
			filterStartDate,
			filterEndDate,
		};
	}

	static async getTimeseriesEvents({
		ctx,
		params,
	}: {
		ctx: AutumnContext;
		params: TimeseriesEventsParams;
	}) {
		const { clickhouseClient, org, env, db } = ctx;

		const intervalType = params.interval;

		const useCustomDateQuery =
			intervalType === "1bc" || intervalType === "3bc" || !!params.custom_range;

		// Skip billing cycle calculation if aggregating all customers or using custom_range
		const getBCResults =
			useCustomDateQuery &&
			!params.aggregateAll &&
			params.customer &&
			!params.custom_range
				? ((await getBillingCycleStartDate(
						params.customer,
						db,
						intervalType as "1bc" | "3bc",
					)) as BillingCycleResult | null)
				: null;

		const countExpressions = generateEventCountExpressions(
			params.event_names,
			params.no_count,
		);

		const getGroupByClause = () => {
			if (!params.group_by)
				return { select: "", groupBy: "", orderBy: "", fieldName: null };

			let field: string | null = null;
			// Extract property path after 'properties.' and escape single quotes for SQL safety
			const propertyPath = params.group_by.replace("properties.", "");
			const pathSegments = propertyPath.split(".").map((segment) => {
				// Validate each segment contains only safe characters (alphanumeric, underscores)
				if (!/^[a-zA-Z0-9_]+$/.test(segment)) {
					throw new RecaseError({
						message:
							"Invalid property path. Should only contain alphanumeric and underscore characters.",
						code: ErrCode.InvalidInputs,
						statusCode: StatusCodes.BAD_REQUEST,
					});
				}
				// Escape single quotes for SQL safety
				return segment.replace(/'/g, "''");
			});

			const validSegments = pathSegments.filter(
				(segment): segment is string => segment !== null,
			);

			if (validSegments.length === 0) {
				return { select: "", groupBy: "", orderBy: "", fieldName: null };
			}

			// Join segments as separate arguments: 'key1', 'key2', 'key3'
			// ClickHouse JSONExtractString requires each key as a separate argument
			const escapedPathArgs = validSegments.map((seg) => `'${seg}'`).join(", ");
			field = `JSONExtractString(e.properties, ${escapedPathArgs})`;

			if (!field)
				return { select: "", groupBy: "", orderBy: "", fieldName: null };

			const escapedFieldName = params.group_by.replace(/`/g, "``");
			const columnAlias = `\`${escapedFieldName}\``;

			return {
				select: `, ${field} as ${columnAlias}`,
				groupBy: `, ${field}`,
				orderBy: `, ${field}`,
				fieldName: params.group_by,
			};
		};

		const groupBy = getGroupByClause();
		const groupByFieldName = groupBy.fieldName;

		const query = `
with customer_events as (
    select *
    from org_events_view(org_id={org_id:String}, org_slug='', env={env:String})
    ${params.aggregateAll ? "" : "where customer_id = {customer_id:String}"}
)
select
    dr.period${groupBy.select},
    ${countExpressions}
from date_range_view(bin_size={bin_size:String}, bin_count={bin_count:UInt32}, interval_offset={interval_offset:UInt32}) dr
    left join customer_events e
    on date_trunc({bin_size:String}, e.timestamp) = dr.period
group by dr.period${groupBy.groupBy}
order by dr.period${groupBy.orderBy};
`;

		const customRangeFilter = params.custom_range
			? "and e.timestamp >= {filter_start_date:DateTime} and e.timestamp <= {filter_end_date:DateTime}"
			: "";

		const queryBillingCycle = `
with customer_events as (
    select *
    from org_events_view(org_id={org_id:String}, org_slug='', env={env:String})
    ${params.aggregateAll ? "" : "where customer_id = {customer_id:String}"}
)
select
    dr.period${groupBy.select},
    ${countExpressions}
from date_range_bc_view(bin_size={bin_size:String}, start_date={end_date:DateTime}, bin_count={bin_count:UInt32}, interval_offset={interval_offset:UInt32}) dr
    left join customer_events e
    on date_trunc({bin_size:String}, e.timestamp) = dr.period
    ${customRangeFilter}
group by dr.period${groupBy.groupBy}
order by dr.period${groupBy.orderBy};
      `;

		const { binCount, binEndDate, filterStartDate, filterEndDate } =
			params.custom_range
				? EventsAggregationService.calculateCustomRangeParams({
						customRange: params.custom_range,
						binSize: params.bin_size,
					})
				: {
						binCount: undefined,
						binEndDate: undefined,
						filterStartDate: undefined,
						filterEndDate: undefined,
					};

		const intervalTypeToDaysMap =
			EventsAggregationService.intervalTypeToDaysMap({
				gap: getBCResults?.gap,
			});

		const binSize =
			params.bin_size ?? (intervalType === "24h" ? "hour" : "day");

		const currentDayOffset = 1;
		const calculateBinCount = (days: number): number => {
			const count = binSize === "hour" ? days * 24 : days;
			return count + currentDayOffset;
		};

		const standardIntervalBinCount =
			intervalTypeToDaysMap[intervalType as keyof typeof intervalTypeToDaysMap];

		const finalBinCount =
			binCount ?? calculateBinCount(standardIntervalBinCount);

		// Use date_range_bc_view query for billing cycles or custom ranges
		const useBillingCycleQuery =
			useCustomDateQuery &&
			!params.aggregateAll &&
			(getBCResults?.startDate || params.custom_range);

		const queryToUse = useBillingCycleQuery ? queryBillingCycle : query;

		// Calculate interval offset based on query type:
		// - Custom ranges: offset = bin_count (already calculated correctly with +1)
		// - Billing cycles: offset = bin_count (gap already includes correct calculation)
		// - Standard intervals: offset = bin_count - 1 (to include current period)
		const intervalOffset = useBillingCycleQuery
			? finalBinCount
			: finalBinCount - 1;

		const queryParams = {
			org_id: org?.id,
			env: env,
			customer_id: params.customer_id,
			bin_count: finalBinCount,
			interval_offset: intervalOffset,
			bin_size: binSize,
			end_date: binEndDate ?? getBCResults?.endDate,
			filter_start_date: filterStartDate,
			filter_end_date: filterEndDate,
		};

		const result = await (clickhouseClient as ClickHouseClient).query({
			query: queryToUse,
			query_params: queryParams,
			format: "JSON",
			clickhouse_settings: {
				output_format_json_quote_decimals: 0,
				output_format_json_quote_64bit_integers: 1,
				output_format_json_quote_64bit_floats: 1,
			},
		});

		const resultJson = (await result.json()) as ClickHouseResult;

		resultJson.data.forEach((row) => {
			Object.keys(row).forEach((key: string) => {
				// Don't convert period or the group_by field to decimal
				if (key !== "period" && key !== groupByFieldName) {
					row[key] = new Decimal(row[key] as string | number)
						.toDecimalPlaces(10)
						.toNumber();
				}
			});
		});

		return resultJson;
	}

	static async getTotalEvents({
		ctx,
		params,
	}: {
		ctx: AutumnContext;
		params: TotalEventsParams;
	}) {
		const { clickhouseClient, org, env } = ctx;

		const { startDate, endDate } =
			await EventsAggregationService.calculateDateRange({
				ctx,
				params: {
					interval: params.interval,
					bin_size: params.bin_size,
					custom_range: params.custom_range,
					customer: params.customer,
					aggregateAll: params.aggregateAll,
				},
			});

		const query = `
with customer_events as (
    select *
    from org_events_view(org_id={org_id:String}, org_slug='', env={env:String})
    ${params.aggregateAll ? "" : "where customer_id = {customer_id:String}"}
)
select
    e.event_name,
    COUNT(*) as count,
    SUM(e.value) as sum
from customer_events e
where e.timestamp >= {start_date:DateTime}
  and e.timestamp <= {end_date:DateTime}
  and e.event_name IN {event_names:Array(String)}
group by e.event_name;
`;

		const result = await (clickhouseClient as ClickHouseClient).query({
			query,
			query_params: {
				org_id: org?.id,
				env: env,
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

		return rows.reduce(
			(acc, row) => {
				acc[row.event_name] = {
					count: new Decimal(row.count).toDecimalPlaces(10).toNumber(),
					sum: new Decimal(row.sum ?? 0).toDecimalPlaces(10).toNumber(),
				};
				return acc;
			},
			{} as Record<string, { count: number; sum: number }>,
		);
	}
}
