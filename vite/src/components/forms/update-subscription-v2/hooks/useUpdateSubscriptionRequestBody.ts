import { type ProductItem, UsageModel } from "@autumn/shared";
import { useCallback } from "react";
import type { UpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";
import { getFreeTrial } from "../utils/getFreeTrial";
import type { UseUpdateSubscriptionForm } from "./useUpdateSubscriptionForm";

/** Pure function to build update subscription options from prepaid form values. Extracted for testability. */
export function buildUpdateSubscriptionOptions({
	prepaidItems,
	prepaidOptions,
	initialPrepaidOptions,
	items,
}: {
	prepaidItems: {
		feature_id?: string | null;
		feature?: { internal_id?: string } | null;
		included_usage?: number | "inf" | null;
	}[];
	prepaidOptions: Record<string, number>;
	initialPrepaidOptions: Record<string, number>;
	items?: ProductItem[] | null;
}): { feature_id: string; quantity: number }[] {
	const options = prepaidItems
		.map((item) => {
			const featureId = item.feature_id ?? item.feature?.internal_id ?? "";
			const inputQuantity = prepaidOptions[featureId];
			const initialQuantity = initialPrepaidOptions[featureId];
			const includedUsage =
				typeof item.included_usage === "number" ? item.included_usage : 0;

			if (
				inputQuantity !== undefined &&
				inputQuantity !== null &&
				featureId &&
				inputQuantity !== initialQuantity
			) {
				return {
					feature_id: featureId,
					quantity: inputQuantity + includedUsage,
				};
			}
			return null;
		})
		.filter((o): o is { feature_id: string; quantity: number } => o !== null);

	if (items && items.length > 0) {
		const existingFeatureIds = new Set(options.map((o) => o.feature_id));

		for (const item of items) {
			if (
				item.usage_model === UsageModel.Prepaid &&
				item.feature_id &&
				!existingFeatureIds.has(item.feature_id)
			) {
				const inputQuantity = prepaidOptions[item.feature_id];
				const includedUsage =
					typeof item.included_usage === "number" ? item.included_usage : 0;

				if (inputQuantity !== undefined && inputQuantity !== null) {
					options.push({
						feature_id: item.feature_id,
						quantity: inputQuantity + includedUsage,
					});
				}
			}
		}
	}

	return options;
}

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
			trialEnabled,
			trialCardRequired,
			version,
			items,
			cancelAction,
			billingBehavior,
			refundBehavior,
		} = formValues;

		const requestBody: Record<string, unknown> = {
			customer_id: customerId,
			product_id: product?.id,
			entity_id: entityId,
			customer_product_id:
				customerProduct.id ?? customerProduct.internal_product_id,
		};

		// For cancel actions, only include cancellation-related fields
		if (cancelAction) {
			requestBody.cancel_action = cancelAction;

			if (cancelAction === "cancel_immediately") {
				if (billingBehavior) {
					requestBody.billing_behavior = billingBehavior;
				}
				if (refundBehavior) {
					requestBody.refund_behavior = refundBehavior;
				}
			}

			return requestBody;
		}

		const options = buildUpdateSubscriptionOptions({
			prepaidItems,
			prepaidOptions,
			initialPrepaidOptions,
			items,
		});

		if (options.length > 0) {
			requestBody.options = options;
		}

		const freeTrial = getFreeTrial({
			removeTrial,
			trialLength,
			trialDuration,
			trialEnabled,
			trialCardRequired,
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
