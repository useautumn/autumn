import {
	billingControlsFromColumns,
	compareBillingControls,
	type ProductItem,
	type ProductItemInterval,
	type UpdateSubscriptionV0Params,
} from "@autumn/shared";
import { useCallback } from "react";
import { normalizeBillingRequestItems } from "@/components/forms/shared/utils/normalizeBillingRequestItems";
import type { UpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";
import { getFreeTrial } from "../utils/getFreeTrial";
import type { UseUpdateSubscriptionForm } from "./useUpdateSubscriptionForm";

type PrepaidItemInput = {
	feature_id?: string | null;
	feature?: { internal_id?: string | null } | null;
	included_usage?: number | "inf" | null;
	interval?: ProductItemInterval | null;
};

/** Pure function to build update subscription options from prepaid form values. Extracted for testability. */
export function buildUpdateSubscriptionOptions({
	prepaidItems,
	prepaidOptions,
	initialPrepaidOptions,
	initialBackendQuantities,
}: {
	prepaidItems: PrepaidItemInput[];
	prepaidOptions: Record<string, number | undefined>;
	initialPrepaidOptions: Record<string, number | undefined>;
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

			if (
				normalizedInputQuantity === undefined ||
				normalizedInputQuantity === null ||
				!featureId
			) {
				return null;
			}

			const newPurchasedQuantity = getPurchasedQuantity({
				totalQuantity: normalizedInputQuantity,
				includedUsage: currentIncludedUsage,
			});
			const currentPurchasedQuantity = getPurchasedQuantity({
				totalQuantity: initialQuantity,
				includedUsage: currentIncludedUsage,
			});

			const isOneOff = item.interval === null;
			if (isOneOff) {
				const topUpDelta = newPurchasedQuantity - currentPurchasedQuantity;
				if (topUpDelta <= 0) return null;
				return { feature_id: featureId, quantity: topUpDelta };
			}

			const purchasedQuantityChanged =
				newPurchasedQuantity !== (initialBackendQuantities[featureId] ?? 0);
			const quantityChanged = normalizedInputQuantity !== initialQuantity;
			if (quantityChanged || purchasedQuantityChanged) {
				return { feature_id: featureId, quantity: normalizedInputQuantity };
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
			resetUsage,
			refundBehavior,
			refundAmount,
			noBillingChanges,
			discounts,
			billingControls,
		} = formValues;

		const validDiscounts = discounts?.length
			? discounts.filter((d) => "reward_id" in d && d.reward_id)
			: undefined;

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

		// Only send billing_controls when they actually changed — the backend
		// treats their presence as UpdatePlan intent, which would misroute a
		// quantity-only edit.
		const billingControlsChanged = !compareBillingControls({
			newBillingControls: billingControls ?? undefined,
			curBillingControls: billingControlsFromColumns(customerProduct),
		});

		return {
			...base,
			options: options.length > 0 ? options : undefined,
			free_trial: freeTrial,
			items: normalizeBillingRequestItems({ items }),
			version: version !== initialVersion ? version : undefined,
			billing_behavior: billingBehavior || undefined,
			billing_cycle_anchor: resetBillingCycle ? "now" : undefined,
			carry_over_usages: resetUsage ? { enabled: false } : undefined,
			no_billing_changes: noBillingChanges || undefined,
			discounts: validDiscounts,
			billing_controls: billingControlsChanged
				? (billingControls ?? undefined)
				: undefined,
		};
	}, [
		form.store,
		customerId,
		product?.id,
		entityId,
		customerProduct,
		initialVersion,
		currentPrepaidItems,
		initialPrepaidOptions,
		initialBackendQuantities,
	]);

	return { buildRequestBody };
}
