import {
	AttachParamsV1Schema,
	CreateScheduleParamsV0Schema,
	ExtMultiUpdateParamsV0Schema,
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
					{
						planId: "addon_seats",
						featureQuantities: [{ featureId: "seats", quantity: 5 }],
					},
				],
			},
		}),
		example({
			description: "Attach with free trial applied to all plans",
			values: {
				customerId: "cus_123",
				plans: [{ planId: "pro_plan" }, { planId: "addon_storage" }],
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

export const billingCreateScheduleJsDoc = createJSDocDescription({
	description:
		"Creates a multi-phase subscription schedule for a customer. The first phase starts immediately and subsequent phases automatically transition at their scheduled start times.",
	whenToUse:
		"Use this endpoint to schedule future plan changes (e.g. switch from a trial plan to a paid plan on a specific date) or to define a sequence of plans that should activate over time.",
	body: CreateScheduleParamsV0Schema,
	examples: [
		example({
			description: "Schedule a transition from a trial plan to a paid plan",
			values: {
				customerId: "cus_123",
				phases: [
					{
						startsAt: Date.now(),
						plans: [{ planId: "trial_plan" }],
					},
					{
						startsAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
						plans: [{ planId: "pro_plan" }],
					},
				],
			},
		}),
	],
	methodName: "billing.createSchedule",
	returns:
		"A create-schedule response with the schedule ID, persisted phases, and any required payment or checkout URL.",
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
					{
						planId: "addon_seats",
						featureQuantities: [{ featureId: "seats", quantity: 5 }],
					},
				],
			},
		}),
	],
	methodName: "billing.previewMultiAttach",
	returns:
		"A preview response with line items, totals, and effective dates for the proposed multi-plan attachment.",
});

export const billingMultiUpdateJsDoc = createJSDocDescription({
	description:
		"Updates multiple plans on a customer in a single request. Currently supports cancel actions (immediately, end of cycle, or uncancel) across one or more subscriptions.",
	whenToUse:
		"Use this endpoint to cancel or uncancel several plans atomically in one call — for example canceling a main plan together with its add-ons, or plans across multiple entities.",
	body: ExtMultiUpdateParamsV0Schema,
	examples: [
		example({
			description: "Cancel a plan and an add-on at end of cycle",
			values: {
				customerId: "cus_123",
				updates: [
					{ planId: "pro_plan", cancelAction: "cancel_end_of_cycle" },
					{ planId: "addon_seats", cancelAction: "cancel_end_of_cycle" },
				],
			},
		}),
		example({
			description: "Uncancel one plan and cancel another immediately",
			values: {
				customerId: "cus_123",
				updates: [
					{ planId: "pro_plan", cancelAction: "uncancel" },
					{ planId: "addon_seats", cancelAction: "cancel_immediately" },
				],
			},
		}),
	],
	methodName: "billing.multiUpdate",
	returns:
		"A billing response with the resulting invoice summary (one credit invoice per affected subscription for immediate cancels).",
});

export const billingPreviewMultiUpdateJsDoc = createJSDocDescription({
	description:
		"Previews the billing changes of a multi-plan update without making any changes. Returns one core preview per affected subscription.",
	whenToUse:
		"Use this endpoint to show customers the credits and next-cycle changes of canceling multiple plans before confirming.",
	body: ExtMultiUpdateParamsV0Schema,
	examples: [
		example({
			description: "Preview canceling two plans immediately",
			values: {
				customerId: "cus_123",
				updates: [
					{ planId: "pro_plan", cancelAction: "cancel_immediately" },
					{ planId: "addon_seats", cancelAction: "cancel_immediately" },
				],
			},
		}),
	],
	methodName: "billing.previewMultiUpdate",
	returns:
		"A preview with the combined total plus one entry per subscription, each with its own line items, totals, and next-cycle preview.",
});
