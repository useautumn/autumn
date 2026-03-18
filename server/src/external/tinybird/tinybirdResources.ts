import {
	defineDatasource,
	defineEndpoint,
	defineProject,
	engine,
	type InferOutputRow,
	type InferParams,
	type InferRow,
	node,
	p,
	t,
} from "@tinybirdco/sdk";
import {
	tinybirdDatasourceDefinitions,
	tinybirdPipeDefinitions,
} from "./tinybirdDatafiles.js";

type TinybirdBinSize = "hour" | "day" | "month";
type PipeParams<T> = InferParams<T>;
type PipeRow<T> = InferOutputRow<T>;

export const eventsDatasource = defineDatasource("events", {
	description: tinybirdDatasourceDefinitions.events.description,
	schema: {
		id: t.string().jsonPath("$.id"),
		org_id: t.string().jsonPath("$.org_id"),
		org_slug: t.string().nullable().jsonPath("$.org_slug"),
		internal_customer_id: t
			.string()
			.nullable()
			.jsonPath("$.internal_customer_id"),
		env: t.string().jsonPath("$.env"),
		created_at: t.int64().nullable().jsonPath("$.created_at"),
		timestamp: t.dateTime64(6).jsonPath("$.timestamp"),
		event_name: t.string().jsonPath("$.event_name"),
		idempotency_key: t.string().nullable().jsonPath("$.idempotency_key"),
		value: t.decimal(38, 19).nullable().jsonPath("$.value"),
		set_usage: t.uint8().nullable().jsonPath("$.set_usage"),
		entity_id: t.string().nullable().jsonPath("$.entity_id"),
		internal_entity_id: t.string().nullable().jsonPath("$.internal_entity_id"),
		customer_id: t.string().jsonPath("$.customer_id"),
		properties: t
			.json<Record<string, unknown> | null>()
			.jsonPath("$.properties"),
	},
	engine: engine.mergeTree({
		partitionKey: "toYYYYMM(timestamp)",
		sortingKey: ["org_id", "env", "customer_id", "event_name", "timestamp"],
	}),
});

export type TinybirdEvent = InferRow<typeof eventsDatasource>;

export const aggregatePipe = defineEndpoint("aggregate", {
	description: tinybirdPipeDefinitions.aggregate.description,
	params: {
		org_id: p.string(),
		env: p.string(),
		event_names: p.array(p.string()),
		start_date: p.dateTime(),
		end_date: p.dateTime(),
		bin_size: p.string(),
		timezone: p.string(),
		customer_id: p.string().optional(),
		group_by: p.string().optional(),
	},
	nodes: [
		node({
			name: "filter_events",
			sql: tinybirdPipeDefinitions.aggregate.nodes.filter_events,
		}),
		node({
			name: "aggregate_by_period",
			sql: tinybirdPipeDefinitions.aggregate.nodes.aggregate_by_period,
		}),
	],
	output: {
		period: t.dateTime(),
		event_name: t.string(),
		group_value: t.string(),
		total_value: t.float64(),
	},
});

export type AggregatePipeParams = Omit<
	PipeParams<typeof aggregatePipe>,
	"bin_size"
> & {
	bin_size: TinybirdBinSize;
};

export type AggregatePipeRow = PipeRow<typeof aggregatePipe>;

export const aggregateSimplePipe = defineEndpoint("aggregate_simple", {
	description: tinybirdPipeDefinitions.aggregateSimple.description,
	params: {
		org_id: p.string(),
		env: p.string(),
		event_names: p.array(p.string()),
		start_date: p.dateTime(),
		end_date: p.dateTime(),
		bin_size: p.string(),
		timezone: p.string(),
		customer_id: p.string().optional(),
	},
	nodes: [
		node({
			name: "endpoint",
			sql: tinybirdPipeDefinitions.aggregateSimple.nodes.endpoint,
		}),
	],
	output: {
		period: t.dateTime(),
		event_name: t.string(),
		total_value: t.float64(),
	},
});

