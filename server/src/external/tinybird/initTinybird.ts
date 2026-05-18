import { Tinybird } from "@chronark/zod-bird";
import { createAggregateGroupablePipe } from "./pipes/aggregateGroupablePipe.js";
import { createAggregatePipe } from "./pipes/aggregatePipe.js";
import { createAggregateSimplePipe } from "./pipes/aggregateSimplePipe.js";
import { createEstimatedMrrPipe } from "./pipes/estimatedMrrPipe.js";
import { createListEventNamesPipe } from "./pipes/listEventNamesPipe.js";
import { createListEventsPaginatedPipe } from "./pipes/listEventsPaginatedPipe.js";
import { tinybirdConfig } from "./tinybirdUtils.js";
import { z } from "./tinybirdZod.js";

/** Primary Tinybird client — reads (pipes) and primary writes (ingest). */
const tinybirdClient: Tinybird | null = tinybirdConfig
	? new Tinybird(tinybirdConfig)
	: null;

if (tinybirdConfig) {
	console.log(
		`[Tinybird] primary configured with URL: ${tinybirdConfig.baseUrl}`,
	);
}

/** Zod schema for TinybirdEvent (matches events.datasource) */
const TinybirdEventSchema = z.object({
	id: z.string(),
	org_id: z.string(),
	org_slug: z.string().nullable(),
	internal_customer_id: z.string().nullable(),
	env: z.string(),
	created_at: z.number().nullable(),
	timestamp: z.string(),
	event_name: z.string(),
	idempotency_key: z.string().nullable(),
	value: z.number().nullable(),
	set_usage: z.number().nullable(),
	entity_id: z.string().nullable(),
	internal_entity_id: z.string().nullable(),
	internal_product_id: z.string().nullable(),
	customer_id: z.string(),
	properties: z.string().nullable(),
	deductions: z.string().nullable(),
});

/** Pre-built pipe callers */
export const tinybirdPipes = tinybirdClient
	? {
			aggregate: createAggregatePipe(tinybirdClient),
			aggregateSimple: createAggregateSimplePipe(tinybirdClient),
			aggregateGroupable: createAggregateGroupablePipe(tinybirdClient),
			estimatedMrr: createEstimatedMrrPipe(tinybirdClient),
			listEventNames: createListEventNamesPipe(tinybirdClient),
			listEventsPaginated: createListEventsPaginatedPipe(tinybirdClient),
		}
	: null;

/** Pre-built ingest endpoint for events */
export const tinybirdIngest = tinybirdClient
	? {
			events: tinybirdClient.buildIngestEndpoint({
				datasource: "events",
				event: TinybirdEventSchema,
				wait: true,
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

// Re-export types
export type {
	AggregateGroupablePipeParams,
	AggregateGroupablePipeRow,
	AggregatePipeParams,
	AggregatePipeRow,
	AggregateSimplePipeParams,
	AggregateSimplePipeRow,
	EstimatedMrrPipeParams,
	EstimatedMrrPipeRow,
	ListEventNamesPipeParams,
	ListEventNamesPipeRow,
	ListEventsPaginatedPipeParams,
	ListEventsPaginatedPipeRow,
} from "./pipes/index.js";
