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
		};
	}) {
		const { clickhouseClient, org, env, db } = ctx;

		const intervalType: RangeEnum = params.interval;

		const isBillingCycle = intervalType === "1bc" || intervalType === "3bc";

		// Skip billing cycle calculation if aggregating all customers
		const getBCResults =
			isBillingCycle && !params.aggregateAll && params.customer
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

		const queryParams = {
			org_id: org?.id,
			env: env,
			customer_id: params.customer_id,
			days: intervalTypeToDaysMap[
				intervalType as keyof typeof intervalTypeToDaysMap
			],
			bin_size: intervalType === "24h" ? "hour" : "day",
			end_date: isBillingCycle ? getBCResults?.endDate : undefined,
		};

		// Use regular query for aggregateAll or when no billing cycle data is available
		const queryToUse =
			isBillingCycle && !params.aggregateAll && getBCResults?.startDate
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
