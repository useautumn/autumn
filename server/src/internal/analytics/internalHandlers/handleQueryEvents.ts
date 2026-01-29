import {
	ErrCode,
	type Feature,
	FeatureType,
	type FullCusProduct,
	type FullCustomer,
	type RangeEnum,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { queryWithCache } from "@/utils/cacheUtils/queryWithCache.js";
import { eventActions } from "../actions/index.js";

const QueryEventsSchema = z.object({
	interval: z.string().nullish(),
	event_names: z.array(z.string()).nullish(),
	customer_id: z.string().optional(),
	group_by: z.string().optional(),
	bin_size: z.enum(["day", "hour", "month"]).optional(),
	timezone: z.string().optional(),
});

/** Gets top event names, categorized into feature IDs and event names (with caching) */
const getTopEvents = async ({ ctx }: { ctx: AutumnContext }) => {
	const { org, env, features } = ctx;

	const topNames = await queryWithCache({
		ttl: 3600, // Cache for 1 hour
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

	return { featureIds, eventNames };
};

/** Query events by customer ID */
export const handleQueryEvents = createRoute({
	body: QueryEventsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env, features, logger } = ctx;
		let { interval, event_names, customer_id, group_by, bin_size, timezone } =
			c.req.valid("json");

		let topEvents: { featureIds: string[]; eventNames: string[] } | undefined;

		// Get top events if no event names provided
		if (!event_names || event_names.length === 0) {
			const topEventsStart = performance.now();
			topEvents = await getTopEvents({ ctx });
			logger.debug("getTopEvents timing", {
				durationMs: Math.round(performance.now() - topEventsStart),
			});
			event_names = [...topEvents.eventNames, ...topEvents.featureIds];
		} else {
			event_names = event_names.filter((name) => name !== "");
		}

		// Determine if aggregating all customers or a specific one
		const aggregateAll = !customer_id;
		let customer: FullCustomer | undefined;
		let bcExclusionFlag = false;

		if (customer_id) {
			const cusServiceStart = performance.now();
			customer = await CusService.getFull({
				db,
				idOrInternalId: customer_id,
				orgId: org.id,
				env,
				withSubs: true,
			});
			logger.debug("CusService.getFull timing", {
				durationMs: Math.round(performance.now() - cusServiceStart),
			});

			if (!customer) {
				throw new RecaseError({
					message: "Customer not found",
					code: ErrCode.CustomerNotFound,
					statusCode: StatusCodes.NOT_FOUND,
				});
			}

			// Check for bcExclusionFlag (customer has default product)
			bcExclusionFlag =
				customer.customer_products?.some(
					(p: FullCusProduct) => p.product.is_default,
				) ?? false;
		}

		const binSize = bin_size || (interval === "24h" ? "hour" : "day");

		const aggregateStart = performance.now();
		const events = await eventActions.aggregate({
			ctx,
			params: {
				customer_id,
				interval: interval as RangeEnum,
				event_names,
				bin_size: binSize,
				aggregateAll,
				group_by,
				customer,
				timezone,
			},
		});
		logger.debug("eventActions.aggregate timing", {
			durationMs: Math.round(performance.now() - aggregateStart),
		});

		return c.json({
			customer,
			events,
			features,
			eventNames: event_names,
			topEvents,
			bcExclusionFlag,
		});
	},
});
