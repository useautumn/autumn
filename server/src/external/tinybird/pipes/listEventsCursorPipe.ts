import type { Tinybird } from "@chronark/zod-bird";
import { z } from "../tinybirdZod.js";

/** Response schema for the list_events_cursor pipe */
export const listEventsCursorPipeResponseSchema = z.object({
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
	deductions: z.string().nullable().optional(),
});

export type ListEventsCursorPipeRow = z.infer<
	typeof listEventsCursorPipeResponseSchema
>;

/** Parameters schema for the list_events_cursor pipe */
export const listEventsCursorPipeParamsSchema = z.object({
	org_id: z.string(),
	env: z.string(),
	start_date: z.string().optional(),
	end_date: z.string().optional(),
	customer_id: z.string().optional(),
	entity_id: z.string().optional(),
	event_names: z.array(z.string()).optional(),
	limit: z.number().optional(),
	cursor_timestamp: z.string().optional(),
	cursor_id: z.string().optional(),
	filter_key_0: z.string().optional(),
	filter_value_0: z.string().optional(),
	filter_key_1: z.string().optional(),
	filter_value_1: z.string().optional(),
	filter_key_2: z.string().optional(),
	filter_value_2: z.string().optional(),
	filter_key_3: z.string().optional(),
	filter_value_3: z.string().optional(),
	filter_key_4: z.string().optional(),
	filter_value_4: z.string().optional(),
});

export type ListEventsCursorPipeParams = z.infer<
	typeof listEventsCursorPipeParamsSchema
>;

/** Creates the list_events_cursor pipe caller */
export const createListEventsCursorPipe = (tb: Tinybird) =>
	tb.buildPipe({
		pipe: "list_events_cursor",
		parameters: listEventsCursorPipeParamsSchema as any,
		data: listEventsCursorPipeResponseSchema as any,
	});
