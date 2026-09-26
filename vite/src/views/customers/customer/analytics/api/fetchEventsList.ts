import type {
	ApiEventsListItem,
	CursorPaginatedResponse,
	RawEventFromClickHouse,
} from "@autumn/shared";
import type { AxiosInstance } from "axios";
import { monthRangeWindow } from "../utils/monthRangeWindow";

/** Default page size, matching the row cap the tables were built around. */
export const EVENTS_LIST_PAGE_SIZE = 1000;

/** Keeps list consumers on the raw-event row shape they already render. */
const listItemToRawEvent = (
	item: ApiEventsListItem,
): RawEventFromClickHouse => ({
	id: item.id,
	timestamp: new Date(item.timestamp).toISOString(),
	event_name: item.feature_id,
	customer_id: item.customer_id,
	value: item.value,
	properties: JSON.stringify(item.properties ?? {}),
});

/** Callers pass an axios instance pinned to LATEST_VERSION for cursor paging. */
export const fetchEventsList = async ({
	axiosInstance,
	customerId,
	entityId,
	featureIds,
	interval,
	binSize = "day",
	customRange,
	limit = EVENTS_LIST_PAGE_SIZE,
	startCursor,
}: {
	axiosInstance: AxiosInstance;
	customerId?: string | null;
	entityId?: string | null;
	featureIds?: string[];
	interval: string;
	binSize?: string;
	customRange?: { start: number; end: number };
	limit?: number;
	startCursor?: string;
}): Promise<{
	events: RawEventFromClickHouse[];
	nextCursor: string | null;
}> => {
	const window = customRange ?? monthRangeWindow({ interval, binSize });
	const { data } = await axiosInstance.post<
		CursorPaginatedResponse<ApiEventsListItem>
	>("/v1/events.list", {
		customer_id: customerId || undefined,
		entity_id: entityId || undefined,
		feature_id: featureIds?.length ? featureIds : undefined,
		...(window ? { custom_range: window } : { range: interval }),
		limit,
		start_cursor: startCursor,
	});

	return {
		events: data.list.map(listItemToRawEvent),
		nextCursor: data.next_cursor,
	};
};
