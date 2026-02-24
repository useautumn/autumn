import {
	type Feature,
	type FullCusProduct,
	generateItemChanges,
	generatePrepaidChanges,
	generateTrialChanges,
	generateVersionChanges,
	type ProductItem,
} from "@autumn/shared";
import { useMemo } from "react";
import type { PrepaidItemWithFeature } from "@/hooks/stores/useProductStore";
import type { UpdateSubscriptionForm } from "../updateSubscriptionFormSchema";

export function useHasSubscriptionChanges({
	formValues,
	initialPrepaidOptions,
	prepaidItems,
	customerProduct,
	currentVersion,
	originalItems,
	features,
}: {
	formValues: UpdateSubscriptionForm;
	initialPrepaidOptions: Record<string, number>;
	prepaidItems: PrepaidItemWithFeature[];
	customerProduct: FullCusProduct;
	currentVersion: number;
	originalItems?: ProductItem[];
	features?: Feature[];
}): boolean {
	return useMemo(() => {
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
			return !newlyAddedFeatureIds.has(featureId);
		});

		return prepaidChanges.length > 0;
	}, [
		formValues.removeTrial,
		formValues.trialLength,
		formValues.trialDuration,
		formValues.trialEnabled,
		formValues.trialCardRequired,
		formValues.version,
		formValues.items,
		formValues.prepaidOptions,
		initialPrepaidOptions,
		prepaidItems,
		customerProduct,
		currentVersion,
		originalItems,
		features,
	]);
}
