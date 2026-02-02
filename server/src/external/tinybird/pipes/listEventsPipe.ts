import type { Tinybird } from "@chronark/zod-bird";
import { z } from "zod";

/** Response schema for the list_events pipe */
export const listEventsPipeResponseSchema = z.object({
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

export type ListEventsPipeRow = z.infer<typeof listEventsPipeResponseSchema>;

/** Parameters schema for the list_events pipe */
export const listEventsPipeParamsSchema = z.object({
	org_id: z.string(),
	env: z.string(),
	start_date: z.string(),
	end_date: z.string(),
	customer_id: z.string().optional(),
	event_name: z.string().optional(),
	limit: z.number().optional(),
	cursor_timestamp: z.string().optional(),
	cursor_id: z.string().optional(),
});

export type ListEventsPipeParams = z.infer<typeof listEventsPipeParamsSchema>;

/** Creates the list_events pipe caller */
export const createListEventsPipe = (tb: Tinybird) =>
	tb.buildPipe({
		pipe: "list_events",
		parameters: listEventsPipeParamsSchema,
		data: listEventsPipeResponseSchema,
	});
