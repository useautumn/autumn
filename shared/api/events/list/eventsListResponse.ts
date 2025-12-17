import { createCursorPaginatedResponseSchema } from "@api/common/cursorPaginationSchemas";
import { z } from "zod/v4";

export const EVENTS_LIST_EXAMPLE = {
	list: [
		{
			id: "evt_36xpk2TmuQX5zVPPQ8tCtnR5Weg",
			timestamp: 1765958215459,
			feature_id: "credits",
			customer_id: "0pCIbS4AMAFDB1iBMNhARWZt2gDtVwQx",
			value: 30,
			properties: {},
		},
		{
			id: "evt_36xmHxxjAkqxufDf9yHAPNfRrLM",
			timestamp: 1765956512057,
			feature_id: "credits",
			customer_id: "0pCIbS4AMAFDB1iBMNhARWZt2gDtVwQx",
			value: 49,
			properties: {},
		},
	],
	has_more: true,
	next_cursor:
		"MXwxNzY1NzM3MTYzNzg3fGV2dF8zNnFiaDJMeWRFUW5QS0dOVVlvT2R4endhUTE",
};

export const ApiEventsListItemSchema = z.object({
	id: z.string().describe("Event ID (KSUID)"),
	timestamp: z.number().describe("Event timestamp (epoch milliseconds)"),

	feature_id: z
		.string()
		.describe("ID of the feature that the event belongs to"),

	customer_id: z.string().describe("Customer identifier"),
	value: z.number().describe("Event value/count"),
	properties: z.object({}).describe("Event properties (JSONB)"),
});

export const ApiEventsListResponseSchema = createCursorPaginatedResponseSchema(
	ApiEventsListItemSchema,
);

export type ApiEventsListItem = z.infer<typeof ApiEventsListItemSchema>;
export type ApiEventsListResponse = z.infer<typeof ApiEventsListResponseSchema>;
