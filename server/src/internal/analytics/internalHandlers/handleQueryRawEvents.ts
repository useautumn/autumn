import { ErrCode, type FullCustomer, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";
import { eventRepo } from "../repos/eventRepo.js";

const QueryRawEventsSchema = z.object({
	interval: z.string().nullish(),
	customer_id: z.string().nullish(),
});

const INTERVAL_TO_DAYS: Record<string, number> = {
	"24h": 1,
	"7d": 7,
	"30d": 30,
	"90d": 90,
};

/**
 * Query raw events by customer ID
 */
export const handleQueryRawEvents = createRoute({
	body: QueryRawEventsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env, analyticsDb } = ctx;
		const { interval, customer_id } = c.req.valid("json");

		if (!analyticsDb) {
			throw new RecaseError({
				message: "Analytics database is not configured",
				code: ErrCode.InternalError,
				statusCode: StatusCodes.SERVICE_UNAVAILABLE,
			});
		}

		let customer: FullCustomer | undefined;

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
		}

		// Calculate date range based on interval
		const now = new Date();
		const days = INTERVAL_TO_DAYS[interval ?? "30d"] ?? 30;
		const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

		const rawEvents = await eventRepo.getRawEvents({
			ctx,
			customerId: customer?.id || undefined,
			startDate,
			endDate: now,
			limit: 10000,
		});

		// Format response to match old ClickHouse format for frontend compatibility
		const meta = [
			{ name: "id" },
			{ name: "customer_id" },
			{ name: "event_name" },
			{ name: "timestamp" },
			{ name: "value" },
			{ name: "properties" },
			{ name: "idempotency_key" },
		];

		return c.json({
			rawEvents: {
				meta,
				data: rawEvents,
				rows: rawEvents.length,
			},
		});
	},
});
