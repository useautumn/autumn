import type { FullCusProduct } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useMemo } from "react";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import type { PrepaidItemWithFeature } from "@/hooks/stores/useProductStore";
import type { UseUpdateSubscriptionForm } from "../hooks/useUpdateSubscriptionForm";
import type { SummaryItem } from "../types/summary";
import { generatePrepaidChanges } from "../utils/generatePrepaidChanges";
import { generateTrialChanges } from "../utils/generateTrialChanges";
import { SummaryItemRow } from "./SummaryItemRow";

interface UpdateSubscriptionSummaryProps {
	form: UseUpdateSubscriptionForm;
	prepaidItems: PrepaidItemWithFeature[];
	customerProduct: FullCusProduct;
	currency?: string;
}

export function UpdateSubscriptionSummary({
	form,
	prepaidItems,
	customerProduct,
	currency = "usd",
}: UpdateSubscriptionSummaryProps) {
	const formValues = useStore(form.store, (state) => state.values);

	const defaultValues = form.options.defaultValues;
	const initialPrepaidOptions = defaultValues?.prepaidOptions ?? {};

	const changes = useMemo((): SummaryItem[] => {
		const prepaidChanges = generatePrepaidChanges({
			prepaidItems,
			currentOptions: formValues.prepaidOptions,
			initialOptions: initialPrepaidOptions,
			currency,
		});

		const trialChanges = generateTrialChanges({
			customerProduct,
			removeTrial: formValues.removeTrial,
			trialLength: formValues.trialLength,
			trialDuration: formValues.trialDuration,
		});

		return [...prepaidChanges, ...trialChanges];
	}, [
		prepaidItems,
		formValues.prepaidOptions,
		formValues.removeTrial,
		formValues.trialLength,
		formValues.trialDuration,
		initialPrepaidOptions,
		customerProduct,
		currency,
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
