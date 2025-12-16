import type { EventListResponse } from "@autumn/shared";
import { EventListQuerySchema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { EventListService } from "../EventListService";

export const handleEventList = createRoute({
	body: EventListQuerySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const bodyParams = c.req.valid("json");

		const result = await EventListService.getEvents({
			ctx,
			params: bodyParams,
		});

		return c.json<EventListResponse>(result);
	},
});
