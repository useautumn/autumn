import type {
	CustomizePlanLicense,
	ProductItem,
	ProductItemInterval,
	UpdateSubscriptionV0Params,
} from "@autumn/shared";
import { ProductItemFeatureType } from "@autumn/shared";
import { useCallback, useMemo } from "react";
import { normalizeBillingRequestItems } from "@/components/forms/shared/utils/normalizeBillingRequestItems";
import type { UpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";
import { getFreeTrial } from "../utils/getFreeTrial";
import type { UseUpdateSubscriptionForm } from "./useUpdateSubscriptionForm";

type PrepaidItemInput = {
	feature_id?: string | null;
	feature?: { internal_id?: string | null } | null;
	included_usage?: number | "inf" | null;
	interval?: ProductItemInterval | null;
	feature_type?: ProductItemFeatureType | null;
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

			// Only consumable (single-use) items top up by delta. Non-consumables
			// are continuous-use levels with interval === null — always absolute.
			const isOneOffTopUp =
				item.interval === null &&
				item.feature_type !== ProductItemFeatureType.ContinuousUse;
			if (isOneOffTopUp) {
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

export function buildUpdateSubscriptionCustomizationParams({
	items,
	addLicenses,
}: {
	items: ProductItem[] | null;
	addLicenses: CustomizePlanLicense[] | null;
}): Pick<UpdateSubscriptionV0Params, "items" | "upsert_licenses"> {
	return {
		items: normalizeBillingRequestItems({ items }),
		upsert_licenses: addLicenses ?? undefined,
	};
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

	const initialPrepaidOptions = useMemo(
		() => form.options.defaultValues?.prepaidOptions ?? {},
		[form.options.defaultValues?.prepaidOptions],
	);
	const initialBackendQuantities = useMemo(
		() =>
			customerProduct.options.reduce(
				(acc, option) => {
					acc[option.feature_id] = option.quantity;
					return acc;
				},
				{} as Record<string, number>,
			),
		[customerProduct.options],
	);
	const initialVersion = form.options.defaultValues?.version;
	const customerProductId =
		customerProduct.id ?? customerProduct.internal_product_id;

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
			addLicenses,
			cancelAction,
			billingBehavior,
			resetBillingCycle,
			resetUsage,
			refundBehavior,
			refundAmount,
			noBillingChanges,
			discounts,
		} = formValues;

		const validDiscounts = discounts?.length
			? discounts.filter((d) => "reward_id" in d && d.reward_id)
			: undefined;

		const base = {
			customer_id: customerId ?? "",
			product_id: product?.id,
			entity_id: entityId,
			customer_product_id: customerProductId,
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
			...buildUpdateSubscriptionCustomizationParams({ items, addLicenses }),
			version: version !== initialVersion ? version : undefined,
			billing_behavior: billingBehavior || undefined,
			billing_cycle_anchor: resetBillingCycle ? "now" : undefined,
			carry_over_usages: resetUsage ? { enabled: false } : undefined,
			no_billing_changes: noBillingChanges || undefined,
			discounts: validDiscounts,
		};
	}, [
		form.store,
		customerId,
		product?.id,
		entityId,
		customerProductId,
		initialVersion,
		currentPrepaidItems,
		initialPrepaidOptions,
		initialBackendQuantities,
	]);

	return { buildRequestBody };
}
