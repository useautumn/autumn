import type { FullCusProduct } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useMemo } from "react";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import type { UseUpdateSubscriptionForm } from "../hooks/useUpdateSubscriptionForm";
import type { SummaryItem } from "../types/summary";
import { generateTrialChanges } from "../utils/generateTrialChanges";
import { generateVersionChanges } from "../utils/generateVersionChanges";
import { SummaryItemRow } from "./SummaryItemRow";

interface UpdateSubscriptionSummaryProps {
	form: UseUpdateSubscriptionForm;
	customerProduct: FullCusProduct;
	currentVersion: number;
	currency?: string;
}

export function UpdateSubscriptionSummary({
	form,
	customerProduct,
	currentVersion,
	currency = "usd",
}: UpdateSubscriptionSummaryProps) {
	const formValues = useStore(form.store, (state) => state.values);

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

		return [...versionChanges, ...trialChanges];
	}, [
		formValues.removeTrial,
		formValues.trialLength,
		formValues.trialDuration,
		formValues.version,
		customerProduct,
		currentVersion,
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
