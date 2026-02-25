import {
	AttachParamsV1Schema,
	MultiAttachParamsV0Schema,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared";
import { createJSDocDescription, example } from "../../utils/jsDocs/index.js";

export const billingAttachJsDoc = createJSDocDescription({
	description:
		"Attaches a plan to a customer. Handles new subscriptions, upgrades and downgrades.",
	whenToUse:
		"Use this endpoint to subscribe a customer to a plan, upgrade/downgrade between plans, or add an add-on product.",
	body: AttachParamsV1Schema,
	examples: [
		example({
			description: "Attach a plan to a customer",
			values: {
				customerId: "cus_123",
				planId: "pro_plan",
			},
		}),
		example({
			description: "Attach with a free trial",
			values: {
				customerId: "cus_123",
				planId: "pro_plan",
				freeTrial: {
					durationLength: 14,
					durationType: "day",
				},
			},
		}),
		example({
			description: "Attach with custom pricing",
			values: {
				customerId: "cus_123",
				planId: "pro_plan",
				customize: {
					price: {
						amount: 4900,
						interval: "month",
					},
				},
			},
		}),
	],
	methodName: "billing.attach",
	returns:
		"A billing response with customer ID, invoice details, and payment URL (if checkout required).",
});

export const billingUpdateJsDoc = createJSDocDescription({
	description:
		"Updates an existing subscription. Use to modify feature quantities, cancel, or change plan configuration.",
	whenToUse:
		"Use this endpoint to update prepaid quantities, cancel a subscription (immediately or at end of cycle), or modify subscription settings.",
	body: UpdateSubscriptionV1ParamsSchema,
	examples: [
		example({
			description: "Update prepaid feature quantity",
			values: {
				customerId: "cus_123",
				planId: "pro_plan",
				featureQuantities: [{ featureId: "seats", quantity: 10 }],
			},
		}),
		example({
			description: "Cancel a subscription at end of billing cycle",
			values: {
				customerId: "cus_123",
				planId: "pro_plan",
				cancelAction: "cancel_end_of_cycle",
			},
		}),
		example({
			description: "Uncancel a subscription at the end of the billing cycle",
			values: {
				customerId: "cus_123",
				planId: "pro_plan",
				cancelAction: "uncancel",
			},
		}),
	],
	methodName: "billing.update",
	returns:
		"A billing response with customer ID, invoice details, and payment URL (if next action is required).",
});

export const billingPreviewAttachJsDoc = createJSDocDescription({
	description:
		"Previews the billing changes that would occur when attaching a plan, without actually making any changes.",
	whenToUse:
		"Use this endpoint to show customers what they will be charged before confirming a subscription change.",
	body: AttachParamsV1Schema,
	examples: [
		example({
			description: "Preview attaching a plan",
			values: {
				customerId: "cus_123",
				planId: "pro_plan",
			},
		}),
	],
	methodName: "billing.previewAttach",
	returns:
		"A preview response with line items, totals, and effective dates for the proposed changes.",
});

export const billingPreviewUpdateJsDoc = createJSDocDescription({
	description:
		"Previews the billing changes that would occur when updating a subscription, without actually making any changes.",
	whenToUse:
		"Use this endpoint to show customers prorated charges or refunds before confirming subscription modifications.",
	body: UpdateSubscriptionV1ParamsSchema,
	examples: [
		example({
			description: "Preview updating seat quantity",
			values: {
				customerId: "cus_123",
				planId: "pro_plan",
				featureQuantities: [{ featureId: "seats", quantity: 15 }],
			},
		}),
	],
	methodName: "billing.previewUpdate",
	returns:
		"A preview response with line items showing prorated charges or credits for the proposed changes.",
});

export const billingMultiAttachJsDoc = createJSDocDescription({
	description:
		"Attaches multiple plans to a customer in a single request. Creates a single Stripe subscription with all plans consolidated.",
	whenToUse:
		"Use this endpoint when you need to subscribe a customer to multiple plans at once, such as a base plan plus add-ons, or to create a bundle of products.",
	body: MultiAttachParamsV0Schema,
	examples: [
		example({
			description: "Attach multiple plans to a customer",
			values: {
				customerId: "cus_123",
				plans: [
					{ planId: "pro_plan" },
					{ planId: "addon_seats", featureQuantities: [{ featureId: "seats", quantity: 5 }] },
				],
			},
		}),
		example({
			description: "Attach with free trial applied to all plans",
			values: {
				customerId: "cus_123",
				plans: [
					{ planId: "pro_plan" },
					{ planId: "addon_storage" },
				],
				freeTrial: {
					durationLength: 14,
					durationType: "day",
				},
			},
		}),
		example({
			description: "Attach with custom pricing on one plan",
			values: {
				customerId: "cus_123",
				plans: [
					{
						planId: "pro_plan",
						customize: {
							price: { amount: 4900, interval: "month" },
						},
					},
					{ planId: "addon_support" },
				],
			},
		}),
	],
	methodName: "billing.multiAttach",
	returns:
		"A billing response with customer ID, invoice details, and payment URL (if checkout required).",
});

export const billingPreviewMultiAttachJsDoc = createJSDocDescription({
	description:
		"Previews the billing changes that would occur when attaching multiple plans, without actually making any changes.",
	whenToUse:
		"Use this endpoint to show customers what they will be charged before confirming a multi-plan subscription.",
	body: MultiAttachParamsV0Schema,
	examples: [
		example({
			description: "Preview attaching multiple plans",
			values: {
				customerId: "cus_123",
				plans: [
					{ planId: "pro_plan" },
					{ planId: "addon_seats", featureQuantities: [{ featureId: "seats", quantity: 5 }] },
				],
			},
		}),
	],
	methodName: "billing.previewMultiAttach",
	returns:
		"A preview response with line items, totals, and effective dates for the proposed multi-plan attachment.",
});
