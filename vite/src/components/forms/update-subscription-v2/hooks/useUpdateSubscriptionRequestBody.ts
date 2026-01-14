import { useCallback } from "react";
import type { UpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormContext";
import { getFreeTrial } from "../utils/getFreeTrial";
import type { UseUpdateSubscriptionForm } from "./useUpdateSubscriptionForm";

export function useUpdateSubscriptionRequestBody({
	updateSubscriptionFormContext,
	form,
}: {
	updateSubscriptionFormContext: UpdateSubscriptionFormContext;
	form: UseUpdateSubscriptionForm;
}) {
	const {
		customerId,
		product,
		entityId,
		customerProduct,
		prepaidItems,
		customizedProduct,
	} = updateSubscriptionFormContext;

	const initialPrepaidOptions =
		form.options.defaultValues?.prepaidOptions ?? {};

	const buildRequestBody = useCallback(() => {
		const formValues = form.store.state.values;
		const {
			prepaidOptions,
			trialLength,
			trialDuration,
			trialCardRequired,
			removeTrial,
		} = formValues;

		const options = prepaidItems
			.map((item) => {
				const featureId = item.feature_id ?? item.feature?.internal_id ?? "";
				const inputQuantity = prepaidOptions[featureId];
				const initialQuantity = initialPrepaidOptions[featureId];
				const billingUnits = item.billing_units ?? 1;

				if (
					inputQuantity !== undefined &&
					inputQuantity !== null &&
					featureId &&
					inputQuantity !== initialQuantity
				) {
					return {
						feature_id: featureId,
						quantity: inputQuantity * billingUnits,
					};
				}
				return null;
			})
			.filter(Boolean);

		const requestBody: Record<string, unknown> = {
			customer_id: customerId,
			product_id: product?.id,
			entity_id: entityId,
			customer_product_id:
				customerProduct.id ?? customerProduct.internal_product_id,
		};

		if (options.length > 0) {
			requestBody.options = options;
		}

		const freeTrial = getFreeTrial({
			removeTrial,
			trialLength,
			trialDuration,
			trialCardRequired,
		});
		if (freeTrial !== undefined) {
			requestBody.free_trial = freeTrial;
		}

		if (customizedProduct?.items) {
			requestBody.items = customizedProduct.items;
		}

		return requestBody;
	}, [
		form.store,
		customerId,
		product?.id,
		entityId,
		customerProduct.id,
		customerProduct.internal_product_id,
		prepaidItems,
		initialPrepaidOptions,
		customizedProduct?.items,
	]);

	return { buildRequestBody };
}
