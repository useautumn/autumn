import {
	type AttachParamsV1,
	type Checkout,
	CheckoutAction,
	type ConfirmCheckoutParams,
	type CreateScheduleParamsV0,
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
}): AttachParamsV1 | CreateScheduleParamsV0 | UpdateSubscriptionV1Params;

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
	checkout: CheckoutForAction<CheckoutAction.CreateSchedule>;
	body: ConfirmCheckoutParams;
}): CheckoutParamsForAction<CheckoutAction.CreateSchedule>;

export function augmentCheckoutParams({
	checkout,
	body,
}: {
	checkout: Checkout;
	body: ConfirmCheckoutParams;
}): AttachParamsV1 | CreateScheduleParamsV0 | UpdateSubscriptionV1Params {
	const mergeFeatureQuantities = ({
		originalFeatureQuantities,
	}: {
		originalFeatureQuantities:
			| AttachParamsV1["feature_quantities"]
			| UpdateSubscriptionV1Params["feature_quantities"];
	}) => {
		if (!body.feature_quantities) {
			return originalFeatureQuantities;
		}

		return body.feature_quantities.map((featureQuantity) => {
			const originalFeatureQuantity = originalFeatureQuantities?.find(
				(original) => original.feature_id === featureQuantity.feature_id,
			);

			return {
				...featureQuantity,
				adjustable: originalFeatureQuantity?.adjustable,
			};
		});
	};

	const mergeDiscounts = ({
		originalDiscounts,
	}: {
		originalDiscounts:
			| AttachParamsV1["discounts"]
			| UpdateSubscriptionV1Params["discounts"];
	}) => {
		if (!body.discounts?.length) {
			return originalDiscounts;
		}

		return [...(originalDiscounts ?? []), ...body.discounts];
	};

	switch (checkout.action) {
		case CheckoutAction.Attach: {
			const originalParams = checkout.params as AttachParamsV1;

			return {
				...originalParams,
				feature_quantities: mergeFeatureQuantities({
					originalFeatureQuantities: originalParams.feature_quantities,
				}),
				discounts: mergeDiscounts({
					originalDiscounts: originalParams.discounts,
				}),
			};
		}
		case CheckoutAction.UpdateSubscription: {
			const originalParams = checkout.params as UpdateSubscriptionV1Params;

			return {
				...originalParams,
				feature_quantities: mergeFeatureQuantities({
					originalFeatureQuantities: originalParams.feature_quantities,
				}),
				discounts: mergeDiscounts({
					originalDiscounts: originalParams.discounts,
				}),
			};
		}
		case CheckoutAction.CreateSchedule:
			return checkout.params as CreateScheduleParamsV0;
		default:
			throw new RecaseError({
				message: "Unsupported checkout action",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
	}
}
