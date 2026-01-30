import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { eventActions } from "../actions/index.js";
import { AnalyticsService } from "../AnalyticsService.js";

const ListEventNamesSchema = z.object({
	limit: z.number().optional(),
});

/**
 * List all distinct event names for the org sorted by popularity
 */
export const handleListEventNames = createRoute({
	query: ListEventNamesSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { limit } = c.req.valid("query");

		AnalyticsService.handleEarlyExit();

		const eventNames = await eventActions.listEventNames({
			ctx,
			limit,
		});

		return c.json({
			eventNames,
		});
	},
});
