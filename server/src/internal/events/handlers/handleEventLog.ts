import type { EventLogResponse } from "@autumn/shared";
import { EventLogQuerySchema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { EventLogService } from "../EventLogService";

export const handleEventLog = createRoute({
	body: EventLogQuerySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const bodyParams = c.req.valid("json");

		const result = await EventLogService.getEvents({
			ctx,
			params: bodyParams,
		});

		return c.json<EventLogResponse>(result);
	},
});
