import {
	createClient,
	type QueryResult,
	Tinybird,
	type TinybirdErrorResponse,
} from "@tinybirdco/sdk";
import {
	type AggregateGroupablePipeParams,
	type AggregateGroupablePipeRow,
	type AggregatePipeParams,
	type AggregatePipeRow,
	type AggregateSimplePipeParams,
	type AggregateSimplePipeRow,
	type ListEventNamesPipeParams,
	type ListEventNamesPipeRow,
	type ListEventsPaginatedPipeParams,
	type ListEventsPaginatedPipeRow,
	type TinybirdEvent,
	tinybirdResources,
} from "./tinybirdResources.js";

const TINYBIRD_API_URL = process.env.TINYBIRD_API_URL;
const TINYBIRD_TOKEN = process.env.TINYBIRD_TOKEN;

const queryTinybirdPipe = async <TData>({
	pipe,
	params,
}: {
	pipe: string;
	params: Record<string, string | number | string[] | undefined>;
}): Promise<QueryResult<TData>> => {
	if (!TINYBIRD_API_URL || !TINYBIRD_TOKEN) {
		throw new Error("Tinybird is not configured");
	}

	const url = new URL(`/v0/pipes/${pipe}.json`, `${TINYBIRD_API_URL}/`);

	for (const [key, value] of Object.entries(params)) {
		if (value === undefined) {
			continue;
		}

		if (Array.isArray(value)) {
			url.searchParams.set(key, value.join(","));
			continue;
		}

		url.searchParams.set(key, String(value));
	}

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${TINYBIRD_TOKEN}`,
		},
		method: "GET",
	});

	if (!response.ok) {
		const errorBody = (await response
			.json()
			.catch(() => null)) as TinybirdErrorResponse | null;

		throw new Error(
			errorBody?.error ??
				`Tinybird query failed with status ${response.status}`,
		);
	}

	return (await response.json()) as QueryResult<TData>;
};

/** Tinybird REST API client singleton. Null if not configured. */
const tinybirdClient =
	TINYBIRD_API_URL && TINYBIRD_TOKEN
		? new Tinybird({
				...tinybirdResources,
				baseUrl: TINYBIRD_API_URL,
				token: TINYBIRD_TOKEN,
				devMode: false,
			})
		: null;

const tinybirdRawClient =
	TINYBIRD_API_URL && TINYBIRD_TOKEN
		? createClient({
				baseUrl: TINYBIRD_API_URL,
				token: TINYBIRD_TOKEN,
				devMode: false,
			})
		: null;

if (tinybirdClient) {
	console.log(`[Tinybird] Configured with URL: ${TINYBIRD_API_URL}`);
}

/** Pre-built pipe callers */
export const tinybirdPipes = tinybirdClient
	? {
			aggregate: (params: AggregatePipeParams) =>
				queryTinybirdPipe<AggregatePipeRow>({ pipe: "aggregate", params }),
			aggregateSimple: (params: AggregateSimplePipeParams) =>
				queryTinybirdPipe<AggregateSimplePipeRow>({
					pipe: "aggregate_simple",
					params,
				}),
			aggregateGroupable: (params: AggregateGroupablePipeParams) =>
				queryTinybirdPipe<AggregateGroupablePipeRow>({
					pipe: "aggregate_groupable",
					params,
				}),
			listEventNames: (params: ListEventNamesPipeParams) =>
				queryTinybirdPipe<ListEventNamesPipeRow>({
					pipe: "list_event_names",
					params,
				}),
			listEventsPaginated: (params: ListEventsPaginatedPipeParams) =>
				queryTinybirdPipe<ListEventsPaginatedPipeRow>({
					pipe: "list_events_paginated",
					params,
				}),
		}
	: null;

/** Pre-built ingest endpoint for events */
export const tinybirdIngest = tinybirdRawClient
	? {
			events: (events: TinybirdEvent[]) =>
				tinybirdRawClient.ingestBatch("events", events, {
					wait: true,
					maxRetries: 10,
				}),
		}
	: null;

/** Get Tinybird pipes, throws if not configured. */
export const getTinybirdPipes = () => {
	if (!tinybirdPipes) {
		throw new Error("Tinybird is not configured");
	}
	return tinybirdPipes;
};

/** Get Tinybird ingest endpoints, throws if not configured. */
export const getTinybirdIngest = () => {
	if (!tinybirdIngest) {
		throw new Error("Tinybird is not configured");
	}
	return tinybirdIngest;
};

/** Check if Tinybird is configured */
export const isTinybirdConfigured = (): boolean => {
	return tinybirdClient !== null;
};

// Re-export types
export type {
	AggregateGroupablePipeParams,
	AggregateGroupablePipeRow,
	AggregatePipeParams,
	AggregatePipeRow,
	AggregateSimplePipeParams,
	AggregateSimplePipeRow,
	ListEventNamesPipeParams,
	ListEventNamesPipeRow,
	ListEventsPaginatedPipeParams,
	ListEventsPaginatedPipeRow,
	TinybirdEvent,
} from "./tinybirdResources.js";
