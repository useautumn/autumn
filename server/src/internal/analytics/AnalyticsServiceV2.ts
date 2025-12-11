import type { FullCustomer, RangeEnum } from "@autumn/shared";
import type { ClickHouseClient } from "@clickhouse/client";
import { Decimal } from "decimal.js";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import {
	generateEventCountExpressions,
	getBillingCycleStartDate,
} from "./analyticsUtils.js";

type ClickHouseResult = {
	data: Array<Record<string, string | number>>;
};

export class AnalyticsServiceV2 {
	static async getTimeseriesEvents({
		ctx,
		params,
	}: {
		ctx: RequestContext;
		params: {
			event_names: string[];
			interval: RangeEnum;
			customer_id?: string;
			no_count?: boolean;
			aggregateAll?: boolean;
			customer?: FullCustomer;
			group_by?: string;
			bin_size?: "day" | "hour";
			custom_range?: { start: number; end: number };
		};
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

		const intervalTypeToDaysMap = {
			"24h": 1,
			"7d": 7,
			"30d": 30,
			"90d": 90,
			"1bc": (getBCResults?.gap ?? 0) + 1,
			"3bc": (getBCResults?.gap ?? 0) + 1,
		};

		// Calculate days and end_date for custom_range
		const customRangeDays = params.custom_range
			? Math.ceil(
					(params.custom_range.end - params.custom_range.start) /
						(1000 * 60 * 60 * 24),
				) + 1
			: undefined;

		const customRangeEndDate = params.custom_range
			? new Date(params.custom_range.end).toISOString().split(".")[0]
			: undefined;

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
}
