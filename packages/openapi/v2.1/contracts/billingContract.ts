import {
	AttachParamsV1Schema,
	AttachPreviewResponseSchema,
	BillingResponseSchema,
	PreviewUpdateSubscriptionResponseSchema,
	SetupPaymentParamsSchema,
	SetupPaymentResultSchema,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared";
import { oc } from "@orpc/contract";
import { billingAttachJsDoc } from "../jsDocs/billingJsDocs";

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
	.input(AttachParamsV1Schema)
	.output(BillingResponseSchema);

export const billingPreviewAttachContract = oc
	.route({
		method: "POST",
		path: "/v1/billing.preview_attach",
		operationId: "billingPreviewAttach",
		tags: ["billing"],
		description: "Preview billing changes before attaching a plan.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "previewAttach",
		}),
	})
	.input(AttachParamsV1Schema)
	.output(AttachPreviewResponseSchema);

export const billingUpdateContract = oc
	.route({
		method: "POST",
		path: "/v1/billing.update",
		operationId: "billingUpdate",
		tags: ["billing"],
		description: "Update an existing subscription.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "update",
		}),
	})
	.input(UpdateSubscriptionV1ParamsSchema)
	.output(BillingResponseSchema);

export const billingPreviewUpdateContract = oc
	.route({
		method: "POST",
		path: "/v1/billing.preview_update",
		operationId: "billingPreviewUpdate",
		tags: ["billing"],
		description: "Preview billing changes before updating a subscription.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "previewUpdate",
		}),
	})
	.input(UpdateSubscriptionV1ParamsSchema)
	.output(PreviewUpdateSubscriptionResponseSchema);

export const billingSetupPaymentContract = oc
	.route({
		method: "POST",
		path: "/v1/billing.setup_payment",
		operationId: "billingSetupPayment",
		tags: ["billing"],
		description: "Create a setup payment session for a customer.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "setupPayment",
		}),
	})
	.input(SetupPaymentParamsSchema)
	.output(SetupPaymentResultSchema);
