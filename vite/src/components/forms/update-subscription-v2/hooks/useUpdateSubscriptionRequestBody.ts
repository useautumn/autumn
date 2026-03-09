import {
	type ProductItem,
	type ProductV2,
	type UpdateSubscriptionV0Params,
	UsageModel,
} from "@autumn/shared";
import { useCallback } from "react";
import { getPrepaidItems } from "@/utils/product/productItemUtils";
import type { UpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";
import { getFreeTrial } from "../utils/getFreeTrial";
import { getPrepaidOptionQuantity } from "../utils/prepaidOptionUtils";
import type { UseUpdateSubscriptionForm } from "./useUpdateSubscriptionForm";

/** Pure function to build update subscription options from prepaid form values. Extracted for testability. */
export function buildUpdateSubscriptionOptions({
	prepaidItems,
	prepaidOptions,
	items,
}: {
	prepaidItems: {
		feature_id?: string | null;
		feature?: { internal_id?: string } | null;
		included_usage?: number | "inf" | null;
	}[];
	prepaidOptions: Record<string, number>;
	items?: ProductItem[] | null;
}): { feature_id: string; quantity: number }[] {
	const updatedItemsByFeatureId = new Map(
		(items ?? [])
			.filter((item) => item.feature_id)
			.map((item) => [item.feature_id as string, item]),
	);

	const options = prepaidItems
		.map((item) => {
			const featureId = item.feature_id ?? item.feature?.internal_id ?? "";
			const updatedItem = featureId
				? updatedItemsByFeatureId.get(featureId)
				: undefined;
			const inputQuantity = getPrepaidOptionQuantity({
				item,
				prepaidOptions,
			});
			const includedUsage =
				typeof item.included_usage === "number" ? item.included_usage : 0;

			if (updatedItem && updatedItem.usage_model !== UsageModel.Prepaid) {
				return null;
			}

			if (inputQuantity !== undefined && inputQuantity !== null && featureId) {
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
	effectiveProduct,
}: {
	updateSubscriptionFormContext: UpdateSubscriptionFormContext;
	form: UseUpdateSubscriptionForm;
	effectiveProduct?: ProductV2;
}) {
	const { customerId, product, entityId, customerProduct } =
		updateSubscriptionFormContext;
	const initialVersion = form.options.defaultValues?.version;

	const buildRequestBody = useCallback((): UpdateSubscriptionV0Params => {
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
		} = formValues;

		const base = {
			customer_id: customerId ?? "",
			product_id: product?.id,
			entity_id: entityId,
			customer_product_id:
				customerProduct.id ?? customerProduct.internal_product_id,
		};

		// For cancel actions, only include cancellation-related fields
		if (cancelAction) {
			return {
				...base,
				cancel_action: cancelAction,
				billing_behavior:
					cancelAction === "cancel_immediately"
						? billingBehavior || undefined
						: undefined,
			};
		}

		const prepaidItems = getPrepaidItems(effectiveProduct);
		const options = buildUpdateSubscriptionOptions({
			prepaidItems,
			prepaidOptions,
			items,
		});

		const freeTrial = getFreeTrial({
			removeTrial,
			trialLength,
			trialDuration,
			trialEnabled,
			trialCardRequired,
		});

		return {
			...base,
			options: options.length > 0 ? options : undefined,
			free_trial: freeTrial,
			items: items && items.length > 0 ? items : undefined,
			version: version !== initialVersion ? version : undefined,
			billing_behavior: billingBehavior || undefined,
		};
	}, [
		form.store,
		customerId,
		product?.id,
		entityId,
		customerProduct.id,
		customerProduct.internal_product_id,
		initialVersion,
		effectiveProduct,
	]);

	return { buildRequestBody };
}
