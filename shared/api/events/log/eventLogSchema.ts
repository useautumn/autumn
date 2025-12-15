import { z } from "zod/v4";
import {
	CursorPaginationQuerySchema,
	createCursorPaginatedResponseSchema,
} from "../../common/cursorPaginationSchemas";

export const EventLogQuerySchema = CursorPaginationQuerySchema.extend({
	customer_id: z.string().optional().describe("Filter events by customer ID"),
	feature_id: z
		.string()
		.min(1)
		.or(z.array(z.string().min(1)))
		.optional()
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

export type EventLogQuery = z.infer<typeof EventLogQuerySchema>;

export const EventLogSchema = z.object({
	id: z.string().describe("Event ID (KSUID)"),
	timestamp: z.number().describe("Event timestamp (epoch milliseconds)"),
	event_name: z.string().describe("Name of the event"),
	customer_id: z.string().describe("Customer identifier"),
	value: z.number().describe("Event value/count"),
	properties: z.object({}).describe("Event properties (JSONB)"),
});

export type EventLog = z.infer<typeof EventLogSchema>;

export const EventLogResponseSchema =
	createCursorPaginatedResponseSchema(EventLogSchema);

export type EventLogResponse = z.infer<typeof EventLogResponseSchema>;
