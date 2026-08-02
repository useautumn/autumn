import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { isSubscribedToEvents } from "@/external/svix/subscriptions/index.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

const GetWebhookSubscriptionsQuerySchema = z.object({
	// qs (with comma:true) parses `?event_types=a,b` as ["a","b"] and `?event_types=a` as "a".
	event_types: z.union([z.string(), z.array(z.string())]).optional(),
});

/** Which of the requested event types the org has an endpoint listening for. */
export const handleGetWebhookSubscriptions = createRoute({
	scopes: [Scopes.Organisation.Read],
	query: GetWebhookSubscriptionsQuerySchema,
	handler: async (c) => {
		const { env, org } = c.get("ctx");
		const { event_types } = c.req.valid("query");

		const eventTypes = (
			Array.isArray(event_types) ? event_types : [event_types ?? ""]
		)
			.map((eventType) => eventType.trim())
			.filter(Boolean);

		if (eventTypes.length === 0)
			return c.json({ subscribed_event_types: [] as string[] });

		return c.json({
			subscribed_event_types: await isSubscribedToEvents({
				org,
				env,
				eventTypes,
			}),
		});
	},
});
