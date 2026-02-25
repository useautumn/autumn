import {
	AttachParamsV1Schema,
	BILLING_PREVIEW_RESPONSE_EXAMPLE,
	BillingResponseSchema,
	ExtAttachPreviewResponseSchema,
	ExtPreviewUpdateSubscriptionResponseSchema,
	ExtUpdateSubscriptionV1ParamsSchema,
	MultiAttachParamsV0Schema,
	OpenCustomerPortalParamsV1Schema,
	OpenCustomerPortalResponseSchema,
	SetupPaymentParamsV1Schema,
	SetupPaymentResponseV1Schema,
} from "@autumn/shared";
import { oc } from "@orpc/contract";
import {
	billingAttachJsDoc,
	billingMultiAttachJsDoc,
	billingPreviewAttachJsDoc,
	billingPreviewMultiAttachJsDoc,
	billingPreviewUpdateJsDoc,
	billingUpdateJsDoc,
} from "../jsDocs/billingJsDocs";

export const billingAttachContract = oc
	.route({
		method: "POST",
		path: "/v1/billing.attach",
		operationId: "billingAttach",
		tags: ["billing"],
		description: billingAttachJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "attach",
		}),
	})
	.input(
		AttachParamsV1Schema.meta({
			title: "AttachParams",
			examples: [
				{
					customer_id: "cus_123",
					plan_id: "pro_plan",
				},
			],
		}),
	)
	.output(
		BillingResponseSchema.meta({
			examples: [
				{
					customer_id: "cus_123",
					payment_url: "https://checkout.stripe.com/...",
				},
			],
		}),
	);

export const billingUpdateContract = oc
	.route({
		method: "POST",
		path: "/v1/billing.update",
		operationId: "billingUpdate",
		tags: ["billing"],
		description: billingUpdateJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "update",
		}),
	})
	.input(
		ExtUpdateSubscriptionV1ParamsSchema.meta({
			title: "UpdateSubscriptionParams",
			examples: [
				{
					customer_id: "cus_123",
					plan_id: "pro_plan",
					feature_quantities: [{ feature_id: "seats", quantity: 10 }],
				},
			],
		}),
	)
	.output(
		BillingResponseSchema.meta({
			examples: [
				{
					customer_id: "cus_123",
					invoice: {
						status: "paid",
						stripe_id: "in_1234",
						total: 1500,
						currency: "usd",
						hosted_invoice_url: "https://invoice.stripe.com/...",
					},
					payment_url: null,
				},
			],
		}),
	);

export const billingPreviewAttachContract = oc
	.route({
		method: "POST",
		path: "/v1/billing.preview_attach",
		operationId: "previewAttach",
		tags: ["billing"],
		description: billingPreviewAttachJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "previewAttach",
		}),
	})
	.input(
		AttachParamsV1Schema.meta({
			title: "PreviewAttachParams",
			examples: [
				{
					customer_id: "cus_123",
					plan_id: "pro_plan",
				},
			],
		}),
	)
	.output(
		ExtAttachPreviewResponseSchema.meta({
			examples: [BILLING_PREVIEW_RESPONSE_EXAMPLE],
		}),
	);

export const billingPreviewUpdateContract = oc
	.route({
		method: "POST",
		path: "/v1/billing.preview_update",
		operationId: "previewUpdate",
		tags: ["billing"],
		description: billingPreviewUpdateJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "previewUpdate",
		}),
	})
	.input(
		ExtUpdateSubscriptionV1ParamsSchema.meta({
			title: "PreviewUpdateParams",
			examples: [
				{
					customer_id: "cus_123",
					plan_id: "pro_plan",
					feature_quantities: [{ feature_id: "seats", quantity: 15 }],
				},
			],
		}),
	)
	.output(
		ExtPreviewUpdateSubscriptionResponseSchema.meta({
			examples: [BILLING_PREVIEW_RESPONSE_EXAMPLE],
		}),
	);

export const billingOpenCustomerPortalContract = oc
	.route({
		method: "POST",
		path: "/v1/billing.open_customer_portal",
		operationId: "openCustomerPortal",
		tags: ["billing"],
		description:
			"Create a billing portal session for a customer to manage their subscription.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "openCustomerPortal",
		}),
	})
	.input(
		OpenCustomerPortalParamsV1Schema.meta({
			title: "OpenCustomerPortalParams",
			examples: [
				{
					customer_id: "cus_123",
					return_url: "https://useautumn.com",
				},
			],
		}),
	)
	.output(
		OpenCustomerPortalResponseSchema.meta({
			examples: [
				{
					customer_id: "cus_123",
					url: "https://billing.stripe.com/session/...",
				},
			],
		}),
	);

export const billingSetupPaymentContract = oc
	.route({
		method: "POST",
		path: "/v1/billing.setup_payment",
		operationId: "setupPayment",
		tags: ["billing"],
		description:
			"Create a payment setup session for a customer to add or update their payment method.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "setupPayment",
		}),
	})
	.input(
		SetupPaymentParamsV1Schema.meta({
			title: "SetupPaymentParams",
			examples: [
				{
					customer_id: "cus_123",
					success_url: "https://example.com/account/billing",
				},
			],
		}),
	)
	.output(
		SetupPaymentResponseV1Schema.meta({
			title: "SetupPaymentResponse",
			examples: [
				{
					customer_id: "cus_123",
					url: "https://checkout.stripe.com/...",
				},
			],
		}),
	);

export const billingMultiAttachContract = oc
	.route({
		method: "POST",
		path: "/v1/billing.multi_attach",
		operationId: "billingMultiAttach",
		tags: ["billing"],
		description: billingMultiAttachJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "multiAttach",
		}),
	})
	.input(
		MultiAttachParamsV0Schema.meta({
			title: "MultiAttachParams",
			examples: [
				{
					customer_id: "cus_123",
					plans: [
						{ plan_id: "pro_plan" },
						{ plan_id: "addon_seats", feature_quantities: [{ feature_id: "seats", quantity: 5 }] },
					],
				},
			],
		}),
	)
	.output(
		BillingResponseSchema.meta({
			examples: [
				{
					customer_id: "cus_123",
					invoice: {
						status: "paid",
						stripe_id: "in_1234",
						total: 4900,
						currency: "usd",
						hosted_invoice_url: "https://invoice.stripe.com/...",
					},
					payment_url: null,
				},
			],
		}),
	);

export const billingPreviewMultiAttachContract = oc
	.route({
		method: "POST",
		path: "/v1/billing.preview_multi_attach",
		operationId: "previewMultiAttach",
		tags: ["billing"],
		description: billingPreviewMultiAttachJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "previewMultiAttach",
		}),
	})
	.input(
		MultiAttachParamsV0Schema.meta({
			title: "PreviewMultiAttachParams",
			examples: [
				{
					customer_id: "cus_123",
					plans: [
						{ plan_id: "pro_plan" },
						{ plan_id: "addon_seats", feature_quantities: [{ feature_id: "seats", quantity: 5 }] },
					],
				},
			],
		}),
	)
	.output(
		ExtAttachPreviewResponseSchema.meta({
			examples: [BILLING_PREVIEW_RESPONSE_EXAMPLE],
		}),
	);
