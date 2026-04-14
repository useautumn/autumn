import type { ProductItem, UpdateSubscriptionV0Params } from "@autumn/shared";
import { useCallback } from "react";
import type { UpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";
import { getFreeTrial } from "../utils/getFreeTrial";
import type { UseUpdateSubscriptionForm } from "./useUpdateSubscriptionForm";

type PrepaidItemInput = {
	feature_id?: string | null;
	feature?: { internal_id?: string } | null;
	included_usage?: number | "inf" | null;
};

/** Pure function to build update subscription options from prepaid form values. Extracted for testability. */
export function buildUpdateSubscriptionOptions({
	prepaidItems,
	prepaidOptions,
	initialPrepaidOptions,
	initialBackendQuantities,
}: {
	prepaidItems: PrepaidItemInput[];
	prepaidOptions: Record<string, number>;
	initialPrepaidOptions: Record<string, number>;
	initialBackendQuantities: Record<string, number>;
}): { feature_id: string; quantity: number }[] {
	const getFeatureId = ({ item }: { item: PrepaidItemInput }) =>
		item.feature_id ?? item.feature?.internal_id ?? "";

	const getIncludedUsage = ({ item }: { item?: PrepaidItemInput | null }) =>
		typeof item?.included_usage === "number" ? item.included_usage : 0;

	const normalizeQuantity = ({
		quantity,
		includedUsage,
	}: {
		quantity: number;
		includedUsage: number;
	}) => Math.max(quantity, includedUsage);

	const getPurchasedQuantity = ({
		totalQuantity,
		includedUsage,
	}: {
		totalQuantity: number;
		includedUsage: number;
	}) => Math.max(0, totalQuantity - includedUsage);

	return prepaidItems
		.map((item) => {
			const featureId = getFeatureId({ item });
			const inputQuantity = prepaidOptions[featureId];
			const initialQuantity = initialPrepaidOptions[featureId] ?? 0;
			const normalizedInputQuantity =
				inputQuantity === undefined || inputQuantity === null
					? undefined
					: normalizeQuantity({
							quantity: inputQuantity,
							includedUsage: getIncludedUsage({ item }),
						});
			const currentIncludedUsage = getIncludedUsage({ item });
			const purchasedQuantityChanged =
				getPurchasedQuantity({
					totalQuantity: normalizedInputQuantity ?? initialQuantity,
					includedUsage: currentIncludedUsage,
				}) !== (initialBackendQuantities[featureId] ?? 0);

			if (
				normalizedInputQuantity !== undefined &&
				normalizedInputQuantity !== null &&
				featureId &&
				(normalizedInputQuantity !== initialQuantity ||
					purchasedQuantityChanged)
			) {
				return {
					feature_id: featureId,
					quantity: normalizedInputQuantity,
				};
			}
			return null;
		})
		.filter((o): o is { feature_id: string; quantity: number } => o !== null);
}

export function useUpdateSubscriptionRequestBody({
	updateSubscriptionFormContext,
	form,
	currentPrepaidItems,
}: {
	updateSubscriptionFormContext: UpdateSubscriptionFormContext;
	form: UseUpdateSubscriptionForm;
	currentPrepaidItems: ProductItem[];
}) {
	const { customerId, product, entityId, customerProduct } =
		updateSubscriptionFormContext;

	const initialPrepaidOptions =
		form.options.defaultValues?.prepaidOptions ?? {};
	const initialBackendQuantities = customerProduct.options.reduce(
		(acc, option) => {
			acc[option.feature_id] = option.quantity;
			return acc;
		},
		{} as Record<string, number>,
	);
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
			resetBillingCycle,
			refundBehavior,
			refundAmount,
			noBillingChanges,
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
			const isRefund = refundBehavior === "refund";
			return {
				...base,
				cancel_action: cancelAction,
				billing_behavior:
					cancelAction === "cancel_immediately" && !isRefund
						? billingBehavior || undefined
						: undefined,
				refund_last_payment:
					cancelAction === "cancel_immediately" && isRefund
						? refundAmount || "prorated"
						: undefined,
				no_billing_changes: noBillingChanges || undefined,
			};
		}

		const options = buildUpdateSubscriptionOptions({
			prepaidItems: currentPrepaidItems,
			prepaidOptions,
			initialPrepaidOptions,
			initialBackendQuantities,
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
			billing_cycle_anchor: resetBillingCycle ? "now" : undefined,
			no_billing_changes: noBillingChanges || undefined,
		};
	}, [
		form.store,
		customerId,
		product?.id,
		entityId,
		customerProduct.id,
		customerProduct.internal_product_id,
		customerProduct.options,
		initialVersion,
		currentPrepaidItems,
		initialPrepaidOptions,
		initialBackendQuantities,
	]);

	return { buildRequestBody };
}
