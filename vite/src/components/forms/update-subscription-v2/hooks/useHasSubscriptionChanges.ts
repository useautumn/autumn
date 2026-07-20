import {
	type BillingBehavior,
	type Feature,
	type FullCusProduct,
	generateItemChanges,
	generatePrepaidChanges,
	generateTrialChanges,
	generateVersionChanges,
	type ProductItem,
	ProductItemFeatureType,
	type ProductItemInterval,
} from "@autumn/shared";
import { useMemo } from "react";
import type { PrepaidItemWithFeature } from "@/hooks/stores/useProductStore";
import {
	convertLicenseQuantitiesToParams,
	customerLicensesToQuantityTotals,
} from "@/utils/billing/licenseQuantityUtils";
import type { UpdateSubscriptionForm } from "../updateSubscriptionFormSchema";

type PrepaidChangeItem = {
	interval?: ProductItemInterval | null;
	feature_type?: ProductItemFeatureType | null;
};

/** Whether a prepaid quantity change counts as a subscription change. Extracted for testability. */
export function shouldCountPrepaidChange({
	item,
	newlyAdded,
	initialQuantity,
	updatedQuantity,
}: {
	item?: PrepaidChangeItem;
	newlyAdded: boolean;
	initialQuantity: number;
	updatedQuantity: number;
}): boolean {
	if (newlyAdded) return false;
	// Consumable one-off top-ups only count when increasing; non-consumables
	// (continuous use) count on any delta, including a decrease.
	const isConsumableOneOff =
		item?.interval == null &&
		item?.feature_type !== ProductItemFeatureType.ContinuousUse;
	if (isConsumableOneOff) {
		return updatedQuantity > initialQuantity;
	}
	return true;
}

export function useHasSubscriptionChanges({
	formValues,
	initialPrepaidOptions,
	initialBillingBehavior,
	prepaidItems,
	customerProduct,
	currentVersion,
	originalItems,
	features,
}: {
	formValues: UpdateSubscriptionForm;
	initialPrepaidOptions: Record<string, number | undefined>;
	initialBillingBehavior: BillingBehavior | null;
	prepaidItems: PrepaidItemWithFeature[];
	customerProduct: FullCusProduct;
	currentVersion: number;
	originalItems?: ProductItem[];
	features?: Feature[];
}): boolean {
	return useMemo(() => {
		if (formValues.billingBehavior !== initialBillingBehavior) return true;
		if (formValues.resetBillingCycle) return true;
		if (formValues.noBillingChanges) return true;
		if (formValues.addLicenses !== null) return true;
		if (
			convertLicenseQuantitiesToParams({
				licenseQuantities: formValues.licenseQuantities,
				initialLicenseQuantities: customerLicensesToQuantityTotals({
					customerLicenses: customerProduct.customer_licenses ?? [],
				}),
			})
		) {
			return true;
		}

		if (formValues.discounts?.length > 0) return true;

		const trialChanges = generateTrialChanges({
			customerProduct,
			removeTrial: formValues.removeTrial,
			trialLength: formValues.trialLength,
			trialDuration: formValues.trialDuration,
			trialEnabled: formValues.trialEnabled,
			trialCardRequired: formValues.trialCardRequired,
		});

		if (trialChanges.length > 0) return true;

		const versionChanges = generateVersionChanges({
			originalVersion: currentVersion,
			updatedVersion: formValues.version,
		});

		if (versionChanges.length > 0) return true;

		const itemChanges = generateItemChanges({
			originalItems,
			updatedItems: formValues.items,
			features,
			prepaidOptions: formValues.prepaidOptions,
		});

		if (itemChanges.length > 0) return true;

		const newlyAddedFeatureIds = new Set(
			itemChanges
				.filter((change) => change.id.startsWith("item-added-"))
				.map((change) => change.id.replace("item-added-", "")),
		);

		const prepaidChanges = generatePrepaidChanges({
			prepaidItems,
			updatedOptions: formValues.prepaidOptions,
			originalOptions: initialPrepaidOptions,
		}).filter((change) => {
			const featureId = change.id.replace("prepaid-", "");
			const item = prepaidItems.find((it) => it.feature_id === featureId);
			return shouldCountPrepaidChange({
				item,
				newlyAdded: newlyAddedFeatureIds.has(featureId),
				initialQuantity: initialPrepaidOptions[featureId] ?? 0,
				updatedQuantity: formValues.prepaidOptions[featureId] ?? 0,
			});
		});

		return prepaidChanges.length > 0;
	}, [
		formValues.billingBehavior,
		formValues.resetBillingCycle,
		formValues.noBillingChanges,
		formValues.discounts,
		initialBillingBehavior,
		formValues.removeTrial,
		formValues.trialLength,
		formValues.trialDuration,
		formValues.trialEnabled,
		formValues.trialCardRequired,
		formValues.version,
		formValues.items,
		formValues.addLicenses,
		formValues.licenseQuantities,
		formValues.prepaidOptions,
		initialPrepaidOptions,
		prepaidItems,
		customerProduct,
		currentVersion,
		originalItems,
		features,
	]);
}
