import { type Feature, FeatureType } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { queryWithCache } from "@/utils/cacheUtils/queryWithCache.js";
import { AnalyticsService } from "../AnalyticsService.js";

/**
 * Get top event names for the organization
 */
export const handleGetEventNames = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, features } = ctx;

		AnalyticsService.handleEarlyExit();

		const result = await queryWithCache({
			ttl: 3600,
			key: `top_events:${org.id}_${env}`,
			fn: async () => {
				const res = await AnalyticsService.getTopEventNames({
					ctx,
				});

				return res?.eventNames;
			},
		});

		const featureIds: string[] = [];
		const eventNames: string[] = [];

		for (let i = 0; i < result.length; i++) {
			// Is an event name
			if (
				features.some(
					(feature: Feature) =>
						feature.type === FeatureType.Metered &&
						feature.event_names &&
						feature.event_names.includes(result[i]),
				)
			) {
				eventNames.push(result[i]);
			} else if (
				features.some((feature: Feature) => feature.id === result[i])
			) {
				featureIds.push(result[i]);
			}

			if (i >= 2) break;
		}

		return c.json({
			featureIds,
			eventNames,
		});
	},
});
