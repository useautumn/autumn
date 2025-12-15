import type {
	ClickHouseResult,
	EventLog,
	EventLogQuery,
	RawEventFromClickHouse,
} from "@autumn/shared";
import { ErrCode, RecaseError } from "@autumn/shared";
import {
	type DecodedCursorV1,
	decodeCursor,
	encodeCursor,
} from "@autumn/shared/utils/cursorUtils";
import type { ClickHouseClient } from "@clickhouse/client";
import { StatusCodes } from "http-status-codes";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export class EventLogService {
	private static transformRawEvents(
		rawEvents: RawEventFromClickHouse[],
	): EventLog[] {
		return rawEvents.map((event) => {
			let properties = {};
			if (event.properties) {
				try {
					properties = JSON.parse(event.properties);
				} catch {
					// Invalid JSON, use empty object
				}
			}

			return {
				id: event.id,
				timestamp:
					event.timestamp instanceof Date
						? event.timestamp.getTime()
						: typeof event.timestamp === "string"
							? new Date(event.timestamp).getTime()
							: Date.now(),
				event_name: event.event_name,
				customer_id: event.customer_id,
				value: event.value ?? 0,
				properties,
			};
		});
	}

	private static buildWhereConditions({
		customerId,
		eventNames,
		startDate,
		endDate,
		cursor,
	}: {
		customerId?: string;
		eventNames?: string[];
		startDate?: number;
		endDate?: number;
		cursor: DecodedCursorV1 | null;
	}): string {
		const conditions: string[] = [];

		if (customerId) {
			conditions.push("customer_id = {customer_id:String}");
		}

		if (eventNames && eventNames.length > 0) {
			conditions.push("event_name IN {event_names:Array(String)}");
		}

		if (startDate) {
			conditions.push(
				"timestamp >= fromUnixTimestamp64Milli({start_date:Int64})",
			);
		}

		if (endDate) {
			conditions.push(
				"timestamp <= fromUnixTimestamp64Milli({end_date:Int64})",
			);
		}

		if (cursor) {
			conditions.push(
				"(timestamp, id) < (fromUnixTimestamp64Milli({cursor_timestamp:Int64}), {cursor_id:String})",
			);
		}

		return conditions.length > 0 ? `and ${conditions.join(" and ")}` : "";
	}

	private static buildQueryParams({
		orgId,
		env,
		customerId,
		eventNames,
		startDate,
		endDate,
		cursor,
		limit,
	}: {
		orgId: string | undefined;
		env: string;
		customerId?: string;
		eventNames?: string[];
		startDate?: number;
		endDate?: number;
		cursor: DecodedCursorV1 | null;
		limit: number;
	}): Record<string, unknown> {
		const params: Record<string, unknown> = {
			org_id: orgId,
			env,
			limit: limit + 1,
		};

		if (customerId) {
			params.customer_id = customerId;
		}

		if (eventNames && eventNames.length > 0) {
			params.event_names = eventNames;
		}

		if (startDate) {
			params.start_date = startDate;
		}

		if (endDate) {
			params.end_date = endDate;
		}

		if (cursor) {
			params.cursor_timestamp = cursor.timestamp;
			params.cursor_id = cursor.id;
		}

		return params;
	}

	static async getEvents({
		ctx,
		params,
	}: {
		ctx: AutumnContext;
		params: EventLogQuery;
	}) {
		const { clickhouseClient, org, env } = ctx;
		const { starting_after, limit, customer_id, feature_id, time_range } =
			params;

		let cursor: DecodedCursorV1 | null = null;
		if (starting_after) {
			try {
				cursor = decodeCursor(starting_after);
			} catch (_error) {
				throw new RecaseError({
					message: "Invalid cursor format",
					code: ErrCode.InvalidInputs,
					statusCode: StatusCodes.BAD_REQUEST,
				});
			}
		}

		const eventNames = feature_id
			? Array.isArray(feature_id)
				? feature_id
				: [feature_id]
			: undefined;

		const whereClause = EventLogService.buildWhereConditions({
			customerId: customer_id,
			eventNames,
			startDate: time_range?.start,
			endDate: time_range?.end,
			cursor,
		});

		const query = `
select
    id,
    timestamp,
    event_name,
    customer_id,
    value,
    properties
from events
where org_id = {org_id:String}
  and env = {env:String}
  and set_usage = false
  ${whereClause}
order by timestamp desc, id desc
limit {limit:UInt32};
`;

		const queryParams = EventLogService.buildQueryParams({
			orgId: org?.id,
			env,
			customerId: customer_id,
			eventNames,
			startDate: time_range?.start,
			endDate: time_range?.end,
			cursor,
			limit,
		});

		const result = await (clickhouseClient as ClickHouseClient).query({
			query,
			query_params: queryParams,
			format: "JSON",
		});

		const resultJson =
			(await result.json()) as ClickHouseResult<RawEventFromClickHouse>;
		const rawEvents = resultJson.data;

		const events = EventLogService.transformRawEvents(rawEvents);

		const hasMore = events.length > limit;
		const list = hasMore ? events.slice(0, limit) : events;

		const lastEvent = list[list.length - 1];
		const hasNextCursor = hasMore && lastEvent;
		const nextCursor = hasNextCursor
			? encodeCursor({
					timestamp: hasNextCursor.timestamp,
					id: hasNextCursor.id,
				})
			: null;

		return {
			list,
			has_more: hasMore,
			next_cursor: nextCursor,
		};
	}
}
