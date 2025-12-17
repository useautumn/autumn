import { z } from "zod/v4";
import {
	CursorPaginationQuerySchema,
	createCursorPaginatedResponseSchema,
} from "../../common/cursorPaginationSchemas";

export const EventListQuerySchema = CursorPaginationQuerySchema.extend({
	customer_id: z.string().describe("Filter events by customer ID"),
	feature_id: z
		.string()
		.min(1)
		.or(z.array(z.string().min(1)))
		.describe("Filter by specific feature ID(s)"),
	time_range: z
		.object({
			start: z.coerce
				.number()
				.optional()
				.describe("Filter events after this timestamp (epoch milliseconds)"),
			end: z.coerce
				.number()
				.optional()
				.describe("Filter events before this timestamp (epoch milliseconds)"),
		})
		.optional()
		.describe("Filter events by time range"),
});

export type EventListQuery = z.infer<typeof EventListQuerySchema>;

export const EventListSchema = z.object({
	id: z.string().describe("Event ID (KSUID)"),
	timestamp: z.number().describe("Event timestamp (epoch milliseconds)"),
	event_name: z.string().describe("Name of the event"),
	customer_id: z.string().describe("Customer identifier"),
	value: z.number().describe("Event value/count"),
	properties: z.object({}).describe("Event properties (JSONB)"),
});

export type EventList = z.infer<typeof EventListSchema>;

export const EventListResponseSchema =
	createCursorPaginatedResponseSchema(EventListSchema);

export type EventListResponse = z.infer<typeof EventListResponseSchema>;
