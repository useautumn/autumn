import { UsageModel } from "@autumn/shared";
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
	const { customerId, product, entityId, customerProduct, prepaidItems } =
		updateSubscriptionFormContext;

	const initialPrepaidOptions =
		form.options.defaultValues?.prepaidOptions ?? {};
	const initialVersion = form.options.defaultValues?.version;

	const buildRequestBody = useCallback(() => {
		const formValues = form.store.state.values;
		const {
			prepaidOptions,
			trialLength,
			trialDuration,
			removeTrial,
			version,
			items,
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

		if (items && items.length > 0) {
			const existingFeatureIds = new Set(options.map((o) => o?.feature_id));

			for (const item of items) {
				if (
					item.usage_model === UsageModel.Prepaid &&
					item.feature_id &&
					!existingFeatureIds.has(item.feature_id)
				) {
					const inputQuantity = prepaidOptions[item.feature_id];
					const billingUnits = item.billing_units ?? 1;

					if (inputQuantity !== undefined && inputQuantity !== null) {
						options.push({
							feature_id: item.feature_id,
							quantity: inputQuantity * billingUnits,
						});
					}
				}
			}
		}

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
		});
		if (freeTrial !== undefined) {
			requestBody.free_trial = freeTrial;
		}

		if (items && items.length > 0) {
			requestBody.items = items;
		}

		if (version !== initialVersion) {
			requestBody.version = version;
		}

		return requestBody;
	}, [
		form.store,
		customerId,
		product?.id,
		entityId,
		customerProduct.id,
		customerProduct.internal_product_id,
		initialVersion,
		prepaidItems,
		initialPrepaidOptions,
	]);

	return { buildRequestBody };
}
