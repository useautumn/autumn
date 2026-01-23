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
import { eventActions } from "../actions/index.js";

const QueryEventsSchema = z.object({
	interval: z.string().nullish(),
	event_names: z.array(z.string()).nullish(),
	customer_id: z.string().optional(),
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
		const { db, org, env, features, analyticsDb } = ctx;
		let { interval, event_names, customer_id, bin_size, timezone } =
			c.req.valid("json");

		if (!analyticsDb) {
			throw new RecaseError({
				message: "Analytics database is not configured",
				code: ErrCode.InternalError,
				statusCode: StatusCodes.SERVICE_UNAVAILABLE,
			});
		}

		let topEvents: { featureIds: string[]; eventNames: string[] } | undefined;

		// Get top events if no event names provided
		if (!event_names || event_names.length === 0) {
			topEvents = await eventActions.getTopEventNames({ ctx });
			event_names = [...topEvents.eventNames, ...topEvents.featureIds];
		}

		// Filter out empty event names
		if (event_names && Array.isArray(event_names)) {
			event_names = event_names.filter((name: string) => name !== "");
		}

		// Handle customer lookup
		let customer: FullCustomer | undefined;
		let bcExclusionFlag = false;

		if (customer_id) {
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

		// Use provided bin_size, or default based on interval
		const binSize = bin_size || (interval === "24h" ? "hour" : "day");

		// Aggregate events using the new action
		const aggregateResult = await eventActions.aggregate({
			ctx,
			eventNames: event_names,
			customerId: customer_id,
			interval: (interval ?? "7d") as RangeEnum,
			binSize,
			timezone,
		});

		// Transform to the format expected by frontend (ClickHouse-style format)
		// Frontend expects: { meta: [{ name: string }], data: Record[], rows: number }
		const meta = [{ name: "period" }, ...event_names.map((name) => ({ name }))];

		return c.json({
			customer,
			events: {
				meta,
				data: aggregateResult.data,
				rows: aggregateResult.data.length,
			},
			features,
			eventNames: event_names,
			topEvents,
			bcExclusionFlag,
		});
	},
});
