import { type Feature, FeatureType } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { queryWithCache } from "@/utils/cacheUtils/queryWithCache.js";
import { eventActions } from "../actions/index.js";

/** Get top event names for the organization */
export const handleGetEventNames = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, features } = ctx;

		const topNames = await queryWithCache({
			ttl: 3600,
			key: `top_events:${org.id}_${env}`,
			fn: async () => {
				const { eventNames } = await eventActions.getTopEventNames({ ctx });
				return eventNames;
			},
		});

		const featureIds: string[] = [];
		const eventNames: string[] = [];

		for (const name of topNames.slice(0, 3)) {
			const isMeteredEventName = features.some(
				(f: Feature) =>
					f.type === FeatureType.Metered && f.event_names?.includes(name),
			);

			if (isMeteredEventName) {
				eventNames.push(name);
			} else if (features.some((f: Feature) => f.id === name)) {
				featureIds.push(name);
			}
		}

		return c.json({ featureIds, eventNames });
	},
});
