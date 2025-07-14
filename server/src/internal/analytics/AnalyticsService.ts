import { DrizzleCli } from "@/db/initDrizzle.js";
import { ClickHouseClient } from "@clickhouse/client";
import {
  Customer,
  ErrCode,
  events,
  FullCustomer,
  FullCusProduct,
  CusProductStatus,
  Subscription,
} from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import { gte, lte } from "drizzle-orm";
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

  static async getTimeseriesEvents({
    req,
    params,
    customer,
  }: {
    req: ExtendedRequest;
    params: any;
    customer: FullCustomer;
  }) {
    const { clickhouseClient, org, env, db } = req;

    const intervalType: "24h" | "7d" | "30d" | "90d" | "1bc" | "3bc" =
      params.interval || "24h";

    const isBillingCycle = intervalType === "1bc" || intervalType === "3bc";
    this.handleEarlyExit();

    let getBCResults = isBillingCycle
      ? await this.getBillingCycleStartDate(
          customer,
          db,
          intervalType as "1bc" | "3bc",
        )
      : null;

    const countExpressions = params.event_names
      .map(
        (eventName: string) =>
          `coalesce(sumIf(e.value, e.event_name = '${eventName}'), 0) as ${eventName.replace(/[^a-zA-Z0-9]/g, "_")}_count`,
      )
      .join(",\n  ");

    const startDate = isBillingCycle ? getBCResults?.startDate : null;

    if (this.clickhouseAvailable) {
      const query = `
with customer_events as (
    select * 
    from org_events_view(org_id={org_id:String}, org_slug='', env={env:String}) 
    where customer_id = {customer_id:String}
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
    where customer_id = {customer_id:String}
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

      console.log("getBCResults", getBCResults);

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

      console.log("queryParams", queryParams);

      const result = await (clickhouseClient as ClickHouseClient).query({
        query: isBillingCycle ? queryBillingCycle : query,
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
  }: {
    req: ExtendedRequest;
    params: any;
    customer: FullCustomer;
  }) {
    const { clickhouseClient, org, db } = req;

    this.handleEarlyExit();

    let startDate = new Date();
    const intervalType = params.interval || "day";
    const isBillingCycle = intervalType === "1bc" || intervalType === "3bc";
    let getBCResults = isBillingCycle
      ? await this.getBillingCycleStartDate(customer, db, intervalType)
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

    const finalStartDate = isBillingCycle
      ? getBCResults?.startDate
      : this.formatJsDateToClickHouseDateTime(startDate);
    const finalEndDate = isBillingCycle
      ? getBCResults?.endDate
      : this.formatJsDateToClickHouseDateTime(new Date());

    const query = `
    SELECT timestamp, event_name, value
FROM public_events
WHERE org_id = {organizationId:String}
  AND internal_customer_id = {customerId:String}
  AND timestamp >= toDateTime({startDate:String})
  AND timestamp < toDateTime({endDate:String})
    `;

    const result = await (clickhouseClient as ClickHouseClient).query({
      query,
      query_params: {
        organizationId: org?.id,
        customerId: params.customer_id,
        startDate: finalStartDate,
        endDate: finalEndDate,
      },
    });

    const resultJson = await result.json();

    return resultJson;
  }

  static async getBillingCycleStartDate(
    customer: FullCustomer,
    db: DrizzleCli,
    intervalType: "1bc" | "3bc",
  ) {
    let subscriptions: Subscription[] = [];
    let customerHasProducts = notNullish(customer.customer_products);
    let customerHasSubscriptions = notNullish(customer.subscriptions);
    // console.log("customerHasSubscriptions", customerHasSubscriptions);
    // console.log("customer.subscriptions", customer.subscriptions);
    // console.log("customerHasProducts", customerHasProducts);
    // console.log("customer.customer_products", customer.customer_products);

    if (!customerHasProducts) {
      // do something
    }

    if (!customerHasSubscriptions) {
      subscriptions = await SubService.getInStripeIds({
        db,
        ids:
          customer.customer_products?.flatMap(
            (product: FullCusProduct) => product.subscription_ids ?? [],
          ) ?? [],
      });

      // console.log("subscriptions", subscriptions);
    }

    let customerProductsFiltered = customer.customer_products?.filter(
      (product: FullCusProduct) => {
        let hasGroup = product.product.group != "";
        let isAddon = product.product.is_add_on;
        let isActive =
          product.status === CusProductStatus.Active ||
          product.status === CusProductStatus.Trialing;
        console.log(
          "product",
          product.product.name,
          isAddon,
          hasGroup,
          isActive,
          "condition: ",
          !isAddon && !hasGroup && isActive,
        );
        return !isAddon && !hasGroup && isActive;
      },
    );

    // console.log("customerProductsFiltered", customerProductsFiltered);

    if (customerProductsFiltered?.length === 0) return {}; // do something

    let startDates: any[] = [];
    let endDates: any[] = [];

    customerProductsFiltered?.forEach((product: FullCusProduct) => {
      product.subscription_ids?.forEach((subscriptionId: string) => {
        let subscription = subscriptions.find(
          (subscription: Subscription) =>
            subscription.stripe_id === subscriptionId,
        );
        // console.log("subscription", subscription);
        if (subscription) {
          startDates.push(
            new Date((subscription.current_period_start ?? 0) * 1000)
              .toISOString()
              .replace("T", " ")
              .split(".")[0],
          );
          endDates.push(
            new Date((subscription.current_period_end ?? 0) * 1000)
              .toISOString()
              .replace("T", " ")
              .split(".")[0],
          );
        }
      });
    });

    // console.log("startDates", startDates);
    // console.log("endDates", endDates);

    const startDate = new Date(startDates[0]);
    const endDate = new Date(endDates[0]);
    const gap = endDate.getTime() - startDate.getTime();
    const gapDays = Math.floor(gap / (1000 * 60 * 60 * 24));

    console.log("startDates", startDates);
    console.log("endDates", endDates);
    console.log("gapDays", gapDays);

    return {
      startDate: startDates[0],
      endDate: endDates[0],
      gap: gapDays * (intervalType === "1bc" ? 1 : 3),
    };
  }
}
