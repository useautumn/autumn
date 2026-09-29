// import { CustomerExpand } from "@useautumn/sdk";
import { billingAttach } from "@useautumn/sdk/funcs/billing-attach.js";
import { billingMultiAttach } from "@useautumn/sdk/funcs/billing-multi-attach.js";
import { billingOpenCustomerPortal } from "@useautumn/sdk/funcs/billing-open-customer-portal.js";
import { billingPreviewAttach } from "@useautumn/sdk/funcs/billing-preview-attach.js";
import { billingPreviewMultiAttach } from "@useautumn/sdk/funcs/billing-preview-multi-attach.js";
import { billingPreviewUpdate } from "@useautumn/sdk/funcs/billing-preview-update.js";
import { billingSetupPayment } from "@useautumn/sdk/funcs/billing-setup-payment.js";
import { billingUpdate } from "@useautumn/sdk/funcs/billing-update.js";
import { customersGetOrCreate } from "@useautumn/sdk/funcs/customers-get-or-create.js";
import { entitiesGet } from "@useautumn/sdk/funcs/entities-get.js";
import { eventsAggregate } from "@useautumn/sdk/funcs/events-aggregate.js";
import { eventsList } from "@useautumn/sdk/funcs/events-list.js";
import { plansList } from "@useautumn/sdk/funcs/plans-list.js";
import { referralsCreateCode } from "@useautumn/sdk/funcs/referrals-create-code.js";
import { referralsRedeemCode } from "@useautumn/sdk/funcs/referrals-redeem-code.js";
import { unwrapAsync } from "@useautumn/sdk/types/fp.js";
import { z } from "zod/v4";
import {
	attachParamsSchema,
	createReferralCodeParamsSchema,
	eventsAggregateParamsSchema,
	eventsListParamsSchema,
	listPlansParamsSchema,
	multiAttachParamsSchema,
	openCustomerPortalParamsSchema,
	previewAttachParamsSchema,
	previewMultiAttachParamsSchema,
	previewUpdateParamsSchema,
	redeemReferralCodeParamsSchema,
	setupPaymentParamsSchema,
	updateSubscriptionParamsSchema,
} from "../../../generated";
import type { RouteDefinition, RouteName } from "../types";
import {
	backendError,
	backendSuccess,
	CUSTOMER_PROTECTED_BODY_FIELDS,
	sanitizeBody,
} from "../utils";

const getEntityBodySchema = z.object({
	entityId: z.string(),
});

/** Route configurations for autumn-js backend */
export const routeConfigs: RouteDefinition<RouteName>[] = [
	{
		route: "getOrCreateCustomer",
		sdkMethod: (core, args) => unwrapAsync(customersGetOrCreate(core, args)),
		requireCustomer: false, // customHandler handles auth logic for errorOnNotFound
		bodySchema: z.object({
			errorOnNotFound: z.boolean().optional().default(true),
			// expand: z.array(z.enum(CustomerExpand)).optional(),
			expand: z.array(z.string()).optional(),
		}),
		protectedBodyFields: CUSTOMER_PROTECTED_BODY_FIELDS,
		customHandler: async ({ core, identity, body }) => {
			const sanitizedBody = sanitizeBody(body, CUSTOMER_PROTECTED_BODY_FIELDS);

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
			return unwrapAsync(customersGetOrCreate(core, args));
		},
	},
	{
		route: "getEntity",
		sdkMethod: (core, args) => unwrapAsync(entitiesGet(core, args)),
		bodySchema: getEntityBodySchema,
	},
	{
		route: "attach",
		sdkMethod: (core, args) => unwrapAsync(billingAttach(core, args)),
		bodySchema: attachParamsSchema,
	},
	{
		route: "previewAttach",
		sdkMethod: (core, args) => unwrapAsync(billingPreviewAttach(core, args)),
		bodySchema: previewAttachParamsSchema,
	},
	{
		route: "updateSubscription",
		sdkMethod: (core, args) => unwrapAsync(billingUpdate(core, args)),
		bodySchema: updateSubscriptionParamsSchema,
	},
	{
		route: "previewUpdateSubscription",
		sdkMethod: (core, args) => unwrapAsync(billingPreviewUpdate(core, args)),
		bodySchema: previewUpdateParamsSchema,
	},
	{
		route: "openCustomerPortal",
		sdkMethod: (core, args) =>
			unwrapAsync(billingOpenCustomerPortal(core, args)),
		bodySchema: openCustomerPortalParamsSchema,
	},
	{
		route: "createReferralCode",
		sdkMethod: (core, args) => unwrapAsync(referralsCreateCode(core, args)),
		bodySchema: createReferralCodeParamsSchema,
	},
	{
		route: "redeemReferralCode",
		sdkMethod: (core, args) => unwrapAsync(referralsRedeemCode(core, args)),
		bodySchema: redeemReferralCodeParamsSchema,
	},
	{
		route: "multiAttach",
		sdkMethod: (core, args) => unwrapAsync(billingMultiAttach(core, args)),
		bodySchema: multiAttachParamsSchema,
	},
	{
		route: "previewMultiAttach",
		sdkMethod: (core, args) =>
			unwrapAsync(billingPreviewMultiAttach(core, args)),
		bodySchema: previewMultiAttachParamsSchema,
	},
	{
		route: "setupPayment",
		sdkMethod: (core, args) => unwrapAsync(billingSetupPayment(core, args)),
		bodySchema: setupPaymentParamsSchema,
	},
	{
		route: "listPlans",
		sdkMethod: (core, args) => unwrapAsync(plansList(core, args)),
		requireCustomer: false,
		bodySchema: listPlansParamsSchema.optional(),
	},
	{
		route: "listEvents",
		sdkMethod: (core, args) => unwrapAsync(eventsList(core, args)),
		bodySchema: eventsListParamsSchema.optional(),
	},
	{
		route: "aggregateEvents",
		sdkMethod: (core, args) => unwrapAsync(eventsAggregate(core, args)),
		bodySchema: eventsAggregateParamsSchema,
	},
];
