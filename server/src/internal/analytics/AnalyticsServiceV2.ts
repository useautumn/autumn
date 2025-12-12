import type { BinSizeEnum, FullCustomer, RangeEnum } from "@autumn/shared";
import type { ClickHouseClient } from "@clickhouse/client";
import { UTCDate } from "@date-fns/utc";
import { format, startOfDay, startOfHour, sub } from "date-fns";
import { Decimal } from "decimal.js";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import type {
	ClickHouseResult,
	DateRangeResult,
	TimeseriesEventsParams,
	TotalEventsParams,
} from "./analyticsTypes.js";
import {
	generateEventCountExpressions,
	getBillingCycleStartDate,
} from "./analyticsUtils.js";

export class AnalyticsServiceV2 {
	private static async calculateDateRange({
		ctx,
		params,
	}: {
		ctx: RequestContext;
		params: {
			interval: RangeEnum;
			bin_size?: BinSizeEnum;
			custom_range?: { start: number; end: number };
			customer?: FullCustomer;
			aggregateAll?: boolean;
		};
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
					)) as { startDate: string; endDate: string; gap: number } | null)
				: null;

		if (getBCResults) {
			return {
				startDate: getBCResults.startDate,
				endDate: getBCResults.endDate,
			};
		}

		const intervalTypeToDaysMap = AnalyticsServiceV2.intervalTypeToDaysMap({
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
	static async getTimeseriesEvents({
		ctx,
		params,
	}: {
		ctx: RequestContext;
		params: TimeseriesEventsParams;
	}) {
		const { clickhouseClient, org, env, db } = ctx;

		const intervalType: RangeEnum = params.interval;

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
					)) as { startDate: string; endDate: string; gap: number } | null)
				: null;

		const countExpressions = generateEventCountExpressions(
			params.event_names,
			params.no_count,
		);

		const getGroupByClause = () => {
			if (!params.group_by)
				return { select: "", groupBy: "", orderBy: "", fieldName: null };

			let field: string | null = null;
			if (params.group_by === "event_name") {
				field = "e.event_name";
			} else if (params.group_by === "customer_id") {
				field = "e.customer_id";
			} else if (params.group_by.startsWith("properties.")) {
				// Extract property path after 'properties.' and escape single quotes for SQL safety
				const propertyPath = params.group_by.replace("properties.", "");
				const escapedPath = propertyPath.replace(/'/g, "''");
				// Support dot notation for nested properties (e.g., properties.user.id)
				// ClickHouse JSONExtractString supports nested paths with dot notation
				field = `JSONExtractString(e.properties, '${escapedPath}')`;
			}

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
from date_range_view(bin_size={bin_size:String}, days={days:UInt32}) dr
    left join customer_events e
    on date_trunc({bin_size:String}, e.timestamp) = dr.period 
group by dr.period${groupBy.groupBy} 
order by dr.period${groupBy.orderBy};
`;

		const queryBillingCycle = `
with customer_events as (
    select * 
    from org_events_view(org_id={org_id:String}, org_slug='', env={env:String}) 
    ${params.aggregateAll ? "" : "where customer_id = {customer_id:String}"}
)
select 
    dr.period${groupBy.select}, 
    ${countExpressions}
from date_range_bc_view(bin_size={bin_size:String}, start_date={end_date:DateTime}, days={days:UInt32}) dr
    left join customer_events e
    on date_trunc({bin_size:String}, e.timestamp) = dr.period 
group by dr.period${groupBy.groupBy} 
order by dr.period${groupBy.orderBy};
      `;

		// Calculate days and end_date for custom_range
		const customRangeDays = params.custom_range
			? Math.ceil(
					(params.custom_range.end - params.custom_range.start) /
						(1000 * 60 * 60 * 24),
				) + 1
			: undefined;

		const customRangeEndDate = params.custom_range
			? format(new UTCDate(params.custom_range.end), "yyyy-MM-dd'T'HH:mm:ss")
			: undefined;

		const intervalTypeToDaysMap = AnalyticsServiceV2.intervalTypeToDaysMap({
			gap: getBCResults?.gap,
		});

		const queryParams = {
			org_id: org?.id,
			env: env,
			customer_id: params.customer_id,
			days:
				customRangeDays ??
				intervalTypeToDaysMap[
					intervalType as keyof typeof intervalTypeToDaysMap
				],
			bin_size: params.bin_size ?? (intervalType === "24h" ? "hour" : "day"),
			end_date: customRangeEndDate ?? getBCResults?.endDate,
		};

		// Use date_range_bc_view query for billing cycles or custom ranges
		const queryToUse =
			useCustomDateQuery &&
			!params.aggregateAll &&
			(getBCResults?.startDate || params.custom_range)
				? queryBillingCycle
				: query;

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
		ctx: RequestContext;
		params: TotalEventsParams;
	}) {
		const { clickhouseClient, org, env } = ctx;

		const { startDate, endDate } = await AnalyticsServiceV2.calculateDateRange({
			ctx,
			params: {
				interval: params.interval,
				bin_size: params.bin_size,
				custom_range: params.custom_range,
				customer: params.customer,
				aggregateAll: params.aggregateAll,
			},
		});

		const eventNamesFilter = params.event_names
			.map((name) => `'${name.replace(/'/g, "''")}'`)
			.join(", ");

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
  and e.event_name IN (${eventNamesFilter})
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
					count: Number(row.count),
					sum: Number(row.sum ?? 0),
				};
				return acc;
			},
			{} as Record<string, { count: number; sum: number }>,
		);
	}
}
