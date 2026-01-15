import {
	ErrCode,
	type Feature,
	FeatureType,
	type FullCusProduct,
	type FullCustomer,
	type RangeEnum,
} from "@autumn/shared";
import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { queryWithCache } from "@/utils/cacheUtils/queryWithCache.js";
import RecaseError from "@/utils/errorUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { CusService } from "../customers/CusService.js";
import { EventsAggregationService } from "../events/EventsAggregationService.js";
import { AnalyticsService } from "./AnalyticsService.js";

export const analyticsRouter = Router();

analyticsRouter.get("/event_names", async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "query event names",
		handler: async () => {
			AnalyticsService.handleEarlyExit();
			const { org, env, features } = req;

			const result = await queryWithCache({
				ttl: 3600,
				key: `top_events:${org.id}_${env}`,
				fn: async () => {
					const res = await AnalyticsService.getTopEventNames({
						req,
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

			res.status(200).json({
				featureIds,
				eventNames,
			});
		},
	}),
);

const getTopEvents = async ({ req }: { req: ExtendedRequest }) => {
	const { features } = req;

	const topEventNamesRes = await AnalyticsService.getTopEventNames({
		req,
	});

	const result = topEventNamesRes?.eventNames;

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
		} else if (features.some((feature: Feature) => feature.id === result[i])) {
			featureIds.push(result[i]);
		}

		if (i >= 2) break;
	}

	return {
		featureIds,
		eventNames,
	};
};
analyticsRouter.post("/events", async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "query events by customer id",
		handler: async () => {
			AnalyticsService.handleEarlyExit();
			const { db, org, env, features } = req;
			let { interval, event_names, customer_id, group_by, bin_size, timezone } =
				req.body;

			let topEvents: { featureIds: string[]; eventNames: string[] } | undefined;

			if (!event_names || event_names.length === 0) {
				topEvents = await getTopEvents({ req });
				event_names = [...topEvents.eventNames, ...topEvents.featureIds];
			}

			let aggregateAll = false;
			let customer: FullCustomer | undefined;
			let bcExclusionFlag = false;

			if (!customer_id) {
				// No customer ID provided, set aggregateAll to true
				aggregateAll = true;
			} else {
				// Customer ID provided, fetch customer data
				customer = await CusService.getFull({
					db,
					idOrInternalId: customer_id,
					orgId: org.id,
					env,
					withSubs: true,
				});

				if (!customer) {
					throw new RecaseError({
						message: "Customer not found",
						code: ErrCode.CustomerNotFound,
						statusCode: StatusCodes.NOT_FOUND,
					});
				}

				// Check for bcExclusionFlag only if we have a specific customer
				if (customer.customer_products) {
					customer.customer_products.forEach((product: FullCusProduct) => {
						if (product.product.is_default) {
							bcExclusionFlag = true;
						}
					});
				}
			}

			if (event_names && Array.isArray(event_names)) {
				event_names = event_names.filter((name: string) => name !== "");
			}

			// const events = await AnalyticsService.getTimeseriesEvents({
			// 	req,
			// 	params: {
			// 		customer_id,
			// 		interval,
			// 		event_names,
			// 	},
			// 	customer,
			// 	aggregateAll,
			// });

			// Use provided bin_size, or default based on interval
			const binSize = bin_size || (interval === "24h" ? "hour" : "day");

			const events = await EventsAggregationService.getTimeseriesEvents({
				ctx: req,
				params: {
					customer_id,
					interval: interval as RangeEnum,
					event_names,
					bin_size: binSize,
					aggregateAll,
					group_by: group_by,
					customer,
					timezone,
				},
			});

			res.status(200).json({
				customer,
				events,
				features,
				eventNames: event_names,
				topEvents,
				bcExclusionFlag,
			});
		},
	}),
);

analyticsRouter.post("/raw", async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "query raw events by customer id",
		handler: async () => {
			AnalyticsService.handleEarlyExit();
			const { db, org, env } = req;
			const { interval, customer_id } = req.body;

			let aggregateAll = false;
			let customer: FullCustomer | undefined;

			if (!customer_id) {
				// No customer ID provided, set aggregateAll to true
				aggregateAll = true;
			} else {
				// Customer ID provided, fetch customer data
				customer = await CusService.getFull({
					db,
					idOrInternalId: customer_id,
					orgId: org.id,
					env,
					withSubs: true,
				});

				if (!customer) {
					throw new RecaseError({
						message: "Customer not found",
						code: ErrCode.CustomerNotFound,
						statusCode: StatusCodes.NOT_FOUND,
					});
				}
			}

			const events = await AnalyticsService.getRawEvents({
				req,
				params: {
					// customer_id: customer?.internal_id,
					customer_id: customer?.id,
					interval,
				},
				customer,
				aggregateAll,
			});

			res.status(200).json({
				rawEvents: events,
			});
		},
	}),
);
