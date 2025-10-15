/** biome-ignore-all lint/complexity/noStaticOnlyClass: wrap it up buddy */

import { ErrCode, type FullCustomer } from "@autumn/shared";
import type { ClickHouseClient } from "@clickhouse/client";
import { Decimal } from "decimal.js";
import { StatusCodes } from "http-status-codes";
import RecaseError from "@/utils/errorUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import {
	generateEventCountExpressions,
	getBillingCycleStartDate,
} from "./analyticsUtils.js";

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
    SELECT COUNT(*) AS count, event_name 
    FROM org_events_view(org_id={org_id:String}, org_slug='', env={env:String}) 
    WHERE timestamp >= NOW() - INTERVAL '1 month'
    GROUP BY event_name
    ORDER BY COUNT(*) DESC
    LIMIT {limit:UInt32}
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
			eventNames: resultJson.data.map((row: any) => row.event_name),
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
		const { clickhouseClient, org, env, db } = req;

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
			interval: "24h" | "7d" | "30d" | "90d" | "1bc" | "3bc";
			customer_id?: string;
			no_count?: boolean;
		};
		customer?: FullCustomer;
		aggregateAll?: boolean;
	}) {
		const { clickhouseClient, org, env, db } = req;

		const intervalType: "24h" | "7d" | "30d" | "90d" | "1bc" | "3bc" =
			params.interval || "24h";

		const isBillingCycle = intervalType === "1bc" || intervalType === "3bc";
		AnalyticsService.handleEarlyExit();

		// Skip billing cycle calculation if aggregating all customers
		const getBCResults =
			isBillingCycle && !aggregateAll && customer
				? ((await getBillingCycleStartDate(
						env,
						org?.id,
						customer,
						db,
						intervalType as "1bc" | "3bc",
					)) as { startDate: string; endDate: string; gap: number } | null)
				: null;

		const countExpressions = generateEventCountExpressions(
			params.event_names,
			params.no_count,
		);

		if (AnalyticsService.clickhouseAvailable) {
			const query = `
WITH customer_events AS (
    SELECT * 
    FROM org_events_view(org_id={org_id:String}, org_slug='', env={env:String}) 
    ${aggregateAll ? "" : "WHERE customer_id = {customer_id:String}"}
)
SELECT 
    dr.period, 
    ${countExpressions}
FROM date_range_view(bin_size={bin_size:String}, days={days:UInt32}) dr
    LEFT JOIN customer_events e
    ON date_trunc({bin_size:String}, e.timestamp) = dr.period 
GROUP BY dr.period 
ORDER BY dr.period;
`;

			const queryBillingCycle = `
WITH customer_events AS (
    SELECT * 
    FROM org_events_view(org_id={org_id:String}, org_slug='', env={env:String}) 
    ${aggregateAll ? "" : "WHERE customer_id = {customer_id:String}"}
)
SELECT 
    dr.period, 
    ${countExpressions}
FROM date_range_bc_view(bin_size={bin_size:String}, start_date={end_date:DateTime}, days={days:UInt32}) dr
    LEFT JOIN customer_events e
    ON date_trunc({bin_size:String}, e.timestamp) = dr.period 
GROUP BY dr.period 
ORDER BY dr.period;
      `;

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

			// Use regular query for aggregateAll or when no billing cycle data is available
			const queryToUse =
				isBillingCycle && !aggregateAll && getBCResults?.startDate
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

			const resultJson = await result.json();

			resultJson.data.forEach((row: any) => {
				Object.keys(row).forEach((key: string) => {
					if (key !== "period") {
						row[key] = new Decimal(row[key]).toDecimalPlaces(10).toNumber();
					}
				});
			});

			return resultJson;
		}
	}

	static async getRawEvents({
		req,
		params,
		customer,
		aggregateAll = false,
	}: {
		req: ExtendedRequest;
		params: any;
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
						env,
						org?.id,
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
    LIMIT 10000
    `;

		const filledQuery = query
			.replace("{organizationId:String}", org?.id ?? "")
			.replace("{customerId:String}", params.customer_id ?? "")
			.replace("{startDate:String}", finalStartDate)
			.replace("{endDate:String}", finalEndDate)
			.replace("{env:String}", env);

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

		const resultJson = await result.json();

		return resultJson;
	}

	static async getEventsByGranularity({
		req,
		params,
		customer,
		aggregateAll = false,
	}: {
		req: ExtendedRequest;
		params: {
			customer_id?: string;
			event_names?: string[];
			granularity: "minute" | "hour" | "day";
			days?: number;
		};
		customer?: FullCustomer;
		aggregateAll?: boolean;
	}) {
		const { clickhouseClient, org, env } = req;

		AnalyticsService.handleEarlyExit();

		const days = params.days || 7;
		const granularity = params.granularity || "hour";
		const eventNames = params.event_names || [];

		const startDate = new Date();
		startDate.setDate(startDate.getDate() - days);

		const startDateStr = AnalyticsService.formatJsDateToClickHouseDateTime(startDate);
		const endDateStr = AnalyticsService.formatJsDateToClickHouseDateTime(new Date());

		const eventFilter = eventNames.length > 0 
			? `AND event_name IN (${eventNames.map(() => '{eventName:String}').join(', ')})`
			: '';

		const truncateFunction = granularity === "minute" ? "toStartOfMinute" 
			: granularity === "hour" ? "toStartOfHour" 
			: "toStartOfDay";

		const query = `
    SELECT 
        ${truncateFunction}(timestamp) AS period,
        event_name,
        SUM(value) AS total_value,
        COUNT(*) AS event_count
    FROM org_events_view(org_id={organizationId:String}, org_slug='', env={env:String})
    WHERE timestamp >= toDateTime({startDate:String})
    AND timestamp < toDateTime({endDate:String})
    ${aggregateAll ? "" : "AND customer_id = {customerId:String}"}
    ${eventFilter}
    GROUP BY period, event_name
    ORDER BY period DESC, event_name
    `;

		const queryParams: any = {
			organizationId: org?.id,
			customerId: params.customer_id,
			startDate: startDateStr,
			endDate: endDateStr,
			env: env,
		};

		eventNames.forEach((eventName, index) => {
			queryParams[`eventName${index}`] = eventName;
		});

		const result = await clickhouseClient.query({
			query,
			query_params: queryParams,
		});

		const resultJson = await result.json();

		return resultJson;
	}

	// private static async getSubscriptionsIfNeeded(
	//   customer: FullCustomer,
	//   customerHasSubscriptions: boolean,
	//   db: DrizzleCli
	// ): Promise<Subscription[]> {
	//   if (customerHasSubscriptions) {
	//     return [];
	//   }

	//   return await SubService.getInStripeIds({
	//     db,
	//     ids:
	//       customer.customer_products?.flatMap(
	//         (product: FullCusProduct) => product.subscription_ids ?? []
	//       ) ?? [],
	//   });
	// }
}
