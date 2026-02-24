import { ErrCode, type FullCustomer, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";
import { eventActions } from "../actions/eventActions.js";

const InternalListRawEventsSchema = z.object({
	interval: z.string().nullish(),
	customer_id: z.string().nullish(),
});

/**
 * Query raw events by customer ID
 */
export const handleInternalListRawEvents = createRoute({
	body: InternalListRawEventsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;
		const { interval, customer_id } = c.req.valid("json");

		let aggregateAll = false;
		let customer: FullCustomer | undefined;

		if (!customer_id) {
			// No customer ID provided, set aggregateAll to true
			aggregateAll = true;
		} else {
			// Customer ID provided, fetch customer data
			customer = await CusService.getFull({
				ctx,
				idOrInternalId: customer_id,
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

		const events = await eventActions.listRawEvents({
			ctx,
			params: {
				customer_id: customer?.id ?? undefined,
				interval: interval ?? undefined,
				customer,
				aggregateAll,
			},
		});

		return c.json({
			rawEvents: events,
		});
	},
});
