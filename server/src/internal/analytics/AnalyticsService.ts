import { DrizzleCli } from "@/db/initDrizzle.js";
import { ClickHouseClient } from "@clickhouse/client";
import { events } from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import { gte, lte } from "drizzle-orm";
import { ExtendedRequest } from "@/utils/models/Request.js";

export class AnalyticsService {
  static clickHouseEnabled =
    process.env.CLICKHOUSE_URL &&
    process.env.CLICKHOUSE_USERNAME &&
    process.env.CLICKHOUSE_PASSWORD;

  static drizzleEnabled = process.env.DATABASE_URL;

  static handleEarlyExit = () => {
    if (!this.clickHouseEnabled && !this.drizzleEnabled) {
      throw new Error(
        "Both ClickHouse and Drizzle are disabled, cannot fetch events",
      );
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

  static async getEvents({
    req,
    params,
  }: {
    req: ExtendedRequest;
    params: any;
  }) {
    const { db, clickhouseClient, org } = req;

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

    this.handleEarlyExit();

    // Shared count expressions for ClickHouse
    const countExpressions = params.event_names
      .map((eventName: string) =>
        this.clickHouseEnabled
          ? `countIf(event_name = '${eventName}') AS ${eventName.replace(/[^a-zA-Z0-9]/g, "_")}_count`
          : `COUNT(*) FILTER (WHERE event_name = '${eventName}') AS ${eventName.replace(/[^a-zA-Z0-9]/g, "_")}_count`,
      )
      .join(",\n  ");

    if (this.clickHouseEnabled) {
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
    } else {
      // Create the interval truncation expression
      const getIntervalTrunc = () =>
        sql`DATE_TRUNC(${
          intervalType === "day"
            ? sql`'day'`
            : intervalType === "week"
              ? sql`'week'`
              : intervalType === "month"
                ? sql`'month'`
                : intervalType === "quarter"
                  ? sql`'quarter'`
                  : intervalType === "year"
                    ? sql`'year'`
                    : sql`'day'`
        }, ${events.timestamp})`;

      // Create Drizzle-specific count expressions
      const drizzleCountExpressions = params.event_names.map(
        (eventName: string) =>
          sql`COUNT(*) FILTER (WHERE ${events.event_name} = ${eventName})`.as(
            `${eventName.replace(/[^a-zA-Z0-9]/g, "_")}_count`,
          ),
      );

      const query = db
        .select({
          interval_start: getIntervalTrunc().as("interval_start"),
          ...Object.fromEntries(
            drizzleCountExpressions.map((expr: any, i: any) => [
              `${params.event_names[i].replace(/[^a-zA-Z0-9]/g, "_")}_count`,
              expr,
            ]),
          ),
        })
        .from(events)
        .where(
          and(
            eq(events.org_id, org.id),
            eq(events.internal_customer_id, params.customer_id),
            gte(events.timestamp, startDate),
            lte(events.timestamp, new Date()),
          ),
        )
        .groupBy(getIntervalTrunc())
        .orderBy(getIntervalTrunc());

      // console.log("Query:", query);

      const results = await query;

      return { data: results, rows: results.length };
    }
  }
}
