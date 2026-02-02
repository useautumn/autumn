import {
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	type RangeEnum,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";
import { AnalyticsService } from "../AnalyticsService.js";
import { eventActions } from "../actions/index.js";

const QueryEventsSchema = z.object({
	interval: z.string().nullish(),
	event_names: z.array(z.string()),
	customer_id: z.string().optional(),
	group_by: z.string().optional(),
	bin_size: z.enum(["day", "hour", "month"]).optional(),
	timezone: z.string().optional(),
});

/**
 * Query events by customer ID
 */
export const handleQueryEvents = createRoute({
	body: QueryEventsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env, features } = ctx;
		const { interval, customer_id, group_by, bin_size, timezone } =
			c.req.valid("json");
		let { event_names } = c.req.valid("json");

		AnalyticsService.handleEarlyExit();

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

		// Filter out empty strings
		event_names = event_names.filter((name: string) => name !== "");

		// Use provided bin_size, or default based on interval
		const binSize = bin_size || (interval === "24h" ? "hour" : "day");

		const { formatted: events, truncated } = await eventActions.aggregate({
			ctx,
			params: {
				customer_id: customer_id,
				interval: interval as RangeEnum,
				event_names,
				bin_size: binSize,
				aggregateAll,
				group_by: group_by,
				customer,
				timezone: timezone,
			},
		});

		return c.json({
			customer,
			events,
			features,
			eventNames: event_names,
			bcExclusionFlag,
			truncated,
		});
	},
});
