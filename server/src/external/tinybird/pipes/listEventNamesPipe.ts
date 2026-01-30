import type { Tinybird } from "@chronark/zod-bird";
import { z } from "zod";

/** Response schema for the list_event_names pipe */
export const listEventNamesPipeResponseSchema = z.object({
	event_name: z.string(),
	event_count: z.number(),
});

export type ListEventNamesPipeRow = z.infer<
	typeof listEventNamesPipeResponseSchema
>;

/** Parameters schema for the list_event_names pipe */
export const listEventNamesPipeParamsSchema = z.object({
	org_id: z.string(),
	env: z.string(),
	limit: z.number().optional(),
});

export type ListEventNamesPipeParams = z.infer<
	typeof listEventNamesPipeParamsSchema
>;

/** Creates the list_event_names pipe caller */
export const createListEventNamesPipe = (tb: Tinybird) =>
	tb.buildPipe({
		pipe: "list_event_names",
		parameters: listEventNamesPipeParamsSchema,
		data: listEventNamesPipeResponseSchema,
	});
