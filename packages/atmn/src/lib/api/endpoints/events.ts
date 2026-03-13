import { request } from "../client.js";

/**
 * Events API endpoints
 */

/**
 * Event item from the API response
 */
export interface ApiEventsListItem {
	id: string;
	timestamp: number;
	feature_id: string;
	customer_id: string;
	value: number;
	properties: Record<string, unknown>;
}

/**
 * Response from the events list endpoint
 */
export interface ApiEventsListResponse {
	list: ApiEventsListItem[];
	total: number;
	has_more: boolean;
	offset: number;
	limit: number;
}

/**
 * Options for fetching events
 */
export interface FetchEventsOptions {
	secretKey: string;
	customerId?: string;
	featureId?: string | string[];
	customRange?: { start?: number; end?: number };
	offset?: number;
	limit?: number;
}

/**
 * Bin size for aggregate time buckets
 */
export type AggregateBinSize = "hour" | "day" | "month";

/**
 * Range presets for external aggregate API
 */
export type AggregateRange = "24h" | "7d" | "30d" | "90d" | "last_cycle" | "1bc" | "3bc";

/**
 * Time bucket in aggregate response (flat - no group_by)
 */
export interface AggregateTimeBucket {
	period: number;
	[featureId: string]: number | Record<string, number>;
}

/**
 * Total stats for a feature
 */
export interface AggregateFeatureTotal {
	count: number;
	sum: number;
}

/**
 * Response from external aggregate endpoint /v1/events/aggregate
 */
export interface ApiEventsAggregateResponse {
	list: AggregateTimeBucket[];
	total: Record<string, AggregateFeatureTotal>;
}

/**
 * Options for fetching aggregated events (external API)
 * Requires customer_id and feature_id
 */
export interface FetchEventsAggregateOptions {
	secretKey: string;
	/** Customer ID (required) */
	customerId: string;
	/** Feature ID(s) to aggregate (required) */
	featureId: string | string[];
	/** Time range preset */
	range?: AggregateRange;
	/** Bin size for time buckets */
	binSize?: AggregateBinSize;
	/** Property to group by (must start with "properties.") */
	groupBy?: string;
	/** Custom time range (alternative to range) */
	customRange?: { start: number; end: number };
}

/**
 * Fetch events using POST with body params
 */
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

/**
 * Fetch aggregated events from the external API
 * Uses /v1/events/aggregate endpoint
 * Requires customer_id and feature_id
 */
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
