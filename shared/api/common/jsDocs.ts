import { ExtAttachBodySchema, ExtCheckoutParamsSchema } from "@api/models.js";
import {
	createJSDocDescription,
	docLink,
	example,
} from "@api/utils/openApiHelpers.js";
import { SetUsageParamsSchema } from "../balances/usageModels.js";
import { CheckParamsSchema } from "../core/checkModels.js";
import {
	BillingPortalParamsSchema,
	CancelBodySchema,
	QueryParamsSchema,
	SetupPaymentParamsSchema,
	TrackParamsSchema,
} from "../core/coreOpModels.js";

/**
 * Centralized JSDoc declarations for all core API methods.
 * These are used by the OpenAPI spec generator and propagate to SDK documentation.
 */

export const attachJsDoc = createJSDocDescription({
	description:
		"Enables a product for a customer and processes payment if their payment method is already on file.",
	whenToUse:
		"Use this when the customer already has a payment method saved. For new customers without payment info, use `checkout` instead.",
	body: ExtAttachBodySchema,
	examples: [
		example({
			values: {
				customer_id: "cus_123",
				product_id: "pro_plan",
			},
			description: "Attach a product to a customer",
		}),
	],
	methodName: "attach",
	docs: [
		docLink({
			url: "https://docs.useautumn.com/api-reference/core/attach",
			title: "Product Attachments",
		}),
	],
});

export const checkoutJsDoc = createJSDocDescription({
	description:
		"Creates a checkout session for a customer to purchase a product with payment collection.",
	whenToUse:
		"Use this for new customers or when payment info is needed. For customers with existing payment methods, use `attach` instead.",
	body: ExtCheckoutParamsSchema,
	examples: [
		example({
			values: {
				customer_id: "cus_123",
				product_id: "pro_plan",
			},
			description: "Create a checkout session",
		}),
	],
	methodName: "checkout",
	docs: [
		docLink({
			url: "https://docs.useautumn.com/api-reference/core/checkout",
			title: "Checkout Sessions",
		}),
	],
});

export const checkJsDoc = createJSDocDescription({
	description:
		"Check whether a customer has access to a product, feature or remaining usage.",
	body: CheckParamsSchema,
	examples: [
		example({
			values: {
				customer_id: "cus_123",
				feature_id: "api_calls",
			},
			description: "Check feature access",
		}),
	],
	methodName: "check",
});

export const trackJsDoc = createJSDocDescription({
	description:
		"Track usage events for metered features or record analytics events.",
	whenToUse:
		"Use this to increment usage counters for pay-as-you-go features or track customer activity.",
	body: TrackParamsSchema,
	examples: [
		example({
			values: {
				customer_id: "cus_123",
				feature_id: "api_calls",
				value: 1,
			},
			description: "Track a usage event",
		}),
	],
	methodName: "track",
	docs: [
		docLink({
			url: "https://docs.useautumn.com/api-reference/core/track",
			title: "Usage Tracking",
		}),
	],
});

export const cancelJsDoc = createJSDocDescription({
	description: "Cancel a customer's subscription to a product.",
	whenToUse:
		"Use this when a customer wants to stop their subscription. Supports immediate or end-of-period cancellation.",
	body: CancelBodySchema,
	examples: [
		example({
			values: {
				customer_id: "cus_123",
				product_id: "pro_plan",
			},
			description: "Cancel a subscription",
		}),
	],
	methodName: "cancel",
	docs: [
		docLink({
			url: "https://docs.useautumn.com/api-reference/core/cancel",
			title: "Cancel Subscriptions",
		}),
	],
});

export const setupPaymentJsDoc = createJSDocDescription({
	description:
		"Creates a session for a customer to add or update their payment method.",
	whenToUse:
		"Use this to collect payment information without immediately charging the customer.",
	body: SetupPaymentParamsSchema,
	examples: [
		example({
			values: {
				customer_id: "cus_123",
				success_url: "https://example.com/success",
			},
			description: "Setup payment method",
		}),
	],
	methodName: "setupPayment",
	docs: [
		docLink({
			url: "https://docs.useautumn.com/api-reference/core/setup-payment",
			title: "Payment Setup",
		}),
	],
});

export const billingPortalJsDoc = createJSDocDescription({
	description:
		"Creates a billing portal session where customers can manage their subscription and payment methods.",
	whenToUse:
		"Use this to give customers self-service access to view invoices, update payment info, and manage subscriptions.",
	body: BillingPortalParamsSchema,
	examples: [
		example({
			values: {
				customer_id: "cus_123",
				return_url: "https://example.com/account",
			},
			description: "Open billing portal",
		}),
	],
	methodName: "billingPortal",
	docs: [
		docLink({
			url: "https://docs.useautumn.com/api-reference/core/billing-portal",
			title: "Billing Portal",
		}),
	],
});

export const queryJsDoc = createJSDocDescription({
	description:
		"Query usage analytics for a customer's features over a specified time range.",
	whenToUse:
		"Use this to retrieve historical usage data for dashboards, reports, or usage displays.",
	body: QueryParamsSchema,
	examples: [
		example({
			values: {
				customer_id: "cus_123",
				feature_id: "api_calls",
				range: "7d",
			},
			description: "Query 7-day usage",
		}),
	],
	methodName: "query",
	docs: [
		docLink({
			url: "https://docs.useautumn.com/api-reference/core/query",
			title: "Analytics Queries",
		}),
	],
});

export const setUsageJsDoc = createJSDocDescription({
	description:
		"Set usage for a feature. This is similar to /track instead of incrementing usage, it sets the usage value to exactly what is provided.",
	whenToUse: "Use this to set usage for a feature instead of incrementing it.",
	body: SetUsageParamsSchema,
	examples: [
		example({
			values: {
				customer_id: "123",
				feature_id: "api_calls",
				value: 10000,
			},
			description: "Set usage for a feature",
		}),
	],
	methodName: "usage",
	docs: [
		docLink({
			url: "https://docs.useautumn.com/api-reference/core/usage",
			title: "Set Usage",
		}),
	],
});
