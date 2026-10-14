import { request } from "../client.js";

export interface ApiEventsListItem {
	id: string;
	timestamp: number;
	feature_id: string;
	customer_id: string;
	value: number;
	properties: Record<string, unknown>;
}

export interface ApiEventsListResponse {
	list: ApiEventsListItem[];
	total: number;
	has_more: boolean;
	offset: number;
	limit: number;
}

export interface FetchEventsOptions {
	secretKey: string;
	customerId?: string;
	featureId?: string | string[];
	customRange?: { start?: number; end?: number };
	offset?: number;
	limit?: number;
}

export type AggregateBinSize = "hour" | "day" | "month";

export type AggregateRange = "24h" | "7d" | "30d" | "90d" | "last_cycle" | "1bc" | "3bc";

export interface AggregateTimeBucket {
	period: number;
	[featureId: string]: number | Record<string, number>;
}

export interface AggregateFeatureTotal {
	count: number;
	sum: number;
}

export interface ApiEventsAggregateResponse {
	list: AggregateTimeBucket[];
	total: Record<string, AggregateFeatureTotal>;
}

export interface FetchEventsAggregateOptions {
	secretKey: string;
	customerId: string;
	featureId: string | string[];
	range?: AggregateRange;
	binSize?: AggregateBinSize;
	groupBy?: string;
	customRange?: { start: number; end: number };
}

export async function fetchEvents(
	options: FetchEventsOptions,
): Promise<ApiEventsListResponse> {
	const {
		secretKey,
		customerId,
		featureId,
		customRange,
		offset,
		limit = 100,
	} = options;

	const body: Record<string, unknown> = {};

	if (customerId !== undefined) {
		body['customer_id'] = customerId;
	}

	if (featureId !== undefined) {
		body['feature_id'] = featureId;
	}

	if (customRange !== undefined) {
		body['custom_range'] = customRange;
	}

	if (offset !== undefined) {
		body['offset'] = offset;
	}

	if (limit !== undefined) {
		body['limit'] = limit;
	}

	return request<ApiEventsListResponse>({
		method: "POST",
		path: "/v1/events/list",
		secretKey,
		body,
	});
}

export async function fetchEventsAggregate(
	options: FetchEventsAggregateOptions,
): Promise<ApiEventsAggregateResponse> {
	const {
		secretKey,
		customerId,
		featureId,
		range,
		binSize,
		groupBy,
		customRange,
	} = options;

	const body: Record<string, unknown> = {
		customer_id: customerId,
		feature_id: featureId,
	};

	if (range !== undefined) {
		body['range'] = range;
	}

	if (binSize !== undefined) {
		body['bin_size'] = binSize;
	}

	if (groupBy !== undefined && groupBy !== "") {
		body['group_by'] = groupBy;
	}

	if (customRange !== undefined) {
		body['custom_range'] = customRange;
	}

	return request<ApiEventsAggregateResponse>({
		method: "POST",
		path: "/v1/events/aggregate",
		secretKey,
		body,
	});
}
