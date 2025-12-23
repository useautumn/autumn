import {
	ErrCode,
	type FullCustomer,
	type RangeEnum,
	RecaseError,
} from "@autumn/shared";
import type { ClickHouseClient } from "@clickhouse/client";
import { Decimal } from "decimal.js";
import { StatusCodes } from "http-status-codes";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { getBillingCycleStartDate } from "./analyticsUtils.js";

export class AnalyticsService {
	static clickhouseAvailable =
		process.env.CLICKHOUSE_URL &&
		process.env.CLICKHOUSE_USERNAME &&
		process.env.CLICKHOUSE_PASSWORD;

	static handleEarlyExit = () => {
		if (!AnalyticsService.clickhouseAvailable) {
			throw new RecaseError({
				message: "ClickHouse is disabled, cannot fetch events",
				code: ErrCode.ClickHouseDisabled,
				statusCode: StatusCodes.SERVICE_UNAVAILABLE,
			});
		}
	};

	static formatJsDateToClickHouseDateTime(date: Date) {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		const hours = String(date.getHours()).padStart(2, "0");
		const minutes = String(date.getMinutes() - 1).padStart(2, "0");
		const seconds = String(date.getSeconds() - 1).padStart(2, "0");

		return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
	}

	static async getTopEventNames({
		req,
		limit = 3,
	}: {
		req: ExtendedRequest;
		limit?: number;
	}) {
		const { clickhouseClient, org, env } = req;

		const query = `
    select count(*) as count, event_name 
    from org_events_view(org_id={org_id:String}, org_slug='', env={env:String}) 
    where timestamp >= NOW() - INTERVAL '1 month'
    group by event_name
    order by count(*) desc
    limit {limit:UInt32}
    `;
		const result = await clickhouseClient.query({
			query,
			query_params: {
				org_id: org?.id,
				env: env,
				limit,
			},
		});

		const resultJson = await result.json();

		return {
			eventNames: (resultJson.data as { event_name: string }[]).map(
				(row) => row.event_name,
			),
			result: resultJson,
		};
	}

	static async getTopUser({ req }: { req: ExtendedRequest }) {
		const { clickhouseClient, org, env } = req;

		const query = `
SELECT 
  c.name 
FROM 
  events e 
JOIN 
  customers c ON e.customer_id = c.id 
WHERE 
  toDate(e.timestamp) = today() 
  AND e.org_id = {org_id: String} 
  AND e.env = {env: String} 
GROUP BY 
  c.name 
ORDER BY 
  COUNT(*) DESC 
LIMIT 1 
 
UNION ALL 

SELECT 
  'None' 
WHERE 
  NOT EXISTS ( 
    SELECT 
      1 
    FROM 
      events e 
    JOIN 
      customers c ON e.customer_id = c.id 
    WHERE 
      toDate(e.timestamp) = today() 
      AND e.org_id = {org_id: String} 
      AND e.env = {env: String} 
    GROUP BY 
      c.name 
    ORDER BY 
      COUNT(*) DESC 
    LIMIT 1 
  )
		`;

		const result = await clickhouseClient.query({
			query,
			query_params: {
				org_id: org?.id,
				env: env,
			},
		});

		const resultJson = await result.json();

		return (resultJson.data as { name: string; count: number }[])[0];
	}

	static async getTotalEvents({
		req,
		eventName,
	}: {
		req: ExtendedRequest;
		eventName?: string;
	}) {
		const { clickhouseClient, org, env } = req;

		const query = `
SELECT SUM(
  CASE
    WHEN JSONHas(properties, 'value') THEN toInt64(JSONExtractFloat(properties, 'value'))
    WHEN value IS NOT NULL THEN toInt64(value)
    ELSE 1
  END
) AS total_events
FROM org_events_view(org_id={org_id:String}, org_slug='', env={env:String})
WHERE event_name = {eventName:String}
		`;

		const result = await clickhouseClient.query({
			query,
			query_params: {
				org_id: org?.id,
				env: env,
				eventName: eventName ?? undefined,
			},
		});

		const resultJson = await result.json();

		return (resultJson.data as { total_events: number }[])[0].total_events;
	}

	static async getTotalCustomers({ req }: { req: ExtendedRequest }) {
		const { clickhouseClient, org, env } = req;
		const query = `SELECT COUNT(DISTINCT id) AS total_customers 
FROM customers
WHERE org_id = {org_id:String} 
  AND env = {env:String};`;

		const result = await clickhouseClient.query({
			query,
			query_params: {
				org_id: org?.id,
				env: env,
			},
		});

		const resultJson = await result.json();

		return (resultJson.data as { total_customers: number }[])[0]
			.total_customers;
	}

