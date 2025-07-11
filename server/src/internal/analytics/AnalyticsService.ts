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
    const { clickhouseClient, org } = req;

    let startDate = new Date();
    const intervalType = params.interval || "day";

    this.handleEarlyExit();

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

    const countExpressions = params.event_names
      .map((eventName: string) =>
        this.clickhouseAvailable
          ? `countIf(event_name = '${eventName}') AS ${eventName.replace(/[^a-zA-Z0-9]/g, "_")}_count`
          : `COUNT(*) FILTER (WHERE event_name = '${eventName}') AS ${eventName.replace(/[^a-zA-Z0-9]/g, "_")}_count`,
      )
      .join(",\n  ");

    if (this.clickhouseAvailable) {
      const query = `
SELECT
  ${
    intervalType === "day"
      ? "toStartOfDay(timestamp)"
      : intervalType === "week"
        ? "toStartOfWeek(timestamp)"
        : intervalType === "month"
          ? "toStartOfMonth(timestamp)"
          : intervalType === "quarter"
            ? "toStartOfQuarter(timestamp)"
            : intervalType === "year"
              ? "toStartOfYear(timestamp)"
              : "toStartOfDay(timestamp)"
  } AS interval_start,
  ${countExpressions}
FROM public_events
WHERE org_id = {organizationId:String}
  AND internal_customer_id = {customerId:String}
  AND timestamp >= toDateTime({startDate:String})
  AND timestamp < toDateTime({endDate:String})
GROUP BY interval_start
ORDER BY interval_start ASC;`;

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