export type AggregateSimplePipeParams = Omit<
	PipeParams<typeof aggregateSimplePipe>,
	"bin_size"
> & {
	bin_size: TinybirdBinSize;
};

export type AggregateSimplePipeRow = PipeRow<typeof aggregateSimplePipe>;

export const aggregateGroupablePipe = defineEndpoint("aggregate_groupable", {
	description: tinybirdPipeDefinitions.aggregateGroupable.description,
	params: {
		org_id: p.string(),
		env: p.string(),
		event_names: p.array(p.string()),
		start_date: p.dateTime(),
		end_date: p.dateTime(),
		bin_size: p.string(),
		timezone: p.string(),
		customer_id: p.string().optional(),
		group_column: p.string().optional("property"),
		property_key: p.string().optional(),
	},
	nodes: [
		node({
			name: "base",
			sql: tinybirdPipeDefinitions.aggregateGroupable.nodes.base,
		}),
		node({
			name: "ranked",
			sql: tinybirdPipeDefinitions.aggregateGroupable.nodes.ranked,
		}),
		node({
			name: "endpoint",
			sql: tinybirdPipeDefinitions.aggregateGroupable.nodes.endpoint,
		}),
	],
	output: {
		period: t.dateTime(),
		event_name: t.string(),
		group_value: t.string(),
		total_value: t.float64(),
		_truncated: t.bool(),
	},
});

export type AggregateGroupablePipeParams = Omit<
	PipeParams<typeof aggregateGroupablePipe>,
	"bin_size" | "group_column"
> & {
	bin_size: TinybirdBinSize;
	group_column?: "property" | "customer_id";
};

export type AggregateGroupablePipeRow = PipeRow<typeof aggregateGroupablePipe>;

export const listEventNamesPipe = defineEndpoint("list_event_names", {
	description: tinybirdPipeDefinitions.listEventNames.description,
	params: {
		org_id: p.string(),
		env: p.string(),
		limit: p.int32().optional(),
	},
	nodes: [
		node({
			name: "endpoint",
			sql: tinybirdPipeDefinitions.listEventNames.nodes.endpoint,
		}),
	],
	output: {
		event_name: t.string(),
		event_count: t.uint64(),
	},
});

export type ListEventNamesPipeParams = PipeParams<typeof listEventNamesPipe>;

export type ListEventNamesPipeRow = PipeRow<typeof listEventNamesPipe>;

export const listEventsPaginatedPipe = defineEndpoint("list_events_paginated", {
	description: tinybirdPipeDefinitions.listEventsPaginated.description,
	params: {
		org_id: p.string(),
		env: p.string(),
		start_date: p.dateTime64().optional(),
		end_date: p.dateTime64().optional(),
		customer_id: p.string().optional(),
		event_names: p.array(p.string()).optional(),
		limit: p.int32().optional(),
		offset: p.int32().optional(),
	},
	nodes: [
		node({
			name: "endpoint",
			sql: tinybirdPipeDefinitions.listEventsPaginated.nodes.endpoint,
		}),
	],
	output: {
		id: t.string(),
		org_id: t.string(),
		env: t.string(),
		customer_id: t.string(),
		event_name: t.string(),
		timestamp: t.dateTime64(6),
		value: t.decimal(38, 19).nullable(),
		properties: t.string().nullable(),
		idempotency_key: t.string().nullable(),
		entity_id: t.string().nullable(),
	},
});

export type ListEventsPaginatedPipeParams = PipeParams<
	typeof listEventsPaginatedPipe
>;

export type ListEventsPaginatedPipeRow = PipeRow<
	typeof listEventsPaginatedPipe
>;

export const tinybirdResources = {
	datasources: {
		events: eventsDatasource,
	},
	pipes: {
		aggregate: aggregatePipe,
		aggregateSimple: aggregateSimplePipe,
		aggregateGroupable: aggregateGroupablePipe,
		listEventNames: listEventNamesPipe,
		listEventsPaginated: listEventsPaginatedPipe,
	},
} as const;

export const tinybirdProject = defineProject(tinybirdResources);
