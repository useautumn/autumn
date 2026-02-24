import { CustomerExpand } from "@useautumn/sdk";
import { z } from "zod/v4";
import {
	attachParamsSchema,
	createReferralCodeParamsSchema,
	eventsAggregateParamsSchema,
	eventsListParamsSchema,
	listPlansParamsSchema,
	openCustomerPortalParamsSchema,
	redeemReferralCodeParamsSchema,
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
		bodySchema: attachParamsSchema,
	},
	{
		route: "previewAttach",
		sdkMethod: (autumn, args) => autumn.billing.previewAttach(args),
	},
	{
		route: "updateSubscription",
		sdkMethod: (autumn, args) => autumn.billing.update(args),
	},
	{
		route: "previewUpdateSubscription",
		sdkMethod: (autumn, args) => autumn.billing.previewUpdate(args),
	},
	{
		route: "openCustomerPortal",
		sdkMethod: (autumn, args) => autumn.billing.openCustomerPortal(args),
		bodySchema: openCustomerPortalParamsSchema,
	},
	{
		route: "createReferralCode",
		sdkMethod: (autumn, args) => autumn.referrals.createCode(args),
		bodySchema: createReferralCodeParamsSchema,
	},
	{
		route: "redeemReferralCode",
		sdkMethod: (autumn, args) => autumn.referrals.redeemCode(args),
		bodySchema: redeemReferralCodeParamsSchema,
	},
	{
		route: "listPlans",
		sdkMethod: (autumn, args) => autumn.plans.list(args),
		requireCustomer: false,
		bodySchema: listPlansParamsSchema.optional(),
	},
	{
		route: "listEvents",
		sdkMethod: (autumn, args) => autumn.events.list(args),
		bodySchema: eventsListParamsSchema.optional(),
	},
	{
		route: "aggregateEvents",
		sdkMethod: (autumn, args) => autumn.events.aggregate(args),
		bodySchema: eventsAggregateParamsSchema.omit({ customerId: true }),
	},
];
