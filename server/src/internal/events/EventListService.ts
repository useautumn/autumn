import type {
	ApiEventsListItem,
	ApiEventsListParams,
	ClickHouseResult,
	RawEventFromClickHouse,
} from "@autumn/shared";
import type { ClickHouseClient } from "@clickhouse/client";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export class EventListService {
	private static transformRawEvents(
		rawEvents: RawEventFromClickHouse[],
	): ApiEventsListItem[] {
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
				feature_id: event.event_name,
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
	}: {
		customerId?: string;
		eventNames?: string[];
		startDate?: number;
		endDate?: number;
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

		return conditions.length > 0 ? `and ${conditions.join(" and ")}` : "";
	}

	private static buildQueryParams({
		orgId,
		env,
		customerId,
		eventNames,
		startDate,
		endDate,
		offset,
		limit,
	}: {
		orgId: string | undefined;
		env: string;
		customerId?: string;
		eventNames?: string[];
		startDate?: number;
		endDate?: number;
		offset: number;
		limit: number;
	}): Record<string, unknown> {
		const params: Record<string, unknown> = {
			org_id: orgId,
			env,
			limit: limit + 1,
			offset,
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

		return params;
	}

	static async getEvents({
		ctx,
		params,
	}: {
		ctx: AutumnContext;
		params: ApiEventsListParams;
	}) {
		const { clickhouseClient, org, env } = ctx;
		const { offset, limit, customer_id, feature_id, custom_range } = params;

		const eventNames = feature_id
			? Array.isArray(feature_id)
				? feature_id
				: [feature_id]
			: undefined;

		const whereClause = EventListService.buildWhereConditions({
			customerId: customer_id,
			eventNames,
			startDate: custom_range?.start,
			endDate: custom_range?.end,
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
limit {limit:UInt32}
offset {offset:UInt32};
`;

		const queryParams = EventListService.buildQueryParams({
			orgId: org?.id,
			env,
			customerId: customer_id,
			eventNames,
			startDate: custom_range?.start,
			endDate: custom_range?.end,
			offset,
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

		const events = EventListService.transformRawEvents(rawEvents);

		const hasMore = events.length > limit;
		const list = hasMore ? events.slice(0, limit) : events;

		return {
			list,
			has_more: hasMore,
			total: events.length,
			offset,
			limit,
		};
	}
}
