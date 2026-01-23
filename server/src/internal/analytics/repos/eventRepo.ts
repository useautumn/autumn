import { events } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export type TopEventNameRow = {
	event_name: string;
	count: number;
};

export type AggregateParams = {
	ctx: AutumnContext;
	eventNames: string[];
	customerId?: string;
	startDate: Date;
	endDate: Date;
	binSize: "hour" | "day" | "month";
	timezone?: string;
};

export type AggregateRow = {
	period: Date;
	event_name: string;
	count: number;
	sum: number;
};

export type RawEventRow = {
	id: string;
	customer_id: string;
	event_name: string;
	timestamp: Date;
	value: number;
	properties: string | null;
	idempotency_key: string | null;
};

export type GetRawEventsParams = {
	ctx: AutumnContext;
	customerId?: string;
	startDate: Date;
	endDate: Date;
	limit?: number;
};

export const eventRepo = {
	/**
	 * Gets top event names by count using the continuous aggregate.
	 * Much faster than scanning raw events table.
	 */
	getTopEventNames: async ({
		ctx,
		limit = 3,
	}: {
		ctx: AutumnContext;
		limit?: number;
	}): Promise<TopEventNameRow[]> => {
		const { analyticsDb, org, env } = ctx;

		// Query the continuous aggregate for top events in the last month
		const result = await analyticsDb.execute<{
			event_name: string;
			count: string;
		}>(
			sql.raw(`
			SELECT event_name, SUM(event_count)::bigint as count
			FROM events_hourly
			WHERE org_id = '${org.id}'
			  AND env = '${env}'
			  AND bucket >= NOW() - INTERVAL '1 month'
			GROUP BY event_name
			ORDER BY count DESC
			LIMIT ${limit}
		`),
		);

		return result.map((row) => ({
			event_name: row.event_name,
			count: Number(row.count),
		}));
	},

	/**
	 * Aggregates events using the events_hourly continuous aggregate.
	 * Falls back to raw events table if continuous aggregate doesn't exist.
	 *
	 * The continuous aggregate pre-computes hourly rollups by org_id, env, event_name, customer_id.
	 * For day/month buckets, we roll up the hourly data which is much faster than scanning raw events.
	 */
	aggregate: async ({
		ctx,
		eventNames,
		customerId,
		startDate,
		endDate,
		binSize,
	}: AggregateParams): Promise<AggregateRow[]> => {
		const { analyticsDb, org, env } = ctx;

		const startDateStr = startDate.toISOString();
		const endDateStr = endDate.toISOString();
		const eventNamesArray = `{${eventNames.join(",")}}`;

		// Map binSize to PostgreSQL interval for time_bucket
		const intervalMap = { hour: "1 hour", day: "1 day", month: "1 month" };
		const bucketInterval = intervalMap[binSize];

		const customerFilter = customerId
			? `AND customer_id = '${customerId}'`
			: "";

		// Query the continuous aggregate (events_hourly) and roll up to desired bucket size
		// This is much faster than querying raw events because:
		// 1. Data is pre-aggregated by hour
		// 2. We just SUM the pre-computed counts/sums
		// 3. Indexes on org_id, env, bucket make filtering fast
		const result = await analyticsDb.execute<{
			period: Date;
			event_name: string;
			count: string;
			sum: string | null;
		}>(
			sql.raw(`
			SELECT 
				time_bucket('${bucketInterval}', bucket) as period,
				event_name,
				SUM(event_count)::bigint as count,
				SUM(value_sum) as sum
			FROM events_hourly
			WHERE org_id = '${org.id}'
			  AND env = '${env}'
			  AND bucket >= '${startDateStr}'::timestamptz
			  AND bucket <= '${endDateStr}'::timestamptz
			  AND event_name = ANY('${eventNamesArray}'::text[])
			  ${customerFilter}
			GROUP BY period, event_name
			ORDER BY period
		`),
		);

		return result.map((row) => ({
			period: new Date(row.period),
			event_name: row.event_name,
			count: Number(row.count),
			sum: Number(row.sum ?? 0),
		}));
	},

	getRawEvents: async ({
		ctx,
		customerId,
		startDate,
		endDate,
		limit = 10000,
	}: GetRawEventsParams): Promise<RawEventRow[]> => {
		const { analyticsDb, org, env } = ctx;

		const startDateStr = startDate.toISOString();
		const endDateStr = endDate.toISOString();
		const customerFilter = customerId
			? `AND customer_id = '${customerId}'`
			: "";

		const result = await analyticsDb.execute<{
			id: string;
			customer_id: string;
			event_name: string;
			timestamp: Date;
			value: string;
			properties: Record<string, unknown> | null;
			idempotency_key: string | null;
		}>(
			sql.raw(`
			SELECT 
				id,
				customer_id,
				event_name,
				timestamp,
				value,
				properties,
				idempotency_key
			FROM events
			WHERE org_id = '${org.id}'
			  AND env = '${env}'
			  AND timestamp >= '${startDateStr}'::timestamptz
			  AND timestamp < '${endDateStr}'::timestamptz
			  ${customerFilter}
			ORDER BY timestamp DESC
			LIMIT ${limit}
		`),
		);

		return result.map((row) => ({
			id: row.id,
			customer_id: row.customer_id,
			event_name: row.event_name,
			timestamp: new Date(row.timestamp),
			value: Number(row.value),
			// Stringify properties for frontend display compatibility
			properties: row.properties ? JSON.stringify(row.properties) : null,
			idempotency_key: row.idempotency_key,
		}));
	},
};
