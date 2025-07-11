import { DrizzleCli } from "@/db/initDrizzle.js";
import { ClickHouseClient } from "@clickhouse/client";
import { ErrCode, events } from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import { gte, lte } from "drizzle-orm";
import { ExtendedRequest } from "@/utils/models/Request.js";
import RecaseError from "@/utils/errorUtils.js";
import { StatusCodes } from "http-status-codes";

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
  }: {
    req: ExtendedRequest;
    params: any;
  }) {
    const { clickhouseClient, org, env } = req;

    const intervalType: "24h" | "7d" | "30d" | "90d" =
      params.interval || "24h";

    this.handleEarlyExit();

    const countExpressions = params.event_names
      .map(
        (eventName: string) =>
          `coalesce(sumIf(e.value, e.event_name = '${eventName}'), 0) as ${eventName.replace(/[^a-zA-Z0-9]/g, "_")}_count`,
      )
      .join(",\n  ");

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

      console.log("query", query);
      console.log("query_params", {
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
                : 90,
        bin_size: intervalType === "24h" ? "hour" : "day",
      });

      const result = await (clickhouseClient as ClickHouseClient).query({
        query,
        query_params: {
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
                  : 90,
          bin_size: intervalType === "24h" ? "hour" : "day",
        },
        format: "JSON",
      });

      const resultJson = await result.json();

      return resultJson;
    }
  }

  static async getRawEvents({
    req,
    params,
  }: {
    req: ExtendedRequest;
    params: any;
  }) {
    const { clickhouseClient, org } = req;

    this.handleEarlyExit();

    let startDate = new Date();
    const intervalType = params.interval || "day";

    switch (params.interval) {
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
        startDate: this.formatJsDateToClickHouseDateTime(startDate),
        endDate: this.formatJsDateToClickHouseDateTime(new Date()),
      },
    });

    const resultJson = await result.json();

    return resultJson;
  }
}
