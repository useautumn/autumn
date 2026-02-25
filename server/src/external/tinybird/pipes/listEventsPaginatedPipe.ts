import type { Tinybird } from "@chronark/zod-bird";
import { z } from "zod";

/** Response schema for the list_events_paginated pipe */
export const listEventsPaginatedPipeResponseSchema = z.object({
	id: z.string(),
	org_id: z.string(),
	env: z.string(),
	customer_id: z.string(),
	event_name: z.string(),
	timestamp: z.string(),
	value: z.number().nullable(),
	properties: z.string().nullable(),
	idempotency_key: z.string().nullable(),
	entity_id: z.string().nullable(),
});

export type ListEventsPaginatedPipeRow = z.infer<
	typeof listEventsPaginatedPipeResponseSchema
>;

/** Parameters schema for the list_events_paginated pipe */
export const listEventsPaginatedPipeParamsSchema = z.object({
	org_id: z.string(),
	env: z.string(),
	start_date: z.string().optional(),
	end_date: z.string().optional(),
	customer_id: z.string().optional(),
	event_names: z.array(z.string()).optional(),
	limit: z.number().optional(),
	offset: z.number().optional(),
});

export type ListEventsPaginatedPipeParams = z.infer<
	typeof listEventsPaginatedPipeParamsSchema
>;

/** Creates the list_events_paginated pipe caller */
export const createListEventsPaginatedPipe = (tb: Tinybird) =>
	tb.buildPipe({
		pipe: "list_events_paginated",
		parameters: listEventsPaginatedPipeParamsSchema,
		data: listEventsPaginatedPipeResponseSchema,
	});
