import { Tinybird } from "@chronark/zod-bird";
import { z } from "zod"; // zod-bird requires zod v3, not zod/v4
import { createAggregateFastPipe } from "./pipes/aggregateFastPipe.js";
import { createAggregatePipe } from "./pipes/aggregatePipe.js";
import { createListEventsPipe } from "./pipes/listEventsPipe.js";

const TINYBIRD_URL = process.env.TINYBIRD_URL;
const TINYBIRD_TOKEN = process.env.TINYBIRD_TOKEN;

// Debug: log config on startup
if (TINYBIRD_URL && TINYBIRD_TOKEN) {
	console.log(`[Tinybird] Configured with URL: ${TINYBIRD_URL}`);
	console.log(`[Tinybird] Token prefix: ${TINYBIRD_TOKEN.substring(0, 10)}...`);
}

/** Tinybird REST API client singleton. Null if not configured. */
const tinybirdClient: Tinybird | null =
	TINYBIRD_URL && TINYBIRD_TOKEN
		? new Tinybird({
				baseUrl: TINYBIRD_URL,
				token: TINYBIRD_TOKEN,
			})
		: null;

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
	customer_id: z.string(),
	properties: z.string().nullable(),
});

/** Pre-built pipe callers */
export const tinybirdPipes = tinybirdClient
	? {
			aggregate: createAggregatePipe(tinybirdClient),
			aggregateFast: createAggregateFastPipe(tinybirdClient),
			listEvents: createListEventsPipe(tinybirdClient),
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
	AggregateFastPipeParams,
	AggregateFastPipeRow,
	AggregatePipeParams,
	AggregatePipeRow,
	ListEventsPipeParams,
	ListEventsPipeRow,
} from "./pipes/index.js";
