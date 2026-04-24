import {
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	type RangeEnum,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { z } from "zod/v4";
import { assertTinybirdAvailable } from "@/external/tinybird/tinybirdUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getCustomerNames } from "@/internal/analytics/actions/getCustomerNames.js";
import { getEntityNames } from "@/internal/analytics/actions/getEntityNames.js";
import { CusService } from "@/internal/customers/CusService.js";
import { eventActions } from "../actions/eventActions.js";

const InternalAggregateEventsSchema = z.object({
	interval: z.string().nullish(),
	event_names: z.array(z.string()),
	customer_id: z.string().optional(),
	entity_id: z.string().optional(),
	group_by: z.string().optional(),
	bin_size: z.enum(["day", "hour", "month"]).optional(),
	timezone: z.string().optional(),
	max_groups: z.number().int().min(1).max(250).optional(),
});

/**
 * Query events by customer ID
 */
export const handleInternalAggregateEvents = createRoute({
	scopes: [Scopes.Analytics.Read],
	body: InternalAggregateEventsSchema,
	handler: async (c) => {
		assertTinybirdAvailable();
		const ctx = c.get("ctx");
		const { db, org, env, features } = ctx;
		const {
			interval,
			customer_id,
			entity_id,
			group_by,
			bin_size,
			timezone,
			max_groups,
		} = c.req.valid("json");
		let { event_names } = c.req.valid("json");

		let aggregateAll = false;
		let customer: FullCustomer | undefined;
		let bcExclusionFlag = false;

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
				entity_id: entity_id,
				interval: interval as RangeEnum,
				event_names,
				bin_size: binSize,
				aggregateAll,
				group_by: group_by,
				customer,
				timezone: timezone,
				max_groups,
			},
		});

		// When grouping by entity_id, resolve entity names from ClickHouse
		let entityNames: Record<string, string> | undefined;
		if (group_by === "entity_id" && events?.data) {
			const entityIds = [
				...new Set(
					events.data
						.map((row: Record<string, unknown>) => row.entity_id as string)
						.filter(
							(id: string) => id && id !== "AUTUMN_RESERVED" && id !== "",
						),
				),
			];

			if (entityIds.length > 0) {
				entityNames = await getEntityNames({
					entityIds,
					orgId: org.id,
					env,
				});
			}
		}

		let customerNames: Record<string, string> | undefined;
		if (group_by === "customer_id" && events?.data) {
			const customerIds = [
				...new Set(
					events.data
						.map((row: Record<string, unknown>) => row.customer_id as string)
						.filter(
							(id: string) => id && id !== "AUTUMN_RESERVED" && id !== "",
						),
				),
			];

			if (customerIds.length > 0) {
				customerNames = await getCustomerNames({
					customerIds,
					orgId: org.id,
					env,
				});
			}
		}

		return c.json({
			customer,
			events,
			features,
			eventNames: event_names,
			bcExclusionFlag,
			truncated,
			entityNames,
			customerNames,
		});
	},
});
