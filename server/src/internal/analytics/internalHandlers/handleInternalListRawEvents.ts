import { ErrCode, type FullCustomer, RecaseError, Scopes } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { EventService } from "@/internal/api/events/EventService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { eventActions } from "../actions/eventActions.js";

const InternalListRawEventsSchema = z.object({
	interval: z.string().nullish(),
	custom_range: z
		.object({ start: z.number(), end: z.number() })
		.refine((range) => range.start < range.end, {
			message: "custom_range.start must be before custom_range.end",
		})
		.optional(),
	event_names: z.array(z.string()).optional(),
	customer_id: z.string().nullish(),
	entity_id: z.string().optional(),
});

/**
 * Query raw events by customer ID
 */
export const handleInternalListRawEvents = createRoute({
	scopes: [Scopes.Analytics.Read],
	body: InternalListRawEventsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;
		const { interval, custom_range, event_names, customer_id, entity_id } =
			c.req.valid("json");

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
				withEntities: true,
			});

			if (!customer) {
				throw new RecaseError({
					message: "Customer not found",
					code: ErrCode.CustomerNotFound,
					statusCode: StatusCodes.NOT_FOUND,
				});
			}
		}

		let events: Awaited<ReturnType<typeof eventActions.listRawEvents>>;
		try {
			events = await eventActions.listRawEvents({
				ctx,
				params: {
					customer_id: customer?.id ?? undefined,
					entity_id: entity_id,
					interval: interval ?? undefined,
					custom_range: custom_range ?? undefined,
					event_names: event_names?.filter((name) => name !== ""),
					customer,
					aggregateAll,
				},
			});
		} catch (error) {
			// Dev stacks often lack ClickHouse credentials; the PG events buffer
			// (empty in production) keeps raw queries usable there.
			if (process.env.NODE_ENV === "production" || !customer) throw error;
			ctx.logger.warn(
				`[/query/raw] ClickHouse query failed, falling back to PG events: ${error}`,
			);
			const rows = await EventService.getByCustomerId({
				db,
				orgId: org.id,
				internalCustomerId: customer.internal_id,
				env,
				limit: 1000,
			});
			events = { data: rows } as unknown as Awaited<
				ReturnType<typeof eventActions.listRawEvents>
			>;
		}

		return c.json({
			rawEvents: events,
		});
	},
});
