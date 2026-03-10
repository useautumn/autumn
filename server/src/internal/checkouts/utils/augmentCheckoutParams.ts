import {
	type AttachParamsV1,
	type Checkout,
	CheckoutAction,
	type ConfirmCheckoutParams,
	ErrCode,
	RecaseError,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type {
	CheckoutForAction,
	CheckoutParamsForAction,
} from "./previewCheckoutAction/previewCheckoutActionTypes";

export function augmentCheckoutParams({
	checkout,
	body,
}: {
	checkout: Checkout;
	body: ConfirmCheckoutParams;
}): AttachParamsV1 | UpdateSubscriptionV1Params;

export function augmentCheckoutParams({
	checkout,
	body,
}: {
	checkout: CheckoutForAction<CheckoutAction.Attach>;
	body: ConfirmCheckoutParams;
}): CheckoutParamsForAction<CheckoutAction.Attach>;

export function augmentCheckoutParams({
	checkout,
	body,
}: {
	checkout: CheckoutForAction<CheckoutAction.UpdateSubscription>;
	body: ConfirmCheckoutParams;
}): CheckoutParamsForAction<CheckoutAction.UpdateSubscription>;

export function augmentCheckoutParams({
	checkout,
	body,
}: {
	checkout: Checkout;
	body: ConfirmCheckoutParams;
}): AttachParamsV1 | UpdateSubscriptionV1Params {
	switch (checkout.action) {
		case CheckoutAction.Attach: {
			const originalParams = checkout.params as AttachParamsV1;

			return {
				...originalParams,
				feature_quantities: body.options,
			};
		}
		case CheckoutAction.UpdateSubscription: {
			const originalParams = checkout.params as UpdateSubscriptionV1Params;

			return {
				...originalParams,
				feature_quantities: body.options,
			};
		}
		default:
			throw new RecaseError({
				message: "Unsupported checkout action",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
	}
}
