import type { FullCusProduct, ProductItem } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useMemo } from "react";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import type { PrepaidItemWithFeature } from "@/hooks/stores/useProductStore";
import type { UseUpdateSubscriptionForm } from "../hooks/useUpdateSubscriptionForm";
import type { SummaryItem } from "../types/summary";
import { generateItemChanges } from "../utils/generateItemChanges";
import { generatePrepaidChanges } from "../utils/generatePrepaidChanges";
import { generateTrialChanges } from "../utils/generateTrialChanges";
import { generateVersionChanges } from "../utils/generateVersionChanges";
import { SummaryItemRow } from "./SummaryItemRow";

interface UpdateSubscriptionSummaryProps {
	form: UseUpdateSubscriptionForm;
	prepaidItems: PrepaidItemWithFeature[];
	customerProduct: FullCusProduct;
	currentVersion: number;
	currency?: string;
	originalItems?: ProductItem[];
}

export function UpdateSubscriptionSummary({
	form,
	prepaidItems,
	customerProduct,
	currentVersion,
	currency = "usd",
	originalItems,
}: UpdateSubscriptionSummaryProps) {
	const formValues = useStore(form.store, (state) => state.values);
	const { features } = useFeaturesQuery();

	const defaultValues = form.options.defaultValues;
	const initialPrepaidOptions = defaultValues?.prepaidOptions ?? {};

	const changes = useMemo((): SummaryItem[] => {
		const trialChanges = generateTrialChanges({
			customerProduct,
			removeTrial: formValues.removeTrial,
			trialLength: formValues.trialLength,
			trialDuration: formValues.trialDuration,
		});

		const versionChanges = generateVersionChanges({
			currentVersion,
			selectedVersion: formValues.version,
		});

		const itemChanges = generateItemChanges({
			originalItems,
			customizedItems: formValues.items,
			features,
			prepaidOptions: formValues.prepaidOptions,
		});

		// Get set of newly added feature IDs to filter out their prepaid changes
		// (prepaid info is already included in the item addition description)
		const newlyAddedFeatureIds = new Set(
			itemChanges
				.filter((change) => change.id.startsWith("item-added-"))
				.map((change) => change.id.replace("item-added-", "")),
		);

		const prepaidChanges = generatePrepaidChanges({
			prepaidItems,
			currentOptions: formValues.prepaidOptions,
			initialOptions: initialPrepaidOptions,
			currency,
		}).filter((change) => {
			// Filter out prepaid changes for newly added items
			const featureId = change.id.replace("prepaid-", "");
			return !newlyAddedFeatureIds.has(featureId);
		});

		return [
			...versionChanges,
			...itemChanges,
			...prepaidChanges,
			...trialChanges,
		];
	}, [
		prepaidItems,
		formValues.prepaidOptions,
		formValues.removeTrial,
		formValues.trialLength,
		formValues.trialDuration,
		formValues.version,
		formValues.items,
		initialPrepaidOptions,
		customerProduct,
		currentVersion,
		currency,
		features,
		originalItems,
	]);

	if (changes.length === 0) return null;

	return (
		<SheetSection title="Changes" withSeparator>
			<div className="space-y-2">
				{changes.map((change) => (
					<SummaryItemRow key={change.id} item={change} currency={currency} />
				))}
			</div>
		</SheetSection>
	);
}
