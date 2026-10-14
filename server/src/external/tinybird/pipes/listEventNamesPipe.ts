import type { Tinybird } from "@chronark/zod-bird";
import { z } from "../tinybirdZod.js";

export const listEventNamesPipeResponseSchema = z.object({
	event_name: z.string(),
	event_count: z.number(),
});

export type ListEventNamesPipeRow = z.infer<
	typeof listEventNamesPipeResponseSchema
>;

export const listEventNamesPipeParamsSchema = z.object({
	org_id: z.string(),
	env: z.string(),
	customer_id: z.string().optional(),
	entity_id: z.string().optional(),
	limit: z.number().optional(),
	start_date: z.string().optional(),
	end_date: z.string().optional(),
});

export type ListEventNamesPipeParams = z.infer<
	typeof listEventNamesPipeParamsSchema
>;

export const createListEventNamesPipe = (tb: Tinybird) =>
	tb.buildPipe({
		pipe: "list_event_names",
		parameters: listEventNamesPipeParamsSchema as any,
		data: listEventNamesPipeResponseSchema as any,
	});
