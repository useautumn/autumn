import { CustomerExpand } from "@sdk";
import { z } from "zod/v4";
import {
	billingAttachRequestSchema,
	listPlansRequestSchema,
} from "../../../generated";
import type { RouteDefinition, RouteName } from "../types";
import { backendError, backendSuccess, sanitizeBody } from "../utils";

/** Route configurations for autumn-js backend */
export const routeConfigs: RouteDefinition<RouteName>[] = [
	{
		route: "getOrCreateCustomer",
		sdkMethod: (autumn, args) => autumn.customers.getOrCreate(args),
		requireCustomer: false, // customHandler handles auth logic for errorOnNotFound
		bodySchema: z.object({
			errorOnNotFound: z.boolean().optional().default(true),
			expand: z.array(z.enum(CustomerExpand)).optional(),
		}),
		customHandler: async ({ autumn, identity, body }) => {
			const sanitizedBody = sanitizeBody(body);

			// Special case: if no customer and errorOnNotFound is false, return 204
			if (!identity?.customerId && sanitizedBody.errorOnNotFound === false) {
				return backendSuccess({ statusCode: 204, body: null });
			}

			// Otherwise require customerId
			if (!identity?.customerId) {
				return backendError({
					message: "customerId not found",
					code: "no_customer_id",
					statusCode: 401,
				});
			}

			// Build args and call SDK
			const existingExpand = Array.isArray(sanitizedBody.expand)
				? sanitizedBody.expand
				: [];
			const args = {
				customerId: identity.customerId,
				...identity.customerData,
				...sanitizedBody,
				expand: [...existingExpand, "balances.feature"],
			};
			return autumn.customers.getOrCreate(args);
		},
	},
	{
		route: "attach",
		sdkMethod: (autumn, args) => autumn.billing.attach(args),
		bodySchema: billingAttachRequestSchema,
	},
	{
		route: "listPlans",
		sdkMethod: (autumn, args) => autumn.plans.list(args),
		requireCustomer: false,
		bodySchema: listPlansRequestSchema.optional(),
	},
];