	static async getTimeseriesEvents({
		req,
		params,
		customer,
		aggregateAll = false,
	}: {
		req: ExtendedRequest;
		params: {
			event_names: string[];
			interval: RangeEnum;
			customer_id?: string;
			no_count?: boolean;
		};
		customer?: FullCustomer;
		aggregateAll?: boolean;
	}) {
		const { clickhouseClient, org, env, db } = req;

		const intervalType: RangeEnum = params.interval || "24h";

		const isBillingCycle = intervalType === "1bc" || intervalType === "3bc";
		AnalyticsService.handleEarlyExit();

		// Skip billing cycle calculation if aggregating all customers
		const getBCResults =
			isBillingCycle && !aggregateAll && customer
				? ((await getBillingCycleStartDate(
						customer,
						db,
						intervalType as "1bc" | "3bc",
					)) as { startDate: string; endDate: string; gap: number } | null)
				: null;

		// Generate expressions for queries (works for both MV and original)
		const generateExpressions = (
			eventNames: string[],
			noCount: boolean,
			useMV: boolean,
		) => {
			const alias = useMV ? "ce" : "e";
			return eventNames
				.map((eventName) => {
					const escapedEventName = eventName.replace(/'/g, "''");
					const columnName = noCount ? eventName : `${eventName}_count`;
					return `coalesce(sumIf(${alias}.value, ${alias}.event_name = '${escapedEventName}'), 0) as \`${columnName}\``;
				})
				.join(",\n    ");
		};

		if (AnalyticsService.clickhouseAvailable) {
			const queryParams = {
				org_id: org?.id,
				env: env,
				customer_id: params.customer_id,
				days:
					intervalType === "24h"
						? 1
						: intervalType === "7d"
							? 7
							: intervalType === "30d"
								? 30
								: intervalType === "90d"
									? 90
									: intervalType === "1bc"
										? (getBCResults?.gap ?? 0) + 1
										: intervalType === "3bc"
											? (getBCResults?.gap ?? 0)
											: 0,
				bin_size: intervalType === "24h" ? "hour" : "day",
				end_date: isBillingCycle ? getBCResults?.endDate : undefined,
			};

			// Try materialized view first, fallback to original query if it fails
			try {
				const mvCountExpressions = generateExpressions(
					params.event_names,
					params.no_count ?? false,
					true,
				);

				const mvQuery = `
with customer_events as (
    select 
        period_hour,
        event_name,
        sum(value) as value
    from events_usage_mv
    where org_id = {org_id:String}
      and env = {env:String}
      ${aggregateAll ? "" : "and customer_id = {customer_id:String}"}
      and period_hour >= date_trunc({bin_size:String}, now() - INTERVAL {days:UInt32} day)
    group by period_hour, event_name
)
select 
    dr.period, 
    ${mvCountExpressions}
from date_range_view(bin_size={bin_size:String}, days={days:UInt32}) dr
    left join customer_events ce
    on ${intervalType === "24h" ? "ce.period_hour" : `date_trunc('day', ce.period_hour)`} = dr.period 
group by dr.period 
order by dr.period;
`;

				const mvQueryBillingCycle = `
with customer_events as (
    select 
        period_hour,
        event_name,
        sum(value) as value
    from events_usage_mv
    where org_id = {org_id:String}
      and env = {env:String}
      ${aggregateAll ? "" : "and customer_id = {customer_id:String}"}
      and period_hour >= date_trunc('day', toDateTime({end_date:String}) - INTERVAL {days:UInt32} day)
      and period_hour < date_trunc('day', toDateTime({end_date:String}))
    group by period_hour, event_name
)
select 
    dr.period, 
    ${mvCountExpressions}
from date_range_bc_view(bin_size={bin_size:String}, start_date={end_date:DateTime}, days={days:UInt32}) dr
    left join customer_events ce
    on ${intervalType === "24h" ? "ce.period_hour" : `date_trunc('day', ce.period_hour)`} = dr.period 
group by dr.period 
order by dr.period;
      `;

				const mvQueryToUse =
					isBillingCycle && !aggregateAll && getBCResults?.startDate
						? mvQueryBillingCycle
						: mvQuery;

				const result = await (clickhouseClient as ClickHouseClient).query({
					query: mvQueryToUse,
					query_params: queryParams,
					format: "JSON",
					clickhouse_settings: {
						output_format_json_quote_decimals: 0,
						output_format_json_quote_64bit_integers: 1,
						output_format_json_quote_64bit_floats: 1,
					},
				});

				const resultJson = await result.json();

				(resultJson.data as Record<string, unknown>[]).forEach((row) => {
					Object.keys(row).forEach((key: string) => {
						if (key !== "period") {
							row[key] = new Decimal(row[key] as number)
								.toDecimalPlaces(10)
								.toNumber();
						}
					});
				});

				return resultJson;
			} catch {
				// Fallback to original query if materialized view doesn't exist or fails
				const fallbackCountExpressions = generateExpressions(
					params.event_names,
					params.no_count ?? false,
					false,
				);

				const fallbackQuery = `
with customer_events as (
    select * 
    from org_events_view(org_id={org_id:String}, org_slug='', env={env:String}) 
    ${aggregateAll ? "" : "where customer_id = {customer_id:String}"}
)
select 
    dr.period, 
    ${fallbackCountExpressions}
from date_range_view(bin_size={bin_size:String}, days={days:UInt32}) dr
    left join customer_events e
    on date_trunc({bin_size:String}, e.timestamp) = dr.period 
group by dr.period 
order by dr.period;
`;

				const fallbackQueryBillingCycle = `
with customer_events as (
    select * 
    from org_events_view(org_id={org_id:String}, org_slug='', env={env:String}) 
    ${aggregateAll ? "" : "where customer_id = {customer_id:String}"}
)
select 
    dr.period, 
    ${fallbackCountExpressions}
from date_range_bc_view(bin_size={bin_size:String}, start_date={end_date:DateTime}, days={days:UInt32}) dr
    left join customer_events e
    on date_trunc({bin_size:String}, e.timestamp) = dr.period 
group by dr.period 
order by dr.period;
      `;

				const fallbackQueryToUse =
					isBillingCycle && !aggregateAll && getBCResults?.startDate
						? fallbackQueryBillingCycle
						: fallbackQuery;

				const result = await (clickhouseClient as ClickHouseClient).query({
					query: fallbackQueryToUse,
					query_params: queryParams,
					format: "JSON",
					clickhouse_settings: {
						output_format_json_quote_decimals: 0,
						output_format_json_quote_64bit_integers: 1,
						output_format_json_quote_64bit_floats: 1,
					},
				});

				const resultJson = await result.json();

				(resultJson.data as Record<string, unknown>[]).forEach((row) => {
					Object.keys(row).forEach((key: string) => {
						if (key !== "period") {
							row[key] = new Decimal(row[key] as number)
								.toDecimalPlaces(10)
								.toNumber();
						}
					});
				});

				return resultJson;
			}
		}
	}

	static async getRawEvents({
		req,
		params,
		customer,
		aggregateAll = false,
	}: {
		req: ExtendedRequest;
		params: { customer_id?: string; interval?: string };
		customer?: FullCustomer;
		aggregateAll?: boolean;
	}) {
		const { clickhouseClient, org, db, env } = req;

		AnalyticsService.handleEarlyExit();

		const startDate = new Date();
		const intervalType = params.interval || "day";
		const isBillingCycle = intervalType === "1bc" || intervalType === "3bc";

		// Skip billing cycle calculation if aggregating all customers
		const getBCResults =
			isBillingCycle && !aggregateAll && customer
				? ((await getBillingCycleStartDate(
						customer,
						db,
						intervalType as "1bc" | "3bc",
					)) as { startDate: string; endDate: string; gap: number } | null)
				: null;

		switch (intervalType) {
			case "24h":
				startDate.setHours(startDate.getHours() - 24);
				break;
			case "7d":
				startDate.setDate(startDate.getDate() - 7);
				break;
			case "30d":
				startDate.setDate(startDate.getDate() - 30);
				break;
			case "90d":
				startDate.setDate(startDate.getDate() - 90);
				break;
			default:
				startDate.setDate(startDate.getDate() - 24);
				break;
		}

		const finalStartDate =
			isBillingCycle && getBCResults?.startDate
				? getBCResults.startDate
				: AnalyticsService.formatJsDateToClickHouseDateTime(startDate);
		const finalEndDate =
			isBillingCycle && getBCResults?.endDate
				? getBCResults.endDate
				: AnalyticsService.formatJsDateToClickHouseDateTime(new Date());

		const query = `
    SELECT *
    FROM org_events_view(org_id={organizationId:String}, org_slug='', env={env:String})
    WHERE timestamp >= toDateTime({startDate:String})
    AND timestamp < toDateTime({endDate:String})
    ${aggregateAll ? "" : "AND customer_id = {customerId:String}"}
    ORDER BY timestamp DESC
    limit 10000
    `;

		const result = await clickhouseClient.query({
			query: query,
			query_params: {
				organizationId: org?.id,
				customerId: params.customer_id,
				startDate: finalStartDate,
				endDate: finalEndDate,
				env: env,
			},
		});

		// log the actual query... with params filled in...?
		// console.log("query", query);

		const resultJson = await result.json();

		return resultJson;
	}
}
