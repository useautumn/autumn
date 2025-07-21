import { DrizzleCli } from "@/db/initDrizzle.js";
import { ClickHouseClient } from "@clickhouse/client";
import {
  ErrCode,
  FullCustomer,
  FullCusProduct,
  CusProductStatus,
  Subscription,
} from "@autumn/shared";
import { ExtendedRequest } from "@/utils/models/Request.js";
import RecaseError from "@/utils/errorUtils.js";
import { StatusCodes } from "http-status-codes";
import { notNullish } from "@/utils/genUtils.js";
import { SubService } from "../subscriptions/SubService.js";

export class AnalyticsService {
  static clickhouseAvailable =
    process.env.CLICKHOUSE_URL &&
    process.env.CLICKHOUSE_USERNAME &&
    process.env.CLICKHOUSE_PASSWORD;

  static handleEarlyExit = () => {
    if (!this.clickhouseAvailable) {
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
      eventNames: resultJson.data.map((row: any) => row.event_name),
      result: resultJson,
    };
  }

  static async getTopUser({ req }: { req: ExtendedRequest }) {
    const { clickhouseClient, org, env, db } = req;

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

    console.log("resultJson", resultJson);

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
SELECT org_id, env, COUNT(*) AS total_events
FROM events
WHERE org_id = {org_id: String}
  AND env = {env: String}
  ${eventName ? `AND event_name = {eventName: String}` : ""}
GROUP BY org_id, env
LIMIT 1;
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
    const { clickhouseClient, org, env, db } = req;
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
    this.handleEarlyExit();

    // Skip billing cycle calculation if aggregating all customers
    let getBCResults =
      isBillingCycle && !aggregateAll && customer
        ? await this.getBillingCycleStartDate(
            customer,
            db,
            intervalType as "1bc" | "3bc"
          )
        : null;

    const expressionsResult = await clickhouseClient.query({
      query:
        params.no_count
          ? "SELECT generateEventCountExpressionsNoCount({event_names:Array(String)}) as expressions"
          : "SELECT generateEventCountExpressions({event_names:Array(String)}) as expressions",
      query_params: {
        event_names: params.event_names,
      },
    });

    const expressionsResultJson = await expressionsResult.json();

    if (expressionsResultJson.data.length === 0) {
      throw new RecaseError({
        message: "No expressions found",
        code: ErrCode.ClickHouseDisabled,
        statusCode: StatusCodes.SERVICE_UNAVAILABLE,
      });
    }

    const countExpressions = (
      expressionsResultJson.data as {
        expressions: string;
      }[]
    )[0].expressions;

    if (this.clickhouseAvailable) {
      const query = `
with customer_events as (
    select * 
    from org_events_view(org_id={org_id:String}, org_slug='', env={env:String}) 
    ${aggregateAll ? "" : "where customer_id = {customer_id:String}"}
)
select 
    dr.period, 
    ${countExpressions}
from date_range_view(bin_size={bin_size:String}, days={days:UInt32}) dr
    left join customer_events e
    on date_trunc({bin_size:String}, e.timestamp) = dr.period 
group by dr.period 
order by dr.period;
`;

      const queryBillingCycle = `
with customer_events as (
    select * 
    from org_events_view(org_id={org_id:String}, org_slug='', env={env:String}) 
    ${aggregateAll ? "" : "where customer_id = {customer_id:String}"}
)
select 
    dr.period, 
    ${countExpressions}
from date_range_bc_view(bin_size={bin_size:String}, start_date={end_date:DateTime}, days={days:UInt32}) dr
    left join customer_events e
    on date_trunc({bin_size:String}, e.timestamp) = dr.period 
group by dr.period 
order by dr.period;
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

      let resultJson = await result.json();

      resultJson.data.forEach((row: any) => {
        Object.keys(row).forEach((key: string) => {
          if (key !== "period") {
            row[key] = parseInt(row[key]);
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

    this.handleEarlyExit();

    let startDate = new Date();
    const intervalType = params.interval || "day";
    const isBillingCycle = intervalType === "1bc" || intervalType === "3bc";

    // Skip billing cycle calculation if aggregating all customers
    let getBCResults =
      isBillingCycle && !aggregateAll && customer
        ? await this.getBillingCycleStartDate(
            customer,
            db,
            intervalType as "1bc" | "3bc"
          )
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
        : this.formatJsDateToClickHouseDateTime(startDate);
    const finalEndDate =
      isBillingCycle && getBCResults?.endDate
        ? getBCResults.endDate
        : this.formatJsDateToClickHouseDateTime(new Date());

    const query = `
    SELECT *
    FROM org_events_view(org_id={organizationId:String}, org_slug='', env={env:String})
    WHERE timestamp >= toDateTime({startDate:String})
    AND timestamp < toDateTime({endDate:String})
    ${aggregateAll ? "" : "AND customer_id = {customerId:String}"}
    ORDER BY timestamp DESC
    limit 10000
    `;

    const filledQuery = query
      .replace("{organizationId:String}", org?.id ?? "")
      .replace("{customerId:String}", params.customer_id ?? "")
      .replace("{startDate:String}", finalStartDate)
      .replace("{endDate:String}", finalEndDate)
      .replace("{env:String}", env);

    // console.log("filledQuery", filledQuery);

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

  static async getBillingCycleStartDate(
    customer?: FullCustomer,
    db?: DrizzleCli,
    intervalType?: "1bc" | "3bc"
  ) {
    // If no customer provided, return empty object (for aggregateAll case)
    if (!customer || !db || !intervalType) {
      return {};
    }

    let subscriptions: Subscription[] = [];
    let customerHasProducts = notNullish(customer.customer_products);
    let customerHasSubscriptions = notNullish(customer.subscriptions);

    if (!customerHasProducts) {
      return {}; // No products, return empty object
    }

    if (!customerHasSubscriptions) {
      subscriptions = await SubService.getInStripeIds({
        db,
        ids:
          customer.customer_products?.flatMap(
            (product: FullCusProduct) => product.subscription_ids ?? []
          ) ?? [],
      });
    }

    let customerProductsFiltered = customer.customer_products?.filter(
      (product: FullCusProduct) => {
        let isAddon = product.product.is_add_on;
        let isActive =
          product.status === CusProductStatus.Active ||
          product.status === CusProductStatus.Trialing;

        return !isAddon && isActive;
      }
    );

    if (!customerProductsFiltered || customerProductsFiltered.length === 0)
      return {};

    let startDates: any[] = [];
    let endDates: any[] = [];

    customerProductsFiltered.forEach((product: FullCusProduct) => {
      product.subscription_ids?.forEach((subscriptionId: string) => {
        let subscription = subscriptions.find(
          (subscription: Subscription) =>
            subscription.stripe_id === subscriptionId
        );
        if (subscription) {
          startDates.push(
            new Date((subscription.current_period_start ?? 0) * 1000)
              .toISOString()
              .replace("T", " ")
              .split(".")[0]
          );
          endDates.push(
            new Date((subscription.current_period_end ?? 0) * 1000)
              .toISOString()
              .replace("T", " ")
              .split(".")[0]
          );
        }
      });
    });

    if (startDates.length === 0 || endDates.length === 0) {
      return {};
    }

    const startDate = new Date(startDates[0]);
    const endDate = new Date(endDates[0]);
    const gap = endDate.getTime() - startDate.getTime();
    const gapDays = Math.floor(gap / (1000 * 60 * 60 * 24));

    return {
      startDate: startDates[0],
      endDate: endDates[0],
      gap: gapDays * (intervalType === "1bc" ? 1 : 3),
    };
  }
}
