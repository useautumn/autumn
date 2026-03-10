import type { Checkout } from "@autumn/shared";
import {
	type AttachBillingContext,
	type AttachParamsV1,
	type BillingResponse,
	type BillingResult,
	CheckoutAction,
	CheckoutStatus,
	type ConfirmCheckoutResponse,
	ErrCode,
	InternalError,
	RecaseError,
	type UpdateSubscriptionBillingContext,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";
import { billingResultToResponse } from "@/internal/billing/v2/utils/billingResult/billingResultToResponse";
import { toSuccessUrl } from "@/internal/orgs/orgUtils/convertOrgUtils";
import { updateCheckoutDbAndCache } from "./updateDbAndCache";

const buildConfirmCheckoutResponse = ({
	checkout,
	productId,
	invoiceId,
	response,
	successUrl,
}: {
	checkout: Checkout;
	productId: string;
	invoiceId: string | null;
	response: BillingResponse;
	successUrl: string;
}): ConfirmCheckoutResponse => ({
	...response,
	success: !response.required_action,
	checkout_id: checkout.id,
	product_id: productId,
	invoice_id: invoiceId,
	success_url: successUrl,
});

export const confirmCheckout = async ({
	ctx,
	checkout,
	params,
}: {
	ctx: AutumnContext;
	checkout: Checkout;
	params: AttachParamsV1 | UpdateSubscriptionV1Params;
}): Promise<ConfirmCheckoutResponse> => {
	if (checkout.status === CheckoutStatus.ActionRequired) {
		throw new RecaseError({
			message: "Checkout requires payment completion",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (checkout.status !== CheckoutStatus.Pending) {
		throw new RecaseError({
			message: "Checkout is not pending",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	let billingContext: AttachBillingContext | UpdateSubscriptionBillingContext;
	let billingResult: BillingResult | undefined;
	let productId: string;

	switch (checkout.action) {
		case CheckoutAction.Attach: {
			const checkoutResult = await billingActions.attach({
				ctx,
				params: params as AttachParamsV1,
				preview: false,
				skipAutumnCheckout: true,
			});

			billingContext = checkoutResult.billingContext;
			billingResult = checkoutResult.billingResult;
			productId = checkoutResult.billingContext.attachProduct.id;
			break;
		}
		case CheckoutAction.UpdateSubscription: {
			const checkoutResult = await billingActions.updateSubscription({
				ctx,
				params: params as UpdateSubscriptionV1Params,
				preview: false,
				options: {
					skipAutumnCheckout: true,
				},
			});

			billingContext = checkoutResult.billingContext;
			billingResult = checkoutResult.billingResult;
			productId = checkoutResult.billingContext.customerProduct.product.id;
			break;
		}
		default:
			throw new RecaseError({
				message: "Unsupported checkout action",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
	}

	if (!billingResult) {
		throw new InternalError({
			message: "Checkout confirmation did not return a billing result",
		});
	}

	const response = billingResultToResponse({
		billingContext,
		billingResult,
	});
	const invoiceId = billingResult.stripe.stripeInvoice?.id ?? null;
	const successUrl =
		billingContext.successUrl ?? toSuccessUrl({ org: ctx.org, env: ctx.env });

	const newCheckoutStatus = response.required_action
		? CheckoutStatus.ActionRequired
		: CheckoutStatus.Completed;

	await updateCheckoutDbAndCache({
		ctx,
		oldCheckout: checkout,
		updates: {
			status: newCheckoutStatus,
			response,
			stripe_invoice_id: invoiceId,
			completed_at:
				newCheckoutStatus === CheckoutStatus.Completed ? Date.now() : null,
		},
	});

	return buildConfirmCheckoutResponse({
		checkout,
		productId,
		invoiceId,
		response,
		successUrl,
	});
};
